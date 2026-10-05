"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  QrCode,
  Wallet,
  Sparkles,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface GatewayInfo {
  id: string;
  name: string;
  status: "active" | "unconfigured";
  profileId: string;
  currency: string;
  type: string;
}

interface AdminPayment {
  id: string;
  paymentId: string;
  orderNumber: string;
  gateway: string;
  transactionId: string | null;
  amount: number;
  currency: string;
  status: "pending" | "successful" | "failed" | "expired";
  payerAccount: string | null;
  createdAt: string;
}

interface PaymentVerifyResult {
  message?: string;
  record?: {
    paymentId?: string;
    orderNumber?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
  [key: string]: unknown;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({
    totalSuccess: 0,
    totalPending: 0,
    totalFailed: 0,
    totalVolume: 0,
  });

  // Verify lookup state
  const [lookupId, setLookupId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<PaymentVerifyResult | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/payments", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments);
        setGateways(data.gateways);
        setKpi(data.kpi);
      }
    } catch (err) {
      console.error("Failed to load payments:", err);
      toast.error("Failed to fetch payment details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleVerifyLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;

    try {
      setIsVerifying(true);
      setVerifyResult(null);
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: lookupId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setVerifyResult(data);
        if (data.record) {
          toast.success("Transaction verified in database");
        } else {
          toast.info("Inquiry completed: No transaction with this reference yet");
        }
      } else {
        toast.error(data.error || "Lookup failed");
      }
    } catch {
      toast.error("Error connecting to payment verifier");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="admin-page animate-in fade-in duration-300">
      {/* Header */}
      <div className="admin-page-heading">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Payment Gateways</h1>
          <p className="text-xs text-slate-400 mt-1">
            AnajakPay KHQR credentials, settlement telemetry, and live payment processing.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Gateways</span>
        </button>
      </div>

      {/* Payment Gateway Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Configured Payment Rails</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {gateways.map((gw) => (
            <div
              key={gw.id}
              className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] shadow-sm space-y-3 relative overflow-hidden group"
            >
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                  {gw.id === "anajakpay" ? (
                    <QrCode className="h-4 w-4" />
                  ) : gw.id === "aba" ? (
                    <CreditCard className="h-4 w-4" />
                  ) : gw.id === "wing" ? (
                    <Wallet className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    gw.status === "active"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      gw.status === "active" ? "bg-emerald-400" : "bg-slate-400"
                    }`}
                  />
                  {gw.status === "active" ? "Active Live" : "Unconfigured"}
                </span>
              </div>

              <div>
                <h3 className="font-extrabold text-white text-sm">{gw.name}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{gw.type}</p>
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Identifier:</span>
                  <span className="text-pink-400">{gw.profileId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Currency:</span>
                  <span className="text-slate-300">{gw.currency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Settled Volume
          </span>
          <div className="text-2xl font-black text-white mt-1">
            ${kpi.totalVolume.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Successful Payments
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {kpi.totalSuccess}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Pending Processing
          </span>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {kpi.totalPending}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
            Failed / Expired
          </span>
          <div className="text-2xl font-black text-rose-400 mt-1">
            {kpi.totalFailed}
          </div>
        </div>
      </div>

      {/* Transaction Verifier Tool */}
      <div className="rounded-2xl p-6 border border-white/10 bg-[#0c0e24]">
        <div className="max-w-xl space-y-3">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Search className="h-4 w-4 text-pink-400" />
            <span>Manual Transaction Inquiry Tool</span>
          </h2>
          <p className="text-xs text-slate-400">
            Query AnajakPay or bank transaction reference to audit payment receipt status.
          </p>

          <form onSubmit={handleVerifyLookup} className="flex gap-2 pt-2">
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Enter Transaction ID / KHQR reference..."
              className="flex-1 rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isVerifying || !lookupId.trim()}
              className="px-4 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {isVerifying ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span>Verify</span>
            </button>
          </form>

          {verifyResult && (
            <div className="mt-3 p-3.5 rounded-xl bg-[#08091a] border border-white/10 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Result:</span>
                <span className="text-pink-400 font-bold">{verifyResult.message}</span>
              </div>
              {verifyResult.record && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Payment ID:</span>
                    <span className="text-white">{verifyResult.record.paymentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Order:</span>
                    <span className="text-white">{verifyResult.record.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-emerald-400 font-bold uppercase">
                      {verifyResult.record.status}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Logs Table */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e24] overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <h2 className="text-base font-extrabold text-white">Payment Transaction Logs</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real MongoDB payment transactions recorded via KHQR & online checkouts.
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <CreditCard className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">No payment records yet</p>
            <p className="text-xs text-slate-500 mt-1">
              As customers complete purchases through AnajakPay KHQR or mobile banking, records are logged here.
            </p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#090b1c] text-slate-400 uppercase text-[10px] font-bold border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Payment ID</th>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4">Transaction Ref</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-pink-400">
                      {p.paymentId}
                    </td>
                    <td className="py-3 px-4 font-mono text-white">
                      {p.orderNumber}
                    </td>
                    <td className="py-3 px-4 uppercase font-bold text-slate-300">
                      {p.gateway}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {p.transactionId || "—"}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">
                      ${p.amount.toFixed(2)} {p.currency}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === "successful"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : p.status === "failed"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
