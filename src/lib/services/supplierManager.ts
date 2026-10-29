import "server-only";

import mongoose from "mongoose";
import { AdminSession } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { getVngzzAccountProfile } from "@/lib/suppliers/vngzz2";
import { getG2BulkSmmBalance, testG2Bulk } from "@/lib/suppliers/g2bulk";
import { getWebBuilderBalance } from "@/lib/suppliers/webbuilder";
import { AdminAuditLog } from "@/models/AdminAuditLog";
import { SupplierBalanceSnapshot, SupplierWalletId } from "@/models/SupplierBalanceSnapshot";
import { SupplierConfiguration, SupplierId } from "@/models/SupplierConfiguration";

const CACHE_FRESH_MS = 5 * 60_000;
const refreshInFlight = new Map<SupplierId, Promise<BalanceEntry[]>>();

export interface BalanceEntry {
  walletId: SupplierWalletId;
  amount: string;
  currency: string;
}

interface SupplierDefinition {
  id: SupplierId;
  displayName: string;
  baseUrl: string;
  configured: boolean;
  credentials: string[];
  capabilities: string[];
  balanceScopes: string[];
  catalogModes: string[];
}

export const SUPPLIERS: SupplierDefinition[] = [
  {
    id: "vngzz2",
    displayName: "VngZz 2 Game",
    baseUrl: (process.env.VNGZZ2_GAME_BASE_URL || process.env.VNGZZ2_PAYMENT_BASE_URL || "https://www.vngzz2game.site/api").replace(/\/+$/, ""),
    configured: Boolean(process.env.VNGZZ2_GAME_API_KEY?.trim() || process.env.VNGZZ2_PRIMARY_API_KEY?.trim() || process.env.VNGZZ2_PAYMENT_API_KEY?.trim()),
    credentials: ["VNGZZ2_GAME_API_KEY", "VNGZZ2_PRIMARY_API_KEY", "VNGZZ2_PAYMENT_API_KEY"],
    capabilities: ["game", "smm"],
    balanceScopes: ["game", "smm"],
    catalogModes: ["game", "smm"],
  },
  {
    id: "g2bulk",
    displayName: "G2Bulk",
    baseUrl: (process.env.G2BULK_BASE_URL || "https://api.g2bulk.com/v1").replace(/\/+$/, ""),
    configured: Boolean(process.env.G2BULK_API_KEY?.trim()),
    credentials: ["G2BULK_API_KEY"],
    capabilities: ["game", "smm"],
    balanceScopes: ["smm"],
    catalogModes: ["game", "smm"],
  },
  {
    id: "webbuilder",
    displayName: "WebBuilder",
    baseUrl: (process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1").replace(/\/+$/, ""),
    configured: Boolean(process.env.WEBBUILDER_API_KEY?.trim()),
    credentials: ["WEBBUILDER_API_KEY"],
    capabilities: ["game"],
    balanceScopes: ["available", "reserved"],
    catalogModes: ["game"],
  },
];

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Supplier request failed.";
  return message
    .replace(/(?:api[_ -]?key|authorization|bearer)\s*[:=]?\s*[^\s,;]+/gi, "credential [redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .slice(0, 250);
}

function toAmountString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+(?:\.\d{1,8})?$/.test(value.trim())) return value.trim();
  return null;
}

function unwrap(payload: Record<string, unknown>): Record<string, unknown> {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    const child = current.data;
    if (!child || typeof child !== "object" || Array.isArray(child)) break;
    current = child as Record<string, unknown>;
  }
  return current;
}

function vngzzBalances(payload: Record<string, unknown>): BalanceEntry[] {
  const data = unwrap(payload);
  const entries: BalanceEntry[] = [];
  for (const [walletId, keys] of [
    ["game", ["balance", "game_balance"]],
    ["smm", ["balance_smm", "smm_balance"]],
  ] as const) {
    const raw = keys.map(key => data[key]).find(value => value !== undefined);
    const amount = toAmountString(raw);
    if (amount !== null) entries.push({ walletId, amount, currency: "USD" });
  }
  return entries;
}

function accountActor(session: AdminSession) {
  return { actorUsername: session.username, actorName: session.name };
}

function assertSupplierId(value: string): SupplierDefinition {
  const supplier = SUPPLIERS.find(item => item.id === value);
  if (!supplier) throw new Error("Unknown supplier account.");
  return supplier;
}

export async function listSupplierAccounts() {
  await connectDB();
  const [configs, latest] = await Promise.all([
    SupplierConfiguration.find({}).select("+lastError").lean(),
    SupplierBalanceSnapshot.aggregate([
      { $sort: { checkedAt: -1 } },
      { $group: { _id: { supplierId: "$supplierId", walletId: "$walletId" }, snapshot: { $first: "$$ROOT" } } },
    ]),
  ]);
  const configById = new Map(configs.map(config => [config.supplierId, config]));
  const balanceById = new Map<string, Record<string, unknown>[]>();
  for (const group of latest) {
    const key = String(group._id.supplierId);
    const list = balanceById.get(key) || [];
    const snapshot = group.snapshot as Record<string, unknown>;
    list.push({
      walletId: snapshot.walletId,
      amount: (snapshot.amount as mongoose.Types.Decimal128).toString(),
      currency: snapshot.currency,
      source: snapshot.source,
      checkedAt: snapshot.checkedAt,
      freshness: snapshot.source === "manual" ? "manual" : Date.now() - new Date(snapshot.checkedAt as Date).getTime() <= CACHE_FRESH_MS ? "live" : "cached",
    });
    balanceById.set(key, list);
  }
  return SUPPLIERS.map(supplier => {
    const config = configById.get(supplier.id);
    return {
      id: supplier.id,
      displayName: config?.displayName || supplier.displayName,
      enabled: config?.enabled ?? true,
      baseUrl: supplier.baseUrl,
      configured: supplier.configured,
      credentialVariables: supplier.credentials,
      capabilities: supplier.capabilities,
      catalogModes: supplier.catalogModes,
      balanceScopes: supplier.balanceScopes,
      status: !supplier.configured ? "unavailable" : (config?.lastConnectionStatus || "configured"),
      lastConnectionTestAt: config?.lastConnectionTestAt || null,
      lastBalanceSyncAt: config?.lastBalanceSyncAt || null,
      lastError: config?.lastError || null,
      balances: balanceById.get(supplier.id) || [],
    };
  });
}

async function persistStatus(supplierId: SupplierId, status: "connected" | "failed" | "unavailable", error?: string, balanceSync = false, session?: AdminSession) {
  await SupplierConfiguration.findOneAndUpdate(
    { supplierId },
    {
      $setOnInsert: { displayName: assertSupplierId(supplierId).displayName },
      $set: {
        lastConnectionStatus: status,
        lastConnectionTestAt: new Date(),
        ...(balanceSync ? { lastBalanceSyncAt: new Date() } : {}),
        lastError: error,
        ...(session ? { updatedBy: session.username } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function fetchBalances(supplierId: SupplierId): Promise<BalanceEntry[]> {
  switch (supplierId) {
    case "vngzz2": {
      const profile = await getVngzzAccountProfile();
      const entries = vngzzBalances(profile);
      if (!entries.length) throw new Error("VNGZZ2 account profile did not include documented balance fields.");
      return entries;
    }
    case "g2bulk": {
      const balance = await getG2BulkSmmBalance();
      return [{ walletId: "smm", amount: balance.balance, currency: balance.currency }];
    }
    case "webbuilder": {
      const balance = await getWebBuilderBalance();
      return [
        { walletId: "available", amount: (balance.available_cents / 100).toFixed(2), currency: "USD" },
        { walletId: "reserved", amount: (balance.reserved_cents / 100).toFixed(2), currency: "USD" },
      ];
    }
  }
}

export async function testSupplierConnection(supplierValue: string, session: AdminSession) {
  const supplier = assertSupplierId(supplierValue);
  await connectDB();
  if (!supplier.configured) {
    await persistStatus(supplier.id, "unavailable", "Required backend credential is not configured.", false, session);
    return { supplierId: supplier.id, status: "unavailable", error: "Required backend credential is not configured." };
  }
  try {
    if (supplier.id === "vngzz2") await getVngzzAccountProfile();
    else if (supplier.id === "g2bulk") await testG2Bulk();
    else await getWebBuilderBalance();
    await persistStatus(supplier.id, "connected", undefined, false, session);
    await AdminAuditLog.create({ ...accountActor(session), action: "supplier.connection_test", recordType: "supplier", recordId: supplier.id, summary: `Connection test succeeded for ${supplier.displayName}.` });
    return { supplierId: supplier.id, status: "connected", verifiedAt: new Date().toISOString() };
  } catch (error) {
    const message = safeError(error);
    await persistStatus(supplier.id, "failed", message, false, session);
    await AdminAuditLog.create({ ...accountActor(session), action: "supplier.connection_test", recordType: "supplier", recordId: supplier.id, summary: `Connection test failed for ${supplier.displayName}: ${message}` });
    throw new Error(message);
  }
}

export async function refreshSupplierBalance(supplierValue: string, session: AdminSession) {
  const supplier = assertSupplierId(supplierValue);
  await connectDB();
  if (!supplier.configured) throw new Error("Required backend credential is not configured.");
  const existing = refreshInFlight.get(supplier.id);
  if (existing) {
    const rows = await existing;
    return { supplierId: supplier.id, refreshed: false, balances: rows };
  }
  const task = (async () => {
    try {
      const rows = await fetchBalances(supplier.id);
      if (!rows.length || rows.some(row => !/^[A-Z]{3}$/.test(row.currency) || toAmountString(row.amount) === null)) {
        throw new Error("Supplier returned an invalid balance response.");
      }
      const checkedAt = new Date();
      await SupplierBalanceSnapshot.insertMany(rows.map(row => ({
        supplierId: supplier.id,
        walletId: row.walletId,
        amount: mongoose.Types.Decimal128.fromString(row.amount),
        currency: row.currency,
        source: "live",
        checkedAt,
        checkedBy: session.username,
      })));
      await persistStatus(supplier.id, "connected", undefined, true, session);
      await AdminAuditLog.create({ ...accountActor(session), action: "supplier.balance_sync", recordType: "supplier", recordId: supplier.id, summary: `Recorded ${rows.length} verified balance scope(s) for ${supplier.displayName}.` });
      return rows;
    } catch (error) {
      const message = safeError(error);
      await persistStatus(supplier.id, "failed", message, false, session);
      await AdminAuditLog.create({ ...accountActor(session), action: "supplier.balance_sync", recordType: "supplier", recordId: supplier.id, summary: `Balance sync failed for ${supplier.displayName}: ${message}` });
      throw new Error(message);
    } finally {
      refreshInFlight.delete(supplier.id);
    }
  })();
  refreshInFlight.set(supplier.id, task);
  return { supplierId: supplier.id, refreshed: true, balances: await task };
}

export async function recordManualSupplierBalance(input: {
  supplierId: string;
  walletId: string;
  amount: string;
  currency: string;
  confirmation: string;
}, session: AdminSession) {
  const supplier = assertSupplierId(input.supplierId);
  const walletId = input.walletId as SupplierWalletId;
  const allowedWallets: SupplierWalletId[] = ["game", "smm", "available", "reserved"];
  if (!allowedWallets.includes(walletId) || !supplier.balanceScopes.includes(walletId)) throw new Error("That balance scope is not supported for this supplier.");
  if (input.confirmation !== "RECORD MANUAL BALANCE") throw new Error("Manual balance confirmation phrase does not match.");
  if (!/^\d+(?:\.\d{1,4})?$/.test(input.amount) || !/^[A-Z]{3}$/.test(input.currency)) throw new Error("Balance amount or currency is invalid.");
  await connectDB();
  const checkedAt = new Date();
  await SupplierBalanceSnapshot.create({
    supplierId: supplier.id,
    walletId,
    amount: mongoose.Types.Decimal128.fromString(input.amount),
    currency: input.currency,
    source: "manual",
    checkedAt,
    checkedBy: session.username,
  });
  await AdminAuditLog.create({ ...accountActor(session), action: "supplier.balance_manual", recordType: "supplier", recordId: supplier.id, summary: `Manually recorded ${walletId} balance (${input.currency}) for ${supplier.displayName}.` });
  return { supplierId: supplier.id, walletId, amount: input.amount, currency: input.currency, source: "manual", checkedAt: checkedAt.toISOString() };
}

export function isSupplierId(value: string): value is SupplierId {
  return SUPPLIERS.some(supplier => supplier.id === value);
}
