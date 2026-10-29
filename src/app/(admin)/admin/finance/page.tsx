"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, CircleDollarSign, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FinanceCurrency = {
  currency: string;
  verifiedPayments: string;
  grossOrderSales: string;
  recordedRefunds: string;
  netOrderRevenue: string;
  supplierCostEstimate: string;
  estimatedProfit: string | null;
  paidOrRefundedOrders: number;
  ordersWithKnownCost: number;
  ordersWithUnknownCost: number;
  ordersWithVerifiedPayment: number;
  unmatchedSuccessfulPaymentRecords: number;
  costCoverageComplete: boolean;
  pendingCustomerPayments: string;
  pendingCustomerPaymentCount: number;
  failedPayments: string;
  failedPaymentCount: number;
  pendingSupplierOrders: number;
  completedOrders: number;
};

type FinanceTransaction = {
  paymentId: string;
  transactionId: string | null;
  orderNumber: string;
  gateway: string;
  paymentStatus: string;
  verification: "matched" | "needs-review";
  amount: number;
  currency: string;
  createdAt: string;
  order: null | { gameName: string; packageName: string; supplier: string; paymentStatus: string; fulfillmentStatus: string; buyingPriceEstimate: number | null };
};

type FinanceSummary = {
  success: boolean;
  currencies: FinanceCurrency[];
  supplierBalances: { currency: string; source: "live" | "manual"; total: string; suppliersWithSnapshots: number; expectedSupplierAccounts: number; coverage: string }[];
  reconciliation: { status: string; unmatchedSuccessfulPaymentRecords: number; note: string };
  range: { from: string; to: string };
};

type ChartRow = { date: string; currency: string; verifiedPayments: string; grossOrderSales: string; refunds: string };

const money = (value: string | number | null, currency: string) => {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "KHR" ? 0 : 2 }).format(parsed);
};

const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function AdminFinancePage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 29); return dateOnly(date); });
  const [to, setTo] = useState(() => dateOnly(today));
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [chart, setChart] = useState<ChartRow[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ from, to });
    const txQuery = new URLSearchParams({ from, to, page: String(nextPage), limit: "25" });
    try {
      const [summaryRes, chartRes, txRes] = await Promise.all([
        fetch(`/api/admin/finance/summary?${query}`, { cache: "no-store" }),
        fetch(`/api/admin/finance/revenue-chart?${query}`, { cache: "no-store" }),
        fetch(`/api/admin/finance/transactions?${txQuery}`, { cache: "no-store" }),
      ]);
      const [summaryJson, chartJson, txJson] = await Promise.all([summaryRes.json(), chartRes.json(), txRes.json()]);
      if (!summaryRes.ok || !summaryJson.success) throw new Error(summaryJson.error || "Finance summary is unavailable.");
      if (!chartRes.ok || !chartJson.success) throw new Error(chartJson.error || "Revenue chart is unavailable.");
      if (!txRes.ok || !txJson.success) throw new Error(txJson.error || "Transactions are unavailable.");
      setSummary(summaryJson);
      setChart(chartJson.rows || []);
      setTransactions(txJson.rows || []);
      setPage(txJson.pagination?.page || nextPage);
      setTotalPages(Math.max(1, txJson.pagination?.totalPages || 1));
      const currencies = summaryJson.currencies || [];
      if (!currencies.some((item: FinanceCurrency) => item.currency === currency) && currencies.length) setCurrency(currencies[0].currency);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Finance data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [from, to, currency]);

  useEffect(() => { void load(); }, [load]);

  const active = summary?.currencies.find(item => item.currency === currency);
  const chartRows = chart.filter(row => row.currency === currency).map(row => ({
    ...row,
    collected: Number(row.verifiedPayments),
    sales: Number(row.grossOrderSales),
    refunded: Number(row.refunds),
  }));

  return (
    <main className="admin-page space-y-5">
      <header className="admin-page-heading">
        <div>
          <h1>Finance &amp; Reconciliation</h1>
          <p className="admin-page-description">Verified payments, recorded orders, refunds, and stored supplier cost estimates.</p>
        </div>
        <button type="button" onClick={() => void load(page)} disabled={loading} className="admin-button admin-button-secondary cursor-pointer">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <section className="admin-panel flex flex-wrap items-end gap-3" aria-label="Finance filters">
        <label className="grid gap-1 text-xs font-semibold text-slate-400">From<input type="date" value={from} max={to} onChange={event => { setFrom(event.target.value); setPage(1); }} className="rounded-lg border border-[#243047] bg-[#0C1322] px-3 py-2 text-sm text-slate-100" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-400">To<input type="date" value={to} min={from} onChange={event => { setTo(event.target.value); setPage(1); }} className="rounded-lg border border-[#243047] bg-[#0C1322] px-3 py-2 text-sm text-slate-100" /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-400">Currency<select value={currency} onChange={event => setCurrency(event.target.value)} className="rounded-lg border border-[#243047] bg-[#0C1322] px-3 py-2 text-sm text-slate-100">
          {(summary?.currencies.length ? summary.currencies.map(item => item.currency) : ["USD", "KHR"]).map(item => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <span className={`ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${summary?.reconciliation.status === "matched" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
          {summary?.reconciliation.status === "matched" ? <Activity className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {summary?.reconciliation.status === "matched" ? "Records matched" : "Partial reconciliation"}
        </span>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Finance totals">
        <article className="admin-panel space-y-2">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-semibold uppercase tracking-wide">Verified payments</span><Wallet className="h-4 w-4 text-emerald-400" /></div>
          <strong className="block text-2xl text-white">{money(active?.verifiedPayments ?? null, currency)}</strong>
          <span className="text-xs text-slate-500">Payment amount matches its paid order.</span>
        </article>
        <article className="admin-panel space-y-2">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-semibold uppercase tracking-wide">Gross order revenue</span><ArrowUpRight className="h-4 w-4 text-cyan-400" /></div>
          <strong className="block text-2xl text-white">{money(active?.grossOrderSales ?? null, currency)}</strong>
          <span className="text-xs text-slate-500">Recorded paid and fully refunded order values.</span>
        </article>
        <article className="admin-panel space-y-2">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-semibold uppercase tracking-wide">Supplier cost estimate</span><ArrowDownRight className="h-4 w-4 text-amber-400" /></div>
          <strong className="block text-2xl text-white">{money(active?.supplierCostEstimate ?? null, currency)}</strong>
          <span className="text-xs text-slate-500">Stored order-time rate; not a supplier invoice.</span>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Additional finance totals">
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recorded refunds</h2><strong className="block text-xl text-white">{money(active?.recordedRefunds ?? null, currency)}</strong><span className="text-xs text-slate-500">Full-order refunds only; partial refund ledger not present.</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending customer payments</h2><strong className="block text-xl text-white">{money(active?.pendingCustomerPayments ?? null, currency)}</strong><span className="text-xs text-slate-500">{active?.pendingCustomerPaymentCount ?? 0} pending records</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Failed payments</h2><strong className="block text-xl text-white">{money(active?.failedPayments ?? null, currency)}</strong><span className="text-xs text-slate-500">{active?.failedPaymentCount ?? 0} failed records</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gross profit</h2><strong className="block text-xl text-white">Unavailable</strong><span className="text-xs text-slate-500">Actual supplier invoices and complete settled costs are not recorded.</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimated profit</h2><strong className="block text-xl text-white">{money(active?.estimatedProfit ?? null, currency)}</strong><span className="text-xs text-slate-500">{active?.costCoverageComplete ? "All order-time cost estimates are present." : "Unavailable until every order has a stored cost."}</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Website available funds</h2><strong className="block text-xl text-white">Not fully reconciled</strong><span className="text-xs text-slate-500">Cash settlements, fees, reserves, and liabilities are not in a ledger.</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending supplier orders</h2><strong className="block text-xl text-white">{active?.pendingSupplierOrders ?? 0}</strong><span className="text-xs text-slate-500">Paid orders without a final supplier fulfillment status.</span></article>
        <article className="admin-panel space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed orders</h2><strong className="block text-xl text-white">{active?.completedOrders ?? 0}</strong><span className="text-xs text-slate-500">Paid orders marked completed or delivered.</span></article>
        <article className="admin-panel space-y-1 sm:col-span-2 xl:col-span-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Combined supplier balance</h2>
          {summary?.supplierBalances.filter(item => item.currency === currency).length ? summary.supplierBalances.filter(item => item.currency === currency).map(item => <div key={item.source} className="mt-2 flex justify-between gap-2 text-sm"><span className="capitalize text-slate-400">{item.source} · {item.suppliersWithSnapshots}/{item.expectedSupplierAccounts}</span><strong className="font-mono text-white">{money(item.total, currency)}</strong></div>) : <strong className="mt-2 block text-sm text-slate-400">Unavailable</strong>}
          <span className="text-xs text-slate-500">Supplier prepaid credit only; excluded from website revenue.</span>
        </article>
      </section>

      <section className="admin-panel admin-panel-stack">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2>Payments and order activity</h2><p className="admin-page-description">Daily values are shown in {currency}; currencies are never combined.</p></div>
          {active && <span className="text-xs text-slate-400">{active.ordersWithKnownCost} costed · {active.ordersWithUnknownCost} missing costs</span>}
        </div>
        <div className="h-[280px] w-full">
          {chartRows.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="financeCollected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34D399" stopOpacity={0.28} /><stop offset="95%" stopColor="#34D399" stopOpacity={0} /></linearGradient>
                <linearGradient id="financeSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38BDF8" stopOpacity={0.2} /><stop offset="95%" stopColor="#38BDF8" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="#253047" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
              <Tooltip contentStyle={{ background: "#0C1322", border: "1px solid #243047", borderRadius: 12, color: "#F8FAFC" }} formatter={(value) => money(Number(value), currency)} />
              <Area type="monotone" dataKey="collected" name="Verified payments" stroke="#34D399" fill="url(#financeCollected)" strokeWidth={2} />
              <Area type="monotone" dataKey="sales" name="Gross order sales" stroke="#38BDF8" fill="url(#financeSales)" strokeWidth={2} />
              <Area type="monotone" dataKey="refunded" name="Recorded refunds" stroke="#FB7185" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No verified payment or order totals in this date range.</div>}
        </div>
      </section>

      <section className="admin-panel admin-panel-stack overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2>Payment records</h2><p className="admin-page-description">Unmatched successful rows stay visible for review and are excluded from verified totals.</p></div>
          <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Order / Transaction</th><th className="py-3 pr-4">Gateway</th><th className="py-3 pr-4">Amount</th><th className="py-3 pr-4">Payment</th><th className="py-3 pr-4">Fulfillment</th><th className="py-3 pr-4">Check</th><th className="py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-[#243047]">
              {transactions.map(row => <tr key={row.paymentId}>
                <td className="py-3 pr-4"><div className="font-semibold text-slate-200">{row.orderNumber}</div><div className="text-xs text-slate-500">{row.order?.packageName || row.transactionId || row.paymentId}</div></td>
                <td className="py-3 pr-4 text-slate-300">{row.gateway}</td>
                <td className="py-3 pr-4 font-mono text-slate-100">{money(row.amount, row.currency)}</td>
                <td className="py-3 pr-4 text-slate-300">{row.paymentStatus}</td>
                <td className="py-3 pr-4 text-slate-300">{row.order?.fulfillmentStatus || "No linked order"}</td>
                <td className="py-3 pr-4"><span className={row.verification === "matched" ? "text-emerald-300" : "text-amber-300"}>{row.verification === "matched" ? "Matched" : "Review"}</span></td>
                <td className="py-3 text-xs text-slate-400">{new Date(row.createdAt).toLocaleString()}</td>
              </tr>)}
              {!transactions.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No payment records for this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="admin-button admin-button-secondary disabled:opacity-40">Previous</button>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} className="admin-button admin-button-secondary disabled:opacity-40">Next</button>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>{summary?.reconciliation.note || "Finance data is loaded from verified application records. No supplier balances, revenue, costs, or profit are fabricated."}</p>
      </div>
    </main>
  );
}
