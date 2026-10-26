"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Database,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
} from "lucide-react";

interface WebBuilderReseller {
  balance?: number | string;
  available_cents?: number;
  reserved_cents?: number;
  [key: string]: unknown;
}

interface SupplierTelemetry {
  success: boolean;
  timestamp: string;
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
        method: verify ? "POST" : "GET",
        cache: "no-store",
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
              if (
                json.webbuilder?.apiKeyConfigured &&
                previous.webbuilder &&
                (previous.webbuilder.status === "connected" || previous.webbuilder.status === "failed")
              ) {
                json.webbuilder = previous.webbuilder;
              }
              json.timestamp = previous.timestamp;
            }
          }
        } catch (cause) {
          console.error("Could not restore supplier verification:", cause);
        }
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
      toast.info("Starting catalogue synchronization from WebBuilder...");
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
      toast.info("Starting packages & wholesale pricing sync from WebBuilder...");
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

  const webbuilder = data?.webbuilder;

  return (
    <div className="admin-page">
      {/* Top Header */}
      <div className="admin-page-heading">
        <div>
          <h1>Supplier Integration</h1>
          <p className="admin-page-description">
            WebBuilder is your active automated fulfillment provider for all direct game top-ups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchTelemetry(true)}
            disabled={checking}
            className="admin-button admin-button-secondary cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>{checking ? "Checking..." : "Verify Connection"}</span>
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

      {error && (
        <div role="alert" className="p-3.5 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 text-xs text-[#EF4444]">
          {error}
        </div>
      )}

      {loading && (
        <div className="h-28 rounded-xl bg-[#111A2B] border border-[#243047] animate-pulse" aria-label="Loading supplier configuration" />
      )}

      {/* Supplier Card */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 admin-panel admin-panel-stack">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Server className="h-4 w-4 text-[#22C55E]" />
                    <span>WebBuilder Reseller API</span>
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] leading-4 font-semibold ${
                      webbuilder?.status === "connected"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : webbuilder?.status === "failed"
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        webbuilder?.status === "connected"
                          ? "bg-emerald-400"
                          : webbuilder?.status === "failed"
                          ? "bg-rose-400"
                          : "bg-slate-400"
                      }`}
                    />
                    {webbuilder?.status === "connected"
                      ? "Connected"
                      : webbuilder?.status === "failed"
                      ? "Failed"
                      : webbuilder?.status === "configured"
                      ? "Configured"
                      : "Unavailable"}
                  </span>
                </div>
                <p className="text-[13px] text-[#94A3B8]">
                  Primary automated fulfillment supplier (Free Fire, MLBB, HoK, PUBG Mobile, Blood Strike, Magic Chess, 8 Ball Pool)
                </p>
                <p className="text-[11px] text-slate-500">
                  {webbuilder?.status === "connected" || webbuilder?.status === "failed"
                    ? `Last verified ${new Date(data!.timestamp).toLocaleString()}`
                    : "Last verified: Not checked"}
                </p>
                {webbuilder?.error && (
                  <p className="text-xs text-rose-400 pt-1" role="alert">
                    {webbuilder.error}
                  </p>
                )}
              </div>

              {webbuilder?.latencyMs !== null && webbuilder?.latencyMs !== undefined && (
                <div className="text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Response time</span>
                  <div className="text-sm font-mono font-bold text-emerald-400">
                    {webbuilder.latencyMs} ms
                  </div>
                </div>
              )}
            </div>

            {/* Wallet Balances */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-[#243047]">
              <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Available Balance</span>
                <span className="font-mono text-base font-bold text-[#22C55E]">
                  {webbuilder?.reseller?.balance !== undefined
                    ? `$${Number(webbuilder.reseller.balance).toFixed(2)} USD`
                    : "Not checked"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Reserved Funds</span>
                <span className="font-mono text-base font-bold text-amber-400">
                  {webbuilder?.reseller?.reserved_cents !== undefined
                    ? `$${(Number(webbuilder.reseller.reserved_cents) / 100).toFixed(2)} USD`
                    : "—"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047] col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">API Authentication</span>
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
                  {webbuilder?.apiKeyConfigured ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" />
                      <span>API Key Active</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                      <span>Missing Key</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Technical Details */}
            <div className="space-y-2 text-xs pt-2 border-t border-[#243047]">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">API Endpoint</span>
                <span className="font-mono text-slate-400 text-[11px]">{webbuilder?.baseUrl}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Catalog Coverage</span>
                <span className="font-mono text-slate-300 text-[11px]">
                  Free Fire (KHSGMY), Mobile Legends, Honor of Kings, PUBG Mobile, Blood Strike, Magic Chess, 8 Ball Pool
                </span>
              </div>
            </div>

            {/* Card Actions */}
            <div className="admin-supplier-links pt-2 border-t border-[#243047] flex items-center justify-between gap-2">
              <Link
                href="/admin/packages"
                className="text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5"
              >
                <span>Manage all packages</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <div className="flex items-center gap-3">
                <Link
                  href="/games/webbuilder/freefire_khsgmy"
                  target="_blank"
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <span>Free Fire</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <Link
                  href="/games/webbuilder/mlbb"
                  target="_blank"
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <span>MLBB</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <Link
                  href="/games/webbuilder/hok"
                  target="_blank"
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <span>HoK</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Info Box */}
          <div className="admin-panel admin-panel-stack space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#22C55E]" />
              <span>Direct Supplier Benefits</span>
            </h3>

            <ul className="text-xs text-[#94A3B8] space-y-2.5">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                <span>Single integration eliminates multi-supplier timeouts and fragmented order flows.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                <span>Automated instant nickname check for Free Fire, MLBB, HoK, and PUBG Mobile.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                <span>Atomic idempotency keys prevent double-charging or duplicate diamond fulfillment.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                <span>Private wholesale costs with full margin control over customer selling prices.</span>
              </li>
            </ul>

            <div className="pt-3 border-t border-[#243047]">
              <Link
                href="/admin/games"
                className="w-full py-2 px-3 rounded-lg bg-[#151F31] hover:bg-[#1C283F] border border-[#243047] text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <span>View Games Catalog</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Synchronization Tools Hub */}
      <div className="admin-panel admin-panel-stack mt-5">
        <div>
          <h2 className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0 text-[#94A3B8]" />
            <span>Catalogue synchronization</span>
          </h2>
          <p className="admin-page-description">
            Update live products and prices from WebBuilder while preserving your custom images and margins.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-lg bg-[#151F31] border border-[#243047] space-y-3">
            <h3 className="text-[#F8FAFC]">Games catalogue</h3>
            <p className="text-xs text-slate-400">
              Synchronizes active games without altering your custom images or descriptions.
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
            <h3 className="text-[#F8FAFC]">Packages &amp; wholesale pricing</h3>
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
