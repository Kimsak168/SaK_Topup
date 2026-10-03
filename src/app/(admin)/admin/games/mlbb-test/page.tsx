"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Gamepad2,
  Check,
  Package,
} from "lucide-react";
import { toast } from "sonner";

interface ValidationResult {
  success: boolean;
  playerName?: string;
  message?: string;
}

interface ProductReport {
  productCode: string;
  name: string;
  validation: ValidationResult;
  regionalNotes: string;
  packageCount: number;
  samplePackages: Array<{ id: number; name: string; wholesaleCost: number }>;
  isRecommendedForCambodia: boolean;
}

interface TestReport {
  mlbb: ProductReport;
  mlbb_global: ProductReport;
  testedAccount: { userId: string; serverId: string };
  conclusion: string;
}

export default function MLBBTestPage() {
  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [report, setReport] = useState<TestReport | null>(null);
  const [configuredSuccess, setConfiguredSuccess] = useState<string | null>(null);

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      toast.error("Please enter your Mobile Legends User ID");
      return;
    }
    if (!serverId.trim()) {
      toast.error("Please enter your Zone / Server ID");
      return;
    }

    try {
      setIsLoading(true);
      setReport(null);
      setConfiguredSuccess(null);

      const res = await fetch("/api/admin/games/mlbb-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          serverId: serverId.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.report) {
        setReport(data.report);
        toast.success("Validation inquiry completed with G2Bulk API!");
      } else {
        toast.error(data.error || "Failed to run validation test");
      }
    } catch {
      toast.error("Network error communicating with test validator");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyConfiguration = async (targetProductCode: "mlbb" | "mlbb_global") => {
    try {
      setIsConfiguring(true);
      const res = await fetch("/api/admin/games/mlbb-configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProductCode }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message);
        setConfiguredSuccess(data.message);
      } else {
        toast.error(data.error || "Configuration failed");
      }
    } catch {
      toast.error("Network error applying configuration");
    } finally {
      setIsConfiguring(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8 animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/admin/games" className="hover:text-pink-400 flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back to Games Catalog</span>
            </Link>
            <span>/</span>
            <span className="text-white font-semibold">MLBB Cambodian Verification</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Gamepad2 className="h-7 w-7 text-pink-500" />
            <span>Mobile Legends: Cambodian Account Compatibility</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Direct real-time comparison between G2Bulk products <strong className="text-pink-400 font-mono">mlbb</strong> and <strong className="text-cyan-400 font-mono">mlbb_global</strong>. Validates account compatibility without spending wallet balance or creating real orders.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-bold shrink-0">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Zero Balance Spent</span>
        </div>
      </div>

      {/* Test Form */}
      <div className="rounded-3xl border border-white/10 bg-[#0c0e24] p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>Secure Local Test Form</span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/30">
              Sandboxed Check
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Enter your Cambodian Mobile Legends account details below. Both G2Bulk products will be queried simultaneously.
          </p>
        </div>

        <form onSubmit={handleRunTest} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-5 space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full rounded-xl border border-white/10 bg-[#08091a] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none font-mono"
            />
          </div>

          <div className="sm:col-span-4 space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Zone ID / Server ID
            </label>
            <input
              type="text"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              placeholder="e.g. 1234"
              className="w-full rounded-xl border border-white/10 bg-[#08091a] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none font-mono"
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 text-white font-bold text-xs shadow-[0_0_20px_rgba(255,46,147,0.3)] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Test Compatibility</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results Comparison Report */}
      {report && (
        <div className="space-y-6 animate-in fade-in">
          {/* Conclusion Banner */}
          <div
            className={`p-5 rounded-2xl border flex items-start gap-3.5 ${
              report.mlbb.validation.success
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
            }`}
          >
            {report.mlbb.validation.success ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <h3 className="font-extrabold text-white text-sm">
                Compatibility Test Outcome
              </h3>
              <p className="text-xs leading-relaxed">{report.conclusion}</p>
            </div>
          </div>

          {/* Side-by-Side Product Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: mlbb (Standard) */}
            <div
              className={`rounded-3xl border p-6 space-y-5 bg-[#0c0e24] ${
                report.mlbb.validation.success
                  ? "border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                  : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-pink-400 text-sm">
                      mlbb
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Standard / International
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-white mt-1">
                    {report.mlbb.name}
                  </h4>
                </div>

                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 ${
                    report.mlbb.validation.success
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  }`}
                >
                  {report.mlbb.validation.success ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                </div>
              </div>

              {/* Account Validation Status */}
              <div className="rounded-2xl bg-[#08091a] p-4 text-xs font-mono space-y-2 border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Validation:</span>
                  <span
                    className={`font-bold ${
                      report.mlbb.validation.success
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {report.mlbb.validation.success
                      ? "✓ ACCOUNT CONFIRMED"
                      : "FAILED"}
                  </span>
                </div>
                {report.mlbb.validation.playerName && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-sans">IGN (Nickname):</span>
                    <span className="text-white font-sans font-bold">
                      {report.mlbb.validation.playerName}
                    </span>
                  </div>
                )}
                {report.mlbb.validation.message && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 font-sans shrink-0">Supplier Msg:</span>
                    <span className="text-slate-300 text-[11px] text-right font-sans">
                      {report.mlbb.validation.message}
                    </span>
                  </div>
                )}
              </div>

              {/* Regional Restriction Notes */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Regional Restriction Policy
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {report.mlbb.regionalNotes}
                </p>
              </div>

              {/* Packages Catalogue */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-pink-400" />
                    <span>Eligible Packages ({report.mlbb.packageCount})</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold">
                    106 Active Packs
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-xl bg-[#08091a] p-3 text-xs space-y-1.5 border border-white/5 font-mono">
                  {report.mlbb.samplePackages.map((pkg) => (
                    <div key={pkg.id} className="flex justify-between text-[11px]">
                      <span className="text-slate-300 truncate max-w-[180px]">
                        {pkg.name}
                      </span>
                      <span className="text-emerald-400 font-bold">
                        ${pkg.wholesaleCost.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selection Button */}
              {report.mlbb.validation.success && (
                <button
                  type="button"
                  onClick={() => handleApplyConfiguration("mlbb")}
                  disabled={isConfiguring}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isConfiguring ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Configure 'mlbb' as Main Mobile Legends Game</span>
                </button>
              )}
            </div>

            {/* Card 2: mlbb_global */}
            <div
              className={`rounded-3xl border p-6 space-y-5 bg-[#0c0e24] ${
                report.mlbb_global.validation.success
                  ? "border-cyan-500/40"
                  : "border-white/10 opacity-75"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-cyan-400 text-sm">
                      mlbb_global
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Indonesia Only
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-white mt-1">
                    {report.mlbb_global.name}
                  </h4>
                </div>

                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 ${
                    report.mlbb_global.validation.success
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  }`}
                >
                  {report.mlbb_global.validation.success ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                </div>
              </div>

              {/* Account Validation Status */}
              <div className="rounded-2xl bg-[#08091a] p-4 text-xs font-mono space-y-2 border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Validation:</span>
                  <span
                    className={`font-bold ${
                      report.mlbb_global.validation.success
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {report.mlbb_global.validation.success
                      ? "✓ ACCOUNT CONFIRMED"
                      : "REJECTED BY SUPPLIER"}
                  </span>
                </div>
                {report.mlbb_global.validation.playerName && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-sans">IGN:</span>
                    <span className="text-white font-sans font-bold">
                      {report.mlbb_global.validation.playerName}
                    </span>
                  </div>
                )}
                {report.mlbb_global.validation.message && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 font-sans shrink-0">Supplier Msg:</span>
                    <span className="text-slate-300 text-[11px] text-right font-sans">
                      {report.mlbb_global.validation.message}
                    </span>
                  </div>
                )}
              </div>

              {/* Regional Restriction Notes */}
              <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-400">
                  Regional Restriction Policy
                </span>
                <p className="text-amber-200 text-[11px] leading-relaxed">
                  {report.mlbb_global.regionalNotes}
                </p>
              </div>

              {/* Packages Catalogue */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Eligible Packages ({report.mlbb_global.packageCount})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    24 Active Packs
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-xl bg-[#08091a] p-3 text-xs space-y-1.5 border border-white/5 font-mono">
                  {report.mlbb_global.samplePackages.map((pkg) => (
                    <div key={pkg.id} className="flex justify-between text-[11px]">
                      <span className="text-slate-300 truncate max-w-[180px]">
                        {pkg.name}
                      </span>
                      <span className="text-cyan-400 font-bold">
                        ${pkg.wholesaleCost.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {configuredSuccess && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2 animate-in fade-in">
          <div className="font-extrabold text-white text-sm flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span>Mobile Legends Successfully Configured!</span>
          </div>
          <p>{configuredSuccess}</p>
          <div className="pt-2 flex gap-3">
            <Link
              href="/admin/games"
              className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs"
            >
              Return to Games Management
            </Link>
            <Link
              href="/games/g2bulk/mlbb"
              target="_blank"
              className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-bold text-xs"
            >
              Preview Public Storefront &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
