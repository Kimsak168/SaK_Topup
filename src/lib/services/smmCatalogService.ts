import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import { getVngzzSmmServiceSnapshot, type VngzzSmmServiceCandidate } from "@/lib/suppliers/vngzz2";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { SmmCatalogAudit } from "@/models/SmmCatalogAudit";
import { SmmCatalogBackup } from "@/models/SmmCatalogBackup";
import { SmmService, type ISmmService, type SmmPlatform, type SmmServiceType } from "@/models/SmmService";
import { getSmmDuplicateKeys } from "./smmPublicCatalogService";

export { SMM_CUSTOMER_MARGIN } from "@/lib/services/smmPricing";

export const SMM_PAGE_LIMIT = 250;

const PLATFORM_ALIASES: Record<string, SmmPlatform> = {
  tiktok: "tiktok", "tik tok": "tiktok",
  telegram: "telegram", tg: "telegram",
  facebook: "facebook", fb: "facebook",
  instagram: "instagram", ig: "instagram",
  youtube: "youtube", yt: "youtube",
  other: "other",
};

const SERVICE_CATEGORIES: Record<SmmServiceType, string> = {
  followers: "Followers / Members / Subscribers",
  likes: "Likes / Reactions",
  views: "Views",
  comments: "Comments",
  shares: "Shares / Saves",
  other: "Other Services",
};

async function backupSmmRecords(
  action: "sync" | "cleanup",
  actor: string,
  planHash: string,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return 0;
  const operationId = randomUUID();
  const batches = [];
  for (let index = 0; index < rows.length; index += 250) {
    batches.push({
      operationId,
      action,
      actor,
      planHash,
      batchNumber: batches.length,
      records: rows.slice(index, index + 250),
    });
  }
  await SmmCatalogBackup.insertMany(batches, { ordered: true });
  return rows.length;
}

export interface PreparedSmmService {
  supplier: "vngzz2";
  supplierServiceId: string;
  name: string;
  category: string;
  serviceType: SmmServiceType;
  platform: SmmPlatform;
  description: string;
  sourceCategory: string;
  sourceDescription: string;
  rate: number | null;
  min: number | null;
  max: number | null;
  refill: boolean | null;
  supplierAvailable: boolean;
  isValid: boolean;
  requiresReview: boolean;
  reviewFlags: string[];
  fingerprint: string;
}

function normalizeText(value: string | undefined | null) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePlatform(candidate: VngzzSmmServiceCandidate, text: string) {
  const raw = normalizeText(candidate.platform).toLowerCase().replace(/[_-]+/g, " ");
  const explicit = PLATFORM_ALIASES[raw];
  if (explicit) return { platform: explicit, issue: "" };
  if (raw) return { platform: "other" as const, issue: "unrecognized_platform" };
  const found = Object.keys(PLATFORM_ALIASES).find((alias) => alias.length > 2 && text.toLowerCase().includes(alias));
  return { platform: found ? PLATFORM_ALIASES[found] : "other", issue: "" };
}

function normalizeServiceType(candidate: VngzzSmmServiceCandidate): SmmServiceType {
  const text = `${candidate.type || ""} ${candidate.category || ""} ${candidate.name || ""} ${candidate.description || ""}`.toLowerCase();
  if (/follower|member|subscriber/.test(text)) return "followers";
  if (/like|reaction|favorite|favourite/.test(text)) return "likes";
  if (/view|impression/.test(text)) return "views";
  if (/comment/.test(text)) return "comments";
  if (/share|save|bookmark/.test(text)) return "shares";
  return "other";
}

function conciseDescription(value: string | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}…` : normalized;
}

function fingerprintOf(service: Pick<PreparedSmmService, "platform" | "serviceType" | "name">) {
  return `${service.platform}|${service.serviceType}|${normalizeText(service.name).toLocaleLowerCase()}`;
}

export function prepareSmmService(candidate: VngzzSmmServiceCandidate): PreparedSmmService {
  const name = normalizeText(candidate.name);
  const supplierServiceId = candidate.service;
  const serviceType = normalizeServiceType(candidate);
  const platformResult = normalizePlatform(candidate, `${candidate.name} ${candidate.category} ${candidate.description || ""}`);
  const reviewFlags = [...candidate.issues];
  const validRate = typeof candidate.rate === "number" && Number.isFinite(candidate.rate) && candidate.rate > 0 && candidate.rate <= Number.MAX_SAFE_INTEGER;
  if (!validRate && !reviewFlags.includes("invalid_rate")) reviewFlags.push("invalid_rate");
  if (platformResult.issue && !reviewFlags.includes(platformResult.issue)) reviewFlags.push(platformResult.issue);

  const validId = Boolean(supplierServiceId && supplierServiceId.trim() && supplierServiceId === supplierServiceId.trim());
  const validName = Boolean(name);
  const validMin = Number.isSafeInteger(candidate.min) && (candidate.min || 0) > 0;
  const validMax = Number.isSafeInteger(candidate.max) && (candidate.max || 0) >= (candidate.min || 0);
  const isValid = validId && validName && validRate && validMin && validMax && candidate.supplierAvailable;
  const requiresReview = reviewFlags.length > 0 || !isValid;
  const service: PreparedSmmService = {
    supplier: "vngzz2",
    supplierServiceId,
    name,
    category: SERVICE_CATEGORIES[serviceType],
    serviceType,
    platform: platformResult.platform,
    description: conciseDescription(candidate.description),
    sourceCategory: normalizeText(candidate.category),
    sourceDescription: normalizeText(candidate.description).slice(0, 2000),
    rate: candidate.rate,
    min: candidate.min,
    max: candidate.max,
    refill: candidate.refill ?? null,
    supplierAvailable: candidate.supplierAvailable,
    isValid,
    requiresReview,
    reviewFlags,
    fingerprint: "",
  };
  service.fingerprint = fingerprintOf(service);
  return service;
}

export interface SmmSyncPlan {
  generatedAt: string;
  hash: string;
  sourceCount: number;
  validCount: number;
  invalidCount: number;
  unavailableCount: number;
  duplicateSupplierIdCount: number;
  duplicateNameCount: number;
  manualReviewCount: number;
  services: PreparedSmmService[];
}

export function createSmmSyncPlan(snapshot: { total: number; services: VngzzSmmServiceCandidate[] }): SmmSyncPlan {
  const prepared = snapshot.services.map(prepareSmmService);
  const idCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  for (const service of prepared) {
    idCounts.set(service.supplierServiceId, (idCounts.get(service.supplierServiceId) || 0) + 1);
    nameCounts.set(service.fingerprint, (nameCounts.get(service.fingerprint) || 0) + 1);
  }
  for (const service of prepared) {
    if (idCounts.get(service.supplierServiceId) !== 1) service.reviewFlags.push("duplicate_supplier_id");
    if (nameCounts.get(service.fingerprint) !== 1) service.reviewFlags.push("possible_duplicate_name_manual_review");
    service.requiresReview = service.reviewFlags.length > 0 || !service.isValid;
  }
  const stable = prepared
    .map((service) => ({ ...service, reviewFlags: [...service.reviewFlags].sort() }))
    .sort((a, b) => a.supplierServiceId.localeCompare(b.supplierServiceId));
  const hash = createHash("sha256").update(JSON.stringify({ total: snapshot.total, services: stable })).digest("hex");
  return {
    generatedAt: new Date().toISOString(),
    hash,
    sourceCount: snapshot.total,
    validCount: prepared.filter((service) => service.isValid && !service.requiresReview).length,
    invalidCount: prepared.filter((service) => !service.isValid).length,
    unavailableCount: prepared.filter((service) => !service.supplierAvailable).length,
    duplicateSupplierIdCount: prepared.filter((service) => service.reviewFlags.includes("duplicate_supplier_id")).length,
    duplicateNameCount: prepared.filter((service) => service.reviewFlags.includes("possible_duplicate_name_manual_review")).length,
    manualReviewCount: prepared.filter((service) => service.requiresReview).length,
    services: prepared,
  };
}

export async function previewSmmSupplierSync(forceRefresh = true) {
  const snapshot = await getVngzzSmmServiceSnapshot(forceRefresh);
  if (snapshot.total === 0 || snapshot.services.length === 0) {
    throw new Error("The supplier returned an empty or unrecognized SMM catalog; no changes were planned.");
  }
  return createSmmSyncPlan(snapshot);
}

export async function applySmmSupplierSync(actor: string, expectedHash: string) {
  const plan = await previewSmmSupplierSync(true);
  if (expectedHash !== plan.hash) {
    return { conflict: true as const, plan };
  }
  await connectDB();

  const ambiguousIds = new Set(plan.services.filter((item) => item.reviewFlags.includes("duplicate_supplier_id")).map((item) => item.supplierServiceId));
  const seenIds = [...new Set(plan.services.map((item) => item.supplierServiceId).filter(Boolean))];
  const servicesById = new Map<string, PreparedSmmService>();
  for (const service of plan.services) {
    if (service.supplierServiceId && !ambiguousIds.has(service.supplierServiceId)) servicesById.set(service.supplierServiceId, service);
  }

  const records = [...servicesById.values()];
  const rowsToBackup = await SmmService.find({
    supplier: "vngzz2",
    $or: [
      { supplierServiceId: { $in: seenIds } },
      { supplierServiceId: { $nin: seenIds }, supplierAvailable: { $ne: false } },
    ],
  }).select("+rate +sourceCategory +sourceDescription").lean();
  const backedUpRecords = await backupSmmRecords("sync", actor, plan.hash, rowsToBackup as unknown as Record<string, unknown>[]);
  await SmmService.collection.createIndex({ supplier: 1, supplierServiceId: 1 }, { unique: true, name: "uniq_smm_supplier_service" });
  const referencedIds = new Set(await Order.distinct("supplierProductCode", {
    serviceType: "smm",
    supplier: "vngzz2",
    supplierProductCode: { $in: records.map((record) => record.supplierServiceId) },
  }));
  const now = new Date();
  const operations = records.map((record) => {
    const { isValid, requiresReview, reviewFlags, supplier, supplierServiceId, ...fields } = record;
    return {
      updateOne: {
        filter: { supplier: "vngzz2" as const, supplierServiceId },
        update: {
          $set: {
            ...fields,
            requiresReview,
            reviewFlags,
            supplierAvailable: isValid && record.supplierAvailable,
            syncedAt: now,
          },
          $setOnInsert: {
            supplier,
            supplierServiceId,
            isActive: isValid && !requiresReview,
          },
        },
        upsert: true,
      },
    };
  });
  if (operations.length) await SmmService.bulkWrite(operations, { ordered: false });

  const invalidSupplierIds = records.filter((record) => !record.isValid || record.requiresReview).map((record) => record.supplierServiceId);
  if (invalidSupplierIds.length) {
    await SmmService.updateMany(
      { supplier: "vngzz2", supplierServiceId: { $in: invalidSupplierIds } },
      { $set: { isActive: false } }
    );
  }

  let staleRecordsMarkedUnavailable = 0;
  if (seenIds.length) {
    await SmmService.updateMany(
      { supplier: "vngzz2", supplierServiceId: { $in: [...ambiguousIds] } },
      { $set: { supplierAvailable: false, isActive: false, requiresReview: true, reviewFlags: ["duplicate_supplier_id"], syncedAt: now } }
    );
    const staleUpdate = await SmmService.updateMany(
      { supplier: "vngzz2", supplierServiceId: { $nin: seenIds }, supplierAvailable: { $ne: false } },
      { $set: { supplierAvailable: false, syncedAt: now } }
    );
    staleRecordsMarkedUnavailable = staleUpdate.modifiedCount;
  }

  const summary = {
    sourceCount: plan.sourceCount,
    importedOrUpdated: records.length,
    invalid: plan.invalidCount,
    unavailable: plan.unavailableCount,
    duplicateSupplierIds: plan.duplicateSupplierIdCount,
    duplicateNamesForReview: plan.duplicateNameCount,
    orderReferencedServicesPreserved: referencedIds.size,
    staleRecordsMarkedUnavailable,
    backedUpRecords,
  };
  await SmmCatalogAudit.create({ action: "sync", actor, planHash: plan.hash, summary });
  return { conflict: false as const, plan, summary };
}

export async function getSmmCleanupPlan() {
  await connectDB();
  const rows = await SmmService.find({}).select("+rate +sourceCategory +sourceDescription").lean();
  const ids = rows.map((row) => row.supplierServiceId).filter(Boolean);
  const orderGroups = ids.length ? await Order.aggregate([
    { $match: { serviceType: "smm", supplier: "vngzz2", supplierProductCode: { $in: ids } } },
    { $group: { _id: "$supplierProductCode", count: { $sum: 1 }, orderNumbers: { $addToSet: "$orderNumber" } } },
  ]) : [];
  const orderRefs = new Map<string, { count: number; paymentCount: number }>();
  const orderNumbers = orderGroups.flatMap((group: { orderNumbers?: string[] }) => group.orderNumbers || []).filter(Boolean);
  const paymentGroups = orderNumbers.length ? await Payment.aggregate([
    { $match: { orderNumber: { $in: orderNumbers } } },
    { $group: { _id: "$orderNumber", count: { $sum: 1 } } },
  ]) : [];
  const paymentsByOrder = new Map(paymentGroups.map((group: { _id: string; count: number }) => [String(group._id), group.count]));
  for (const group of orderGroups) {
    const paymentCount = (group.orderNumbers || []).reduce((count: number, orderNumber: string) => count + (paymentsByOrder.get(String(orderNumber)) || 0), 0);
    orderRefs.set(String(group._id), { count: group.count, paymentCount });
  }
  const idCounts = new Map<string, number>();
  const fingerprints = new Map<string, number>();
  for (const row of rows) {
    idCounts.set(row.supplierServiceId, (idCounts.get(row.supplierServiceId) || 0) + 1);
    fingerprints.set(row.fingerprint, (fingerprints.get(row.fingerprint) || 0) + 1);
  }
  const entries = rows.map((row) => {
    const current = {
      name: row.name,
      description: row.description || "",
      category: row.category,
      platform: row.platform,
    };
    const proposed = {
      name: normalizeText(row.name),
      description: conciseDescription(row.description),
      category: SERVICE_CATEGORIES[row.serviceType],
      platform: row.platform,
    };
    const changes = Object.fromEntries(Object.entries(proposed).filter(([key, value]) => current[key as keyof typeof current] !== value));
    const reference = orderRefs.get(row.supplierServiceId);
    const orderReferenced = Boolean(reference);
    const duplicateId = (idCounts.get(row.supplierServiceId) || 0) > 1;
    const duplicateName = (fingerprints.get(row.fingerprint) || 0) > 1;
    const valid = Boolean(row.supplierServiceId && row.name && row.rate && row.rate > 0 && row.rate <= Number.MAX_SAFE_INTEGER && Number.isSafeInteger(row.min) && (row.min || 0) > 0 && Number.isSafeInteger(row.max) && (row.max || 0) >= (row.min || 0));
    const safeToApply = Object.keys(changes).length > 0 && !duplicateId && !duplicateName && !orderReferenced && valid && !row.requiresReview;
    return {
      id: String(row._id),
      updatedAt: row.updatedAt,
      supplierServiceId: row.supplierServiceId,
      name: row.name,
      status: !valid ? "invalid" : duplicateId ? "duplicate" : row.supplierAvailable ? (row.isActive ? "active" : "inactive") : "unavailable",
      orderReferenced,
      orderReferences: reference?.count || 0,
      paymentReferences: reference?.paymentCount || 0,
      duplicateId,
      duplicateName,
      current,
      proposed,
      changes,
      safeToApply,
      reviewFlags: row.reviewFlags || [],
    };
  });
  const plan = entries.map(({ id, updatedAt, current, proposed, safeToApply }) => ({ id, updatedAt, current, proposed, safeToApply }));
  const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  return {
    generatedAt: new Date().toISOString(),
    hash,
    total: rows.length,
    counts: {
      valid: entries.filter((entry) => entry.status === "active" || entry.status === "inactive").length,
      duplicates: entries.filter((entry) => entry.duplicateId || entry.duplicateName).length,
      invalid: entries.filter((entry) => entry.status === "invalid").length,
      unavailable: entries.filter((entry) => entry.status === "unavailable").length,
      manualReview: entries.filter((entry) => entry.reviewFlags.length > 0 || entry.orderReferenced).length,
      proposedChanges: entries.filter((entry) => Object.keys(entry.changes).length > 0).length,
      safeToApply: entries.filter((entry) => entry.safeToApply).length,
    },
    entries,
  };
}

export async function applySmmCleanup(actor: string, expectedHash: string) {
  const plan = await getSmmCleanupPlan();
  if (plan.hash !== expectedHash) return { conflict: true as const, plan };
  const safeEntries = plan.entries.filter((entry) => entry.safeToApply);
  const ids = safeEntries.map((entry) => entry.id);
  const rowsToBackup = ids.length
    ? await SmmService.find({ _id: { $in: ids } }).select("+rate +sourceCategory +sourceDescription").lean()
    : [];
  const backedUpRecords = await backupSmmRecords("cleanup", actor, plan.hash, rowsToBackup as unknown as Record<string, unknown>[]);
  let updated = 0;
  let skippedForConflict = 0;
  for (const entry of safeEntries) {
    const set = Object.fromEntries(Object.entries(entry.changes).map(([key, value]) => [key, value]));
    const result = await SmmService.updateOne(
      { _id: entry.id, supplier: "vngzz2", supplierServiceId: entry.supplierServiceId, updatedAt: entry.updatedAt },
      { $set: set },
      { runValidators: true }
    );
    updated += result.modifiedCount;
    if (result.matchedCount === 0) skippedForConflict += 1;
  }
  const summary = { proposed: plan.counts.proposedChanges, updated, backedUpRecords, skippedForSafety: plan.counts.proposedChanges - plan.counts.safeToApply, skippedForConflict };
  await SmmCatalogAudit.create({ action: "cleanup", actor, planHash: plan.hash, summary });
  return { conflict: false as const, plan, summary };
}

export async function getSmmAdminStats() {
  await connectDB();
  const duplicates = await getSmmDuplicateKeys();
  const validActiveFilter = {
    isActive: true,
    supplierAvailable: true,
    requiresReview: false,
    reviewFlags: { $size: 0 },
    rate: { $type: "number", $gt: 0, $lte: Number.MAX_SAFE_INTEGER },
    min: { $type: "number", $gt: 0, $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
    max: { $type: "number", $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
    name: { $type: "string", $ne: "" },
    category: { $type: "string", $ne: "" },
    platform: { $in: ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"] },
    serviceType: { $in: ["followers", "likes", "views", "comments", "shares", "other"] },
    supplierServiceId: { $type: "string", $ne: "", $nin: duplicates.supplierServiceIds },
    fingerprint: { $type: "string", $ne: "", $nin: duplicates.fingerprints },
    $expr: { $gte: ["$max", "$min"] },
  } as never;
  const [total, active, inactive, unavailable, manualReview] = await Promise.all([
    SmmService.countDocuments(),
    SmmService.countDocuments(validActiveFilter),
    SmmService.countDocuments({ isActive: false, supplierAvailable: true }),
    SmmService.countDocuments({ supplierAvailable: false }),
    SmmService.countDocuments({ $or: [{ requiresReview: true }, { reviewFlags: { $ne: [] } }] }),
  ]);
  return { total, active, inactive, unavailable, manualReview, duplicateGroups: duplicates.fingerprints.length };
}

export function isSmmServiceActivatable(service: Pick<ISmmService, "supplierServiceId" | "name" | "category" | "platform" | "serviceType" | "fingerprint" | "rate" | "min" | "max" | "supplierAvailable" | "requiresReview" | "reviewFlags">) {
  return Boolean(
    service.supplierServiceId?.trim() && service.supplierServiceId === service.supplierServiceId.trim() && service.name?.trim() && service.category?.trim() &&
    ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"].includes(service.platform) &&
    ["followers", "likes", "views", "comments", "shares", "other"].includes(service.serviceType) && service.fingerprint?.trim() &&
    typeof service.rate === "number" && Number.isFinite(service.rate) && service.rate > 0 &&
    Number.isSafeInteger(service.min) && (service.min || 0) > 0 && Number.isSafeInteger(service.max) && (service.max || 0) >= (service.min || 0) &&
    service.rate <= Number.MAX_SAFE_INTEGER && service.supplierAvailable && !service.requiresReview && (!Array.isArray(service.reviewFlags) || service.reviewFlags.length === 0)
  );
}
