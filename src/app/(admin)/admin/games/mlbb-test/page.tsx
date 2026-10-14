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
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#94A3B8] mb-1">
            <Link href="/admin/games" className="hover:text-[#22C55E] flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back to Games Catalog</span>
            </Link>
            <span>/</span>
            <span className="text-[#F8FAFC] font-semibold">MLBB Cambodian Verification</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-[#22C55E]" />
            <span>Mobile Legends: Cambodian Account Compatibility</span>
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1 max-w-2xl leading-relaxed">
            Direct real-time comparison between G2Bulk products <strong className="text-[#22C55E] font-mono">mlbb</strong> and <strong className="text-[#38BDF8] font-mono">mlbb_global</strong>. Validates account compatibility without spending wallet balance or creating real orders.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20 text-xs text-[#22C55E] font-semibold shrink-0">
          <ShieldCheck className="h-4 w-4 text-[#22C55E]" />
          <span>Zero Balance Spent</span>
        </div>
      </div>

      {/* Test Form */}
      <div className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
            <span>Secure Local Test Form</span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">
              Sandboxed Check
            </span>
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Enter your Cambodian Mobile Legends account details below. Both G2Bulk products will be queried simultaneously.
          </p>
        </div>

        <form onSubmit={handleRunTest} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5 space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full rounded-lg border border-[#243047] bg-[#0C1322] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E]/20 font-mono"
            />
          </div>

          <div className="sm:col-span-4 space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Zone ID / Server ID
            </label>
            <input
              type="text"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              placeholder="e.g. 1234"
              className="w-full rounded-lg border border-[#243047] bg-[#0C1322] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E]/20 font-mono"
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 px-4 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-slate-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: mlbb (Standard) */}
            <div
              className={`rounded-xl border p-5 space-y-4 bg-[#111A2B] ${
                report.mlbb.validation.success
                  ? "border-[#22C55E]/40"
                  : "border-[#243047]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#22C55E] text-xs">
                      mlbb
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">
                      Standard / International
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-[#F8FAFC] mt-1">
                    {report.mlbb.name}
                  </h4>
                </div>

                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${
                    report.mlbb.validation.success
                      ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {report.mlbb.validation.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                </div>
              </div>

              {/* Account Validation Status */}
              <div className="rounded-lg bg-[#0C1322] p-3 text-xs font-mono space-y-1.5 border border-[#243047]">
                <div className="flex justify-between items-center">
                  <span className="text-[#94A3B8] font-sans">Validation:</span>
                  <span
                    className={`font-semibold ${
                      report.mlbb.validation.success
                        ? "text-[#22C55E]"
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
                    <span className="text-[#94A3B8] font-sans">IGN (Nickname):</span>
                    <span className="text-[#F8FAFC] font-sans font-bold">
                      {report.mlbb.validation.playerName}
                    </span>
                  </div>
                )}
                {report.mlbb.validation.message && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[#94A3B8] font-sans shrink-0">Supplier Msg:</span>
                    <span className="text-[#94A3B8] text-[11px] text-right font-sans">
                      {report.mlbb.validation.message}
                    </span>
                  </div>
                )}
              </div>

              {/* Regional Restriction Notes */}
              <div className="p-3 rounded-lg bg-[#0C1322]/50 border border-[#243047] text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B]">
                  Regional Restriction Policy
                </span>
                <p className="text-[#94A3B8] text-[11px] leading-relaxed">
                  {report.mlbb.regionalNotes}
                </p>
              </div>

              {/* Packages Catalogue */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-[#22C55E]" />
                    <span>Eligible Packages ({report.mlbb.packageCount})</span>
                  </span>
                  <span className="text-[10px] text-[#22C55E] font-semibold">
                    106 Active Packs
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg bg-[#0C1322] p-2.5 text-xs space-y-1 border border-[#243047] font-mono">
                  {report.mlbb.samplePackages.map((pkg) => (
                    <div key={pkg.id} className="flex justify-between text-[11px]">
                      <span className="text-[#94A3B8] truncate max-w-[180px]">
                        {pkg.name}
                      </span>
                      <span className="text-[#22C55E] font-semibold">
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
                  className="w-full h-9 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-slate-950 font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isConfiguring ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>Configure &apos;mlbb&apos; as Main Mobile Legends Game</span>
                </button>
              )}
            </div>

            {/* Card 2: mlbb_global */}
            <div
              className={`rounded-xl border p-5 space-y-4 bg-[#111A2B] ${
                report.mlbb_global.validation.success
                  ? "border-[#38BDF8]/40"
                  : "border-[#243047] opacity-80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#38BDF8] text-xs">
                      mlbb_global
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Indonesia Only
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-[#F8FAFC] mt-1">
                    {report.mlbb_global.name}
                  </h4>
                </div>

                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${
                    report.mlbb_global.validation.success
                      ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {report.mlbb_global.validation.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                </div>
              </div>

              {/* Account Validation Status */}
              <div className="rounded-lg bg-[#0C1322] p-3 text-xs font-mono space-y-1.5 border border-[#243047]">
                <div className="flex justify-between items-center">
                  <span className="text-[#94A3B8] font-sans">Validation:</span>
                  <span
                    className={`font-semibold ${
                      report.mlbb_global.validation.success
                        ? "text-[#22C55E]"
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
                    <span className="text-[#94A3B8] font-sans">IGN:</span>
                    <span className="text-[#F8FAFC] font-sans font-bold">
                      {report.mlbb_global.validation.playerName}
                    </span>
                  </div>
                )}
                {report.mlbb_global.validation.message && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[#94A3B8] font-sans shrink-0">Supplier Msg:</span>
                    <span className="text-[#94A3B8] text-[11px] text-right font-sans">
                      {report.mlbb_global.validation.message}
                    </span>
                  </div>
                )}
              </div>

              {/* Regional Restriction Notes */}
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-400">
                  Regional Restriction Policy
                </span>
                <p className="text-amber-200/90 text-[11px] leading-relaxed">
                  {report.mlbb_global.regionalNotes}
                </p>
              </div>

              {/* Packages Catalogue */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-[#38BDF8]" />
                    <span>Eligible Packages ({report.mlbb_global.packageCount})</span>
                  </span>
                  <span className="text-[10px] text-[#64748B]">
                    24 Active Packs
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg bg-[#0C1322] p-2.5 text-xs space-y-1 border border-[#243047] font-mono">
                  {report.mlbb_global.samplePackages.map((pkg) => (
                    <div key={pkg.id} className="flex justify-between text-[11px]">
                      <span className="text-[#94A3B8] truncate max-w-[180px]">
                        {pkg.name}
                      </span>
                      <span className="text-[#38BDF8] font-semibold">
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
        <div className="p-4 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] text-xs space-y-2 animate-in fade-in">
          <div className="font-bold text-[#F8FAFC] text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
            <span>Mobile Legends Successfully Configured!</span>
          </div>
          <p>{configuredSuccess}</p>
          <div className="pt-1.5 flex gap-2.5">
            <Link
              href="/admin/games"
              className="px-3.5 py-1.5 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-slate-950 font-semibold text-xs"
            >
              Return to Games Management
            </Link>
            <Link
              href="/games/g2bulk/mlbb"
              target="_blank"
              className="px-3.5 py-1.5 rounded-lg border border-[#243047] hover:bg-[#151F31] text-[#94A3B8] hover:text-[#F8FAFC] font-medium text-xs"
            >
              Preview Public Storefront &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
