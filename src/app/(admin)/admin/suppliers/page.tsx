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

  return (
    <div className="admin-page animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="admin-page-heading">
        <div>
          <h1 className="text-2xl font-black tracking-tight">API Suppliers</h1>
          <p className="text-xs text-slate-400 mt-1">
            Verify supplier connectivity on demand and manage catalogue synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void fetchTelemetry(true)}
            disabled={checking}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>{checking ? "Checking..." : "Verify Connections"}</span>
          </button>

          <button
            onClick={handleSyncGames}
            disabled={syncingGames}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-[0_0_15px_rgba(255,46,147,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingGames ? "animate-spin" : ""}`} />
            <span>{syncingGames ? "Syncing..." : "Sync All Games"}</span>
          </button>
        </div>
      </div>

      {error && <div role="alert" className="admin-error">{error}</div>}
      {loading && <div className="admin-skeleton h-20 rounded-2xl" aria-label="Loading supplier configuration" />}
      {/* Supplier Cards Grid */}
      {data && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================= */}
        {/* VIZO SUPPLIER CARD */}
        {/* ========================================================= */}
        <div className="admin-supplier-detail-card rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-5 relative overflow-hidden shadow-sm">
          <div className="admin-supplier-detail-header flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black text-white">Vizo Direct API</span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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
              <p className="text-xs text-slate-400">
                Exclusive wholesale integration for Free Fire Global.
              </p>
              <p className="text-[11px] text-slate-500">
                {vizo?.status === "connected" || vizo?.status === "failed"
                  ? `Last checked ${new Date(data!.timestamp).toLocaleString()}`
                  : "Connection not checked"}
              </p>
              {vizo?.error && <p className="text-xs text-rose-400" role="alert">{vizo.error}</p>}
            </div>

            <div className="admin-supplier-latency shrink-0 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Ping Latency
              </span>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {vizo?.latencyMs != null ? `${vizo.latencyMs} ms` : "—"}
              </div>
            </div>
          </div>

          {/* Vizo Balance & Account Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[#08091a] border border-white/5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Reseller Balance
              </span>
              <div className="text-lg font-black text-emerald-400 mt-0.5">
                {vizo?.status === "connected" && vizo.reseller?.balance != null ? `$${Number(vizo.reseller.balance).toFixed(4)}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Reseller ID
              </span>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {vizo?.reseller?.id != null ? `#${vizo.reseller.id}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Username
              </span>
              <div className="text-sm font-mono font-bold text-pink-400 mt-0.5 truncate">
                {vizo?.reseller?.username || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Lifetime Spent
              </span>
              <div className="text-sm font-mono font-bold text-purple-400 mt-0.5">
                {vizo?.status === "connected" && vizo.reseller?.total_spent != null ? `$${Number(vizo.reseller.total_spent).toFixed(2)}` : "—"}
              </div>
            </div>
          </div>

          {/* Vizo Orders breakdown */}
          <div className="admin-supplier-facts space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Supplier Order Delivery History:</span>
              <span className="font-bold text-white">
                {vizo?.reseller ? <>{vizo.reseller.total_orders ?? "—"} total (
                <span className="text-emerald-400 font-bold">{vizo.reseller.success_orders ?? "—"} success</span>
                {(vizo.reseller.failed_orders ?? 0) > 0 && (
                  <span className="text-rose-400 font-bold ml-1">
                    , {vizo.reseller.failed_orders} failed
                  </span>
                )})</> : "Not checked"}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Base API Endpoint:</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {vizo?.baseUrl}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API Key Configured:</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {vizo?.apiKeyConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Card Actions */}
          <div className="admin-supplier-links pt-2 border-t border-white/5 flex items-center justify-between gap-2">
            <Link
              href="/admin/packages?supplier=vizo"
              className="text-xs font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1"
            >
              <span>Manage Vizo Packages</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/games/vizo/freefire_global"
              target="_blank"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <span>View Free Fire Page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ========================================================= */}
        {/* G2BULK SUPPLIER CARD */}
        {/* ========================================================= */}
        <div className="admin-supplier-detail-card rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-5 relative overflow-hidden shadow-sm">
          <div className="admin-supplier-detail-header flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black text-white">G2Bulk Direct API</span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    g2bulk?.status === "connected"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : g2bulk?.status === "failed"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      g2bulk?.status === "connected" ? "bg-emerald-400" : g2bulk?.status === "failed" ? "bg-rose-400" : "bg-slate-400"
                    }`}
                  />
                  {g2bulk?.status === "connected" ? "Connected" : g2bulk?.status === "failed" ? "Failed" : g2bulk?.status === "configured" ? "Configured" : "Unavailable"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct provider for PUBG Mobile, Mobile Legends & Valorant.
              </p>
              <p className="text-[11px] text-slate-500">
                {g2bulk?.status === "connected" || g2bulk?.status === "failed"
                  ? `Last checked ${new Date(data!.timestamp).toLocaleString()}`
                  : "Connection not checked"}
              </p>
              {g2bulk?.error && <p className="text-xs text-rose-400" role="alert">{g2bulk.error}</p>}
            </div>

            <div className="admin-supplier-latency shrink-0 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Ping Latency
              </span>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {g2bulk?.latencyMs != null ? `${g2bulk.latencyMs} ms` : "—"}
              </div>
            </div>
          </div>

          {/* G2Bulk Balance & Account Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[#08091a] border border-white/5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Wallet Balance
              </span>
              <div className="text-lg font-black text-emerald-400 mt-0.5">
                {g2bulk?.status === "connected" && g2bulk.reseller?.balance != null ? `$${Number(g2bulk.reseller.balance).toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                User ID
              </span>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {g2bulk?.reseller?.user_id || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Username
              </span>
              <div className="text-sm font-mono font-bold text-pink-400 mt-0.5 truncate">
                {g2bulk?.reseller?.username || "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Account Name
              </span>
              <div className="text-sm font-mono font-bold text-purple-400 mt-0.5 truncate">
                {g2bulk?.reseller?.first_name || "—"}
              </div>
            </div>
          </div>

          {/* G2Bulk Details breakdown */}
          <div className="admin-supplier-facts space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Direct Catalogue Sync:</span>
              <span className="font-bold text-emerald-400">
                Automated Direct Integration
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Base API Endpoint:</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {g2bulk?.baseUrl}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">API Key Configured:</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {g2bulk?.apiKeyConfigured ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Card Actions */}
          <div className="admin-supplier-links pt-2 border-t border-white/5 flex items-center justify-between gap-2">
            <Link
              href="/admin/packages?supplier=g2bulk"
              className="text-xs font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1"
            >
              <span>Manage G2Bulk Packages</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/games/g2bulk/pubgm"
              target="_blank"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <span>View PUBG Mobile Page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>}

      {/* Synchronization Tools Hub */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-4">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Database className="h-4 w-4 text-pink-400" />
            <span>Supplier Synchronization Controls</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronize upstream game products and packages from supplier wholesale catalogues directly into MongoDB Atlas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[#08091a] border border-white/5 space-y-3">
            <h3 className="font-bold text-white text-xs">
              1. Synchronize Games Catalogue
            </h3>
            <p className="text-xs text-slate-400">
              Discovers new games and categories from Vizo and G2Bulk without altering your custom images or descriptions.
            </p>
            <button
              onClick={handleSyncGames}
              disabled={syncingGames}
              className="admin-sync-action w-full py-2.5 px-4 rounded-xl bg-pink-500/20 hover:bg-pink-500 text-pink-300 hover:text-white border border-pink-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingGames ? "animate-spin" : ""}`} />
              <span>{syncingGames ? "Synchronizing Games..." : "Run Games Sync"}</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[#08091a] border border-white/5 space-y-3">
            <h3 className="font-bold text-white text-xs">
              2. Synchronize Packages & Wholesale Pricing
            </h3>
            <p className="text-xs text-slate-400">
              Refreshes wholesale supplier buying prices while preserving all configured customer selling prices.
            </p>
            <button
              onClick={handleSyncPackages}
              disabled={syncingPackages}
              className="admin-sync-action w-full py-2.5 px-4 rounded-xl bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
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
