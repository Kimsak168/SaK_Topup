"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Database,
} from "lucide-react";

interface VizoReseller {
  balance?: number | string;
  id?: number | string;
  username?: string;
  total_spent?: number | string;
  total_orders?: number;
  success_orders?: number;
  failed_orders?: number;
  [key: string]: unknown;
}

interface G2BulkReseller {
  balance?: number | string;
  user_id?: number | string;
  username?: string;
  first_name?: string;
  [key: string]: unknown;
}

interface WebBuilderReseller {
  balance?: number | string;
  available_cents?: number;
  reserved_cents?: number;
  [key: string]: unknown;
}

interface SupplierTelemetry {
  success: boolean;
  timestamp: string;
  vizo: {
    status: "connected" | "configured" | "unavailable" | "failed";
    latencyMs: number | null;
    baseUrl: string;
    apiKeyConfigured: boolean;
    reseller: VizoReseller | null;
    error: string | null;
  };
  g2bulk: {
    status: "connected" | "configured" | "unavailable" | "failed";
    latencyMs: number | null;
    baseUrl: string;
    apiKeyConfigured: boolean;
    reseller: G2BulkReseller | null;
    error: string | null;
  };
  webbuilder?: {
    status: "connected" | "configured" | "unavailable" | "failed";
    latencyMs: number | null;
    baseUrl: string;
    apiKeyConfigured: boolean;
    reseller: WebBuilderReseller | null;
    error: string | null;
  };
}

export default function AdminSuppliersPage() {
  const [data, setData] = useState<SupplierTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const configurationRequested = useRef(false);
  const [syncingGames, setSyncingGames] = useState(false);
  const [syncingPackages, setSyncingPackages] = useState(false);

  const fetchTelemetry = useCallback(async (verify = false) => {
    try {
      if (verify) setChecking(true);
      const res = await fetch("/api/admin/suppliers", {
        method: verify ? "POST" : "GET", cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SupplierTelemetry = await res.json();
      if (!verify) {
        try {
          const saved = sessionStorage.getItem("saksuuu_supplier_check");
          if (saved) {
            const previous = JSON.parse(saved) as SupplierTelemetry;
            const checkedAt = Date.parse(previous.timestamp);
            if (Number.isFinite(checkedAt) && Date.now() - checkedAt <= 10 * 60_000) {
              for (const key of ["vizo", "g2bulk"] as const) {
                if (json[key].apiKeyConfigured &&
                  (previous[key].status === "connected" || previous[key].status === "failed"))
                  json[key] = previous[key];
              }
              json.timestamp = previous.timestamp;
            }
          }
        } catch (cause) { console.error("Could not restore supplier verification:", cause); }
      } else {
        sessionStorage.setItem("saksuuu_supplier_check", JSON.stringify(json));
        window.dispatchEvent(new Event("saksuuu:supplier-status"));
      }
      setData(json);
      setError("");
    } catch (err) {
      console.error("Failed to load supplier telemetry:", err);
      setError(err instanceof Error ? err.message : "Supplier status is unavailable");
      toast.error("Failed to check supplier connectivity");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (configurationRequested.current) return;
    configurationRequested.current = true;
    void fetchTelemetry();
  }, [fetchTelemetry]);

  const handleSyncGames = async () => {
    try {
      setSyncingGames(true);
      toast.info("Starting catalogue synchronization from Vizo & G2Bulk...");
      const res = await fetch("/api/admin/sync/games", { method: "POST" });
      const json = await res.json();

      if (json.success) {
        toast.success(
          `Sync Complete: ${json.stats.totalImported} new, ${json.stats.totalUpdated} updated`
        );
      } else {
        toast.error(json.error || "Game sync failed");
      }
    } catch {
      toast.error("Network error during game synchronization");
    } finally {
      setSyncingGames(false);
    }
  };

  const handleSyncPackages = async () => {
    try {
      setSyncingPackages(true);
      toast.info("Starting packages & wholesale pricing sync...");
      const res = await fetch("/api/admin/sync/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyActiveGames: true }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(
          `Packages Sync Complete: ${json.stats.totalImported} imported, ${json.stats.totalUpdated} updated`
        );
      } else {
        toast.error(json.error || "Package sync failed");
      }
    } catch {
      toast.error("Network error during package synchronization");
    } finally {
      setSyncingPackages(false);
    }
  };

  const vizo = data?.vizo;
  const g2bulk = data?.g2bulk;
  const webbuilder = data?.webbuilder;

  return (
    <div className="admin-page">
      {/* Top Header */}
      <div className="admin-page-heading">
        <div>
          <h1>Suppliers</h1>
          <p className="admin-page-description">
            Verify supplier connectivity on demand and manage catalogue synchronization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchTelemetry(true)}
            disabled={checking}
            className="admin-button admin-button-secondary cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>{checking ? "Checking..." : "Verify Connections"}</span>
          </button>

          <button
            onClick={handleSyncGames}
            disabled={syncingGames}
            className="admin-button admin-button-primary cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingGames ? "animate-spin" : ""}`} />
            <span>{syncingGames ? "Syncing..." : "Sync All Games"}</span>
          </button>
        </div>
      </div>

      {error && <div role="alert" className="p-3.5 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 text-xs text-[#EF4444]">{error}</div>}
      {loading && <div className="h-20 rounded-xl bg-[#111A2B] border border-[#243047] animate-pulse" aria-label="Loading supplier configuration" />}
      {/* Supplier Cards Grid */}
      {data && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ========================================================= */}
        {/* WEBBUILDER SUPPLIER CARD */}
        {/* ========================================================= */}
        <div className="admin-panel admin-panel-stack">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2>WebBuilder</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] leading-4 font-medium ${
                    webbuilder?.status === "connected"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : webbuilder?.status === "failed"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      webbuilder?.status === "connected" ? "bg-emerald-400" : webbuilder?.status === "failed" ? "bg-rose-400" : "bg-slate-400"
                    }`}
                  />
                  {webbuilder?.status === "connected" ? "Connected" : webbuilder?.status === "failed" ? "Failed" : webbuilder?.status === "configured" ? "Configured" : "Unavailable"}
                </span>
              </div>
              <p className="text-[13px] text-[#94A3B8]">
                Free Fire, MLBB & HoK (Active)
              </p>
              <p className="text-[11px] text-slate-500">
                {webbuilder?.status === "connected" || webbuilder?.status === "failed"
                  ? `Last verified ${new Date(data!.timestamp).toLocaleString()}`
                  : "Last verified: Not checked"}
              </p>
            </div>
            {webbuilder?.latencyMs !== null && webbuilder?.latencyMs !== undefined && (
              <span className="text-xs font-mono text-slate-400">
                {webbuilder.latencyMs}ms
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs pt-1 border-t border-[#243047]">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Available balance</span>
              <span className="font-mono text-[#22C55E] font-bold">
                {webbuilder?.reseller?.balance !== undefined ? `$${Number(webbuilder.reseller.balance).toFixed(2)} USD` : "Not checked"}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Active games</span>
              <span className="font-mono text-slate-300 text-[11px]">
                Free Fire, MLBB, HoK
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API endpoint</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {webbuilder?.baseUrl}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API key configured</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {webbuilder?.apiKeyConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Card Actions */}
          <div className="admin-supplier-links pt-2 border-t border-[#243047] flex items-center justify-between gap-2">
            <Link
              href="/admin/packages?supplier=webbuilder"
              className="text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5"
            >
              <span>Manage packages</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/games/webbuilder/mlbb"
              target="_blank"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <span>MLBB page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ========================================================= */}
        {/* VIZO SUPPLIER CARD */}
        {/* ========================================================= */}
        <div className="admin-panel admin-panel-stack">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2>Vizo</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] leading-4 font-medium ${
                    vizo?.status === "connected"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : vizo?.status === "failed"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      vizo?.status === "connected" ? "bg-emerald-400" : vizo?.status === "failed" ? "bg-rose-400" : "bg-slate-400"
                    }`}
                  />
                  {vizo?.status === "connected" ? "Connected" : vizo?.status === "failed" ? "Failed" : vizo?.status === "configured" ? "Configured" : "Unavailable"}
                </span>
              </div>
              <p className="text-[13px] text-[#94A3B8]">
                Legacy API (Free Fire disabled)
              </p>
              <p className="text-[11px] text-slate-500">
                {vizo?.status === "connected" || vizo?.status === "failed"
                  ? `Last verified ${new Date(data!.timestamp).toLocaleString()}`
                  : "Last verified: Not checked"}
              </p>
              {vizo?.error && <p className="text-xs text-rose-400" role="alert">{vizo.error}</p>}
            </div>

            <div className="admin-supplier-latency shrink-0 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Response time
              </span>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {vizo?.latencyMs != null ? `${vizo.latencyMs} ms` : "—"}
              </div>
            </div>
          </div>

          {/* Vizo Balance & Account Stats */}
          <div className="admin-supplier-details">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Wallet Balance
              </span>
              <div>
                {vizo?.status === "connected" && vizo.reseller?.balance != null ? `$${Number(vizo.reseller.balance).toFixed(4)}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account ID
              </span>
              <div>
                {vizo?.reseller?.id != null ? `#${vizo.reseller.id}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account
              </span>
              <div>
                {vizo?.reseller?.username || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Lifetime Spent
              </span>
              <div>
                {vizo?.status === "connected" && vizo.reseller?.total_spent != null ? `$${Number(vizo.reseller.total_spent).toFixed(2)}` : "—"}
              </div>
            </div>
          </div>

          {/* Vizo Orders breakdown */}
          <div className="admin-supplier-facts space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Delivery history</span>
              <span className="font-bold text-white">
                {vizo?.reseller ? <>{vizo.reseller.total_orders ?? "—"} total (
                <span className="text-[#22C55E] font-bold">{vizo.reseller.success_orders ?? "—"} success</span>
                {(vizo.reseller.failed_orders ?? 0) > 0 && (
                  <span className="text-rose-400 font-bold ml-1">
                    , {vizo.reseller.failed_orders} failed
                  </span>
                )})</> : "Not checked"}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API endpoint</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {vizo?.baseUrl}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API key configured</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {vizo?.apiKeyConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Card Actions */}
          <div className="admin-supplier-links pt-2 border-t border-[#243047] flex items-center justify-between gap-2">
            <Link
              href="/admin/packages?supplier=vizo"
              className="text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5"
            >
              <span>Manage packages</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/games/vizo/freefire_global"
              target="_blank"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <span>View game page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ========================================================= */}
        {/* G2BULK SUPPLIER CARD */}
        {/* ========================================================= */}
        <div className="admin-panel admin-panel-stack">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2>G2Bulk</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] leading-4 font-medium ${
                    g2bulk?.status === "connected"
                      ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E] border border-[rgba(34,197,94,0.3)]"
                      : g2bulk?.status === "failed"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      g2bulk?.status === "connected" ? "bg-[#22C55E]" : g2bulk?.status === "failed" ? "bg-rose-400" : "bg-slate-400"
                    }`}
                  />
                  {g2bulk?.status === "connected" ? "Connected" : g2bulk?.status === "failed" ? "Failed" : g2bulk?.status === "configured" ? "Configured" : "Unavailable"}
                </span>
              </div>
              <p className="text-[13px] text-[#94A3B8]">
                Game top-up supplier
              </p>
              <p className="text-[11px] text-slate-500">
                {g2bulk?.status === "connected" || g2bulk?.status === "failed"
                  ? `Last verified ${new Date(data!.timestamp).toLocaleString()}`
                  : "Last verified: Not checked"}
              </p>
              {g2bulk?.error && <p className="text-xs text-rose-400" role="alert">{g2bulk.error}</p>}
            </div>

            <div className="admin-supplier-latency shrink-0 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Response time
              </span>
              <div className="text-sm font-mono font-bold text-[#22C55E]">
                {g2bulk?.latencyMs != null ? `${g2bulk.latencyMs} ms` : "—"}
              </div>
            </div>
          </div>

          {/* G2Bulk Balance & Account Stats */}
          <div className="admin-supplier-details">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Wallet Balance
              </span>
              <div>
                {g2bulk?.status === "connected" && g2bulk.reseller?.balance != null ? `$${Number(g2bulk.reseller.balance).toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account ID
              </span>
              <div>
                {g2bulk?.reseller?.user_id || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account
              </span>
              <div>
                {g2bulk?.reseller?.username || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account name
              </span>
              <div>
                {g2bulk?.reseller?.first_name || "—"}
              </div>
            </div>
          </div>

          {/* G2Bulk Details breakdown */}
          <div className="admin-supplier-facts space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Catalogue sync</span>
              <span className="font-medium text-[#F8FAFC]">
                Direct integration
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API endpoint</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {g2bulk?.baseUrl}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API key configured</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {g2bulk?.apiKeyConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Card Actions */}
          <div className="admin-supplier-links pt-2 border-t border-[#243047] flex items-center justify-between gap-2">
            <Link
              href="/admin/packages?supplier=g2bulk"
              className="text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5"
            >
              <span>Manage packages</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/games/g2bulk/pubgm"
              target="_blank"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <span>View game page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>}

      {/* Synchronization Tools Hub */}
      <div className="admin-panel admin-panel-stack">
        <div>
          <h2 className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0 text-[#94A3B8]" />
            <span>Catalogue synchronization</span>
          </h2>
          <p className="admin-page-description">
            Update supplier catalogues while preserving your storefront settings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-lg bg-[#151F31] border border-[#243047] space-y-3">
            <h3 className="text-[#F8FAFC]">
              Games catalogue
            </h3>
            <p className="text-xs text-slate-400">
              Discovers new games and categories from Vizo and G2Bulk without altering your custom images or descriptions.
            </p>
            <button
              onClick={handleSyncGames}
              disabled={syncingGames}
              className="w-full py-2 px-3 rounded-lg bg-[rgba(34,197,94,0.12)] hover:bg-[#22C55E] text-[#22C55E] hover:text-[#080D18] border border-[rgba(34,197,94,0.3)] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingGames ? "animate-spin" : ""}`} />
              <span>{syncingGames ? "Synchronizing Games..." : "Run Games Sync"}</span>
            </button>
          </div>

          <div className="p-4 rounded-lg bg-[#151F31] border border-[#243047] space-y-3">
            <h3 className="text-[#F8FAFC]">
              Packages & wholesale pricing
            </h3>
            <p className="text-xs text-slate-400">
              Refreshes wholesale supplier buying prices while preserving all configured customer selling prices.
            </p>
            <button
              onClick={handleSyncPackages}
              disabled={syncingPackages}
              className="w-full py-2 px-3 rounded-lg bg-[#111A2B] hover:bg-[#0C1322] text-[#F8FAFC] border border-[#243047] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingPackages ? "animate-spin" : ""}`} />
              <span>{syncingPackages ? "Synchronizing Packages..." : "Run Packages Sync"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
