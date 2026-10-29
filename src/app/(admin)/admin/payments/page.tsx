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
  const [testingGatewayId, setTestingGatewayId] = useState<string | null>(null);

  const handleTestConnection = async (gatewayId: string) => {
    try {
      setTestingGatewayId(gatewayId);
      if (gatewayId === "aba_payway_v2") {
        const res = await fetch("/api/payment/vngzz2/health");
        const data = await res.json();
        if (data.available) {
          toast.success("ABA PayWay V2 is OPERATIONAL", {
            description: `State: ${data.state || "Active"} · Latency: ${data.latencyMs ?? 0}ms · Version: ${data.version || "1.0.0"}`,
          });
        } else if (data.isConfigured === false) {
          toast.info("ABA PayWay V2 Pending Configuration", {
            description: "Add VNGZZ2_PRIMARY_API_KEY to your environment variables to enable live payments.",
          });
        } else {
          toast.error("ABA PayWay V2 Connection Warning", {
            description: data.message || "Unable to reach VngZz2 payment server",
          });
        }
      } else if (gatewayId === "anajakpay") {
        const res = await fetch("/api/payment/anajakpay/health");
        const data = await res.json();
        if (data.available) {
          toast.success("AnajakPay KHQRcc Rail is OPERATIONAL", {
            description: "Bank rail online. Instant universal QR payments active.",
          });
        } else {
          toast.error("AnajakPay Rail Maintenance", {
            description: data.message || "AnajakPay reports temporary banking rail maintenance.",
          });
        }
      }
    } catch (err) {
      toast.error("Connection probe failed", {
        description: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTestingGatewayId(null);
    }
  };

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F8FAFC]">Payment Gateways</h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
            AnajakPay KHQR credentials, settlement telemetry, and live payment processing.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Gateways</span>
        </button>
      </div>

      {/* Payment Gateway Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#22C55E]" />
          <span>Configured Payment Rails</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {gateways.map((gw) => (
            <div
              key={gw.id}
              className="rounded-xl p-4 border border-[#243047] bg-[#111A2B] space-y-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="h-8 w-8 rounded-lg bg-[rgba(34,197,94,0.10)] border border-[rgba(34,197,94,0.25)] flex items-center justify-center text-[#22C55E]">
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
                      ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] border border-[rgba(34,197,94,0.28)]"
                      : "bg-[#151F31] text-[#94A3B8] border border-[#243047]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      gw.status === "active" ? "bg-[#22C55E]" : "bg-[#64748B]"
                    }`}
                  />
                  {gw.status === "active" ? "Active Live" : "Unconfigured"}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-[#F8FAFC] text-sm">{gw.name}</h3>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">{gw.type}</p>
              </div>

              <div className="pt-2 border-t border-[#243047] space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] font-sans">Identifier:</span>
                  <span className="text-[#22C55E] font-medium">{gw.profileId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] font-sans">Currency:</span>
                  <span className="text-[#F8FAFC]">{gw.currency}</span>
                </div>

                {(gw.id === "aba_payway_v2" || gw.id === "anajakpay") && (
                  <button
                    type="button"
                    onClick={() => handleTestConnection(gw.id)}
                    disabled={testingGatewayId === gw.id}
                    className="w-full mt-2 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px] font-bold border border-[#243047] bg-[#151F31] hover:bg-[#1E293B] hover:text-[#22C55E] text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${testingGatewayId === gw.id ? "animate-spin" : ""}`} />
                    <span>{testingGatewayId === gw.id ? "Testing probe..." : "Test Connection"}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 border border-[#243047] bg-[#111A2B]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Total Settled Volume
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#F8FAFC] mt-1">
            ${kpi.totalVolume.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-[#243047] bg-[#111A2B]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#22C55E]">
            Successful Payments
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#22C55E] mt-1">
            {kpi.totalSuccess}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-[#243047] bg-[#111A2B]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
            Pending Processing
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#F59E0B] mt-1">
            {kpi.totalPending}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-[#243047] bg-[#111A2B]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#EF4444]">
            Failed / Expired
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#EF4444] mt-1">
            {kpi.totalFailed}
          </div>
        </div>
      </div>

      {/* Transaction Verifier Tool */}
      <div className="rounded-xl p-5 border border-[#243047] bg-[#111A2B]">
        <div className="max-w-xl space-y-3">
          <h2 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
            <Search className="h-4 w-4 text-[#22C55E]" />
            <span>Manual Transaction Inquiry Tool</span>
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Query AnajakPay or bank transaction reference to audit payment receipt status.
          </p>

          <form onSubmit={handleVerifyLookup} className="flex gap-2 pt-1">
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Enter Transaction ID / KHQR reference..."
              className="flex-1 rounded-lg border border-[#243047] bg-[#151F31] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
            />
            <button
              type="submit"
              disabled={isVerifying || !lookupId.trim()}
              className="px-4 py-2 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#080D18] font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
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
            <div className="mt-3 p-3.5 rounded-lg bg-[#151F31] border border-[#243047] text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Result:</span>
                <span className="text-[#22C55E] font-bold">{verifyResult.message}</span>
              </div>
              {verifyResult.record && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Payment ID:</span>
                    <span className="text-[#F8FAFC]">{verifyResult.record.paymentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Order:</span>
                    <span className="text-[#F8FAFC]">{verifyResult.record.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Status:</span>
                    <span className="text-[#22C55E] font-bold uppercase">
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
      <div className="rounded-xl border border-[#243047] bg-[#111A2B] overflow-hidden">
        <div className="p-4 border-b border-[#243047]">
          <h2 className="text-sm font-bold text-[#F8FAFC]">Payment Transaction Logs</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Real MongoDB payment transactions recorded via KHQR & online checkouts.
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="p-12 text-center text-[#94A3B8]">
            <CreditCard className="h-10 w-10 text-[#64748B] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#F8FAFC]">No payment records yet</p>
            <p className="text-xs text-[#64748B] mt-1">
              As customers complete purchases through AnajakPay KHQR or mobile banking, records are logged here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#151F31] text-[#94A3B8] uppercase text-[10px] font-bold border-b border-[#243047]">
                <tr>
                  <th className="py-2.5 px-3.5">Payment ID</th>
                  <th className="py-2.5 px-3.5">Order #</th>
                  <th className="py-2.5 px-3.5">Gateway</th>
                  <th className="py-2.5 px-3.5">Transaction Ref</th>
                  <th className="py-2.5 px-3.5">Amount</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#243047]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#151F31]/50 transition-colors">
                    <td className="py-2.5 px-3.5 font-mono text-[#F8FAFC] font-medium">
                      {p.paymentId}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[#F8FAFC]">
                      {p.orderNumber}
                    </td>
                    <td className="py-2.5 px-3.5">
                      {p.gateway === "aba_payway_v2" || p.gateway === "vngzz2" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-[#0066b2]/20 text-[#38bdf8] border border-[#0066b2]/40 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
                          ABA PayWay V2
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          AnajakPay
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[#64748B]">
                      {p.transactionId || "—"}
                    </td>
                    <td className="py-2.5 px-3.5 font-bold text-[#F8FAFC]">
                      ${p.amount.toFixed(2)} {p.currency}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === "successful"
                            ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] border border-[rgba(34,197,94,0.28)]"
                            : p.status === "failed"
                            ? "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30"
                            : "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-[#64748B]">
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
