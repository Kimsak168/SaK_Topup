"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Server, Wallet } from "lucide-react";

type BalanceSnapshot = { walletId: string; amount: string; currency: string; source: "live" | "manual"; freshness: "live" | "cached" | "manual"; checkedAt: string };
type SupplierAccount = {
  id: "vngzz2" | "g2bulk" | "webbuilder";
  displayName: string;
  enabled: boolean;
  baseUrl: string;
  configured: boolean;
  credentialVariables: string[];
  capabilities: string[];
  catalogModes: string[];
  balanceScopes: string[];
  status: "configured" | "connected" | "failed" | "unavailable" | "disabled";
  lastConnectionTestAt: string | null;
  lastBalanceSyncAt: string | null;
  lastError: string | null;
  balances: BalanceSnapshot[];
};

const statusStyle: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  configured: "bg-sky-500/10 text-sky-300 border-sky-500/25",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  unavailable: "bg-slate-500/10 text-slate-300 border-slate-500/25",
  disabled: "bg-slate-500/10 text-slate-300 border-slate-500/25",
};

function displayMoney(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "KHR" ? 0 : 4 }).format(value);
}

export default function AdminSuppliersPage() {
  const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [manualSupplier, setManualSupplier] = useState("");
  const [manualWallet, setManualWallet] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency, setManualCurrency] = useState("USD");
  const [historySupplier, setHistorySupplier] = useState("");
  const [historyRows, setHistoryRows] = useState<BalanceSnapshot[]>([]);
  const [syncingGames, setSyncingGames] = useState(false);
  const [syncingPackages, setSyncingPackages] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/suppliers", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Supplier account data is unavailable.");
      setAccounts(json.accounts || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supplier account data is unavailable.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (supplierId: string, action: "test-connection" | "sync-balance") => {
    setBusy(`${supplierId}:${action}`);
    try {
      if (action === "test-connection") {
        const testResponse = await fetch(`/api/admin/suppliers/${supplierId}/test-connection`, { method: "POST" });
        const testJson = await testResponse.json();
        if (!testResponse.ok || !testJson.success) throw new Error(testJson.error || "Connection test failed.");
      } else {
        const response = await fetch(`/api/admin/suppliers/${supplierId}/sync-balance`, { method: "POST" });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Balance refresh failed.");
      }
      toast.success(action === "test-connection" ? "Connection test completed." : "Verified balance refreshed.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Supplier request failed.");
      await load();
    } finally { setBusy(""); }
  };

  const recordManualBalance = async (supplier: SupplierAccount) => {
    if (!manualAmount || !manualWallet) return toast.error("Enter an amount and wallet scope first.");
    if (!window.confirm(`Record ${manualAmount} ${manualCurrency} as a manually entered ${manualWallet} balance for ${supplier.displayName}?`)) return;
    setBusy(`${supplier.id}:manual`);
    try {
      const response = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual-balance", supplierId: supplier.id, walletId: manualWallet, amount: manualAmount, currency: manualCurrency, confirmation: "RECORD MANUAL BALANCE" }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Manual balance could not be recorded.");
      setManualSupplier(""); setManualAmount(""); setManualWallet("");
      toast.success("Manual balance recorded and audit logged.");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Manual balance could not be recorded."); }
    finally { setBusy(""); }
  };

  const toggleHistory = async (supplierId: string) => {
    if (historySupplier === supplierId) { setHistorySupplier(""); setHistoryRows([]); return; }
    setHistorySupplier(supplierId);
    try {
      const response = await fetch(`/api/admin/suppliers/${supplierId}/balance-history?limit=10`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Balance history is unavailable.");
      setHistoryRows(json.rows || []);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Balance history is unavailable."); setHistoryRows([]); }
  };

  const handleSyncGames = async () => {
    setSyncingGames(true);
    try {
      const response = await fetch("/api/admin/sync/games", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Game catalogue sync failed.");
      toast.success(`Game catalogue synced: ${json.stats.totalImported} new, ${json.stats.totalUpdated} updated.`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Game catalogue sync failed."); }
    finally { setSyncingGames(false); }
  };

  const handleSyncPackages = async () => {
    setSyncingPackages(true);
    try {
      const response = await fetch("/api/admin/sync/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onlyActiveGames: true }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Package sync failed.");
      toast.success(`Packages synced: ${json.stats.totalImported} imported, ${json.stats.totalUpdated} updated.`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Package sync failed."); }
    finally { setSyncingPackages(false); }
  };

  return (
    <main className="admin-page space-y-5">
      <header className="admin-page-heading">
        <div><h1>Suppliers / អ្នកផ្គត់ផ្គង់</h1><p className="admin-page-description">Three configured accounts, verified balance snapshots, and catalog coverage. Credentials stay server-side.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="admin-button admin-button-secondary cursor-pointer"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {loading && !accounts.length && <div className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="admin-panel h-64 animate-pulse" />)}</div>}

      <section className="grid gap-4 xl:grid-cols-3" aria-label="Configured suppliers">
        {accounts.map(account => (
          <article key={account.id} className="admin-panel admin-panel-stack min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#151F31] text-emerald-300"><Server className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate text-base font-bold text-white">{account.displayName}</h2><p className="truncate text-xs text-slate-500">{account.id}</p></div></div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyle[account.status] || statusStyle.unavailable}`}>
                {account.status === "connected" ? <CheckCircle2 className="h-3.5 w-3.5" /> : account.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}{account.status}
              </span>
            </div>

            <div className="space-y-2 rounded-xl border border-[#243047] bg-[#0C1322] p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-400">API credential</span><span className={account.configured ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{account.configured ? "Configured" : "Missing"}</span></div>
              <div className="break-all text-[11px] text-slate-500">{account.credentialVariables.join(" · ")}</div>
              <div className="break-all font-mono text-[11px] text-slate-400">{account.baseUrl}</div>
            </div>

            <div className="flex flex-wrap gap-1.5">{account.capabilities.map(capability => <span key={capability} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">{capability}</span>)}
              {account.id === "g2bulk" && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">SMM API documented; catalog mapping pending</span>}
              {account.id === "webbuilder" && <span className="rounded-full bg-slate-700 px-2 py-1 text-[10px] text-slate-300">Game-only</span>}
            </div>

            <div className="space-y-2 border-t border-[#243047] pt-3">
              <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Wallet className="h-4 w-4 text-cyan-300" /> Balance snapshots</h3><span className="text-[10px] uppercase tracking-wider text-slate-500">No inferred zero</span></div>
              {account.balances.length ? account.balances.map(balance => <div key={`${balance.walletId}-${balance.currency}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#243047] bg-[#111A2B] px-3 py-2">
                <div><div className="text-xs font-semibold capitalize text-slate-300">{balance.walletId} wallet</div><div className="text-[10px] text-slate-500">{new Date(balance.checkedAt).toLocaleString()}</div></div>
                <div className="text-right"><div className="font-mono text-sm font-bold text-white">{displayMoney(balance.amount, balance.currency)}</div><div className={`text-[10px] capitalize ${balance.freshness === "live" ? "text-emerald-300" : balance.freshness === "manual" ? "text-amber-300" : "text-slate-500"}`}>{balance.freshness}</div></div>
              </div>) : <p className="rounded-lg border border-dashed border-[#243047] p-3 text-xs text-slate-500">Balance not yet available. Refresh to request a live balance.</p>}
              {account.lastBalanceSyncAt && <p className="text-[10px] text-slate-500">Last successful balance sync: {new Date(account.lastBalanceSyncAt).toLocaleString()}</p>}
              {account.lastConnectionTestAt && <p className="text-[10px] text-slate-500">Last connection check: {new Date(account.lastConnectionTestAt).toLocaleString()}</p>}
              {account.lastError && <p role="status" className="text-xs text-rose-300">{account.lastError}</p>}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[#243047] pt-3">
              <button type="button" onClick={() => void runAction(account.id, "test-connection")} disabled={Boolean(busy) || !account.configured} className="admin-button admin-button-secondary flex-1 cursor-pointer disabled:opacity-40">{busy === `${account.id}:test-connection` ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />} Test connection</button>
              <button type="button" onClick={() => void runAction(account.id, "sync-balance")} disabled={Boolean(busy) || !account.configured} className="admin-button admin-button-primary flex-1 cursor-pointer disabled:opacity-40">{busy === `${account.id}:sync-balance` ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh balance</button>
            </div>

            <button type="button" onClick={() => { setManualSupplier(manualSupplier === account.id ? "" : account.id); setManualWallet(account.balanceScopes[0] || ""); }} className="self-start text-xs font-semibold text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-white">Record manual balance</button>
            {manualSupplier === account.id && <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-100/80">Manual values are labeled separately and never replace provider-reported balances.</p>
              <div className="grid grid-cols-3 gap-2">
                <select value={manualWallet} onChange={event => setManualWallet(event.target.value)} className="col-span-3 rounded-lg border border-[#243047] bg-[#0C1322] px-2 py-2 text-xs text-white">{account.balanceScopes.map(scope => <option key={scope} value={scope}>{scope}</option>)}</select>
                <input value={manualAmount} onChange={event => setManualAmount(event.target.value)} inputMode="decimal" placeholder="Amount" className="col-span-2 min-w-0 rounded-lg border border-[#243047] bg-[#0C1322] px-2 py-2 text-xs text-white" />
                <input value={manualCurrency} onChange={event => setManualCurrency(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} aria-label="Currency" className="rounded-lg border border-[#243047] bg-[#0C1322] px-2 py-2 text-xs uppercase text-white" />
              </div>
              <button type="button" onClick={() => void recordManualBalance(account)} disabled={Boolean(busy)} className="w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-40">Confirm manual balance</button>
            </div>}
            <button type="button" onClick={() => void toggleHistory(account.id)} className="inline-flex items-center gap-1 self-start text-xs text-slate-500 hover:text-slate-200"><Activity className="h-3 w-3" /> {historySupplier === account.id ? "Hide balance history" : "View balance history"}</button>
            {historySupplier === account.id && <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#243047] p-2">
              {historyRows.length ? historyRows.map(row => <div key={`${row.walletId}-${row.checkedAt}`} className="flex justify-between gap-3 py-1 text-[11px]"><span className="text-slate-400">{row.walletId} · {row.freshness}</span><span className="text-right text-slate-200">{displayMoney(row.amount, row.currency)}<span className="block text-[10px] text-slate-500">{new Date(row.checkedAt).toLocaleString()}</span></span></div>) : <div className="py-3 text-center text-xs text-slate-500">No balance snapshots.</div>}
            </div>}
          </article>
        ))}
      </section>

      <section className="admin-panel admin-panel-stack">
        <div><h2 className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-300" />Catalog synchronization</h2><p className="admin-page-description">Existing game and package sync actions remain available. They preserve configured selling prices and custom images.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => void handleSyncGames()} disabled={syncingGames} className="admin-button admin-button-secondary justify-center cursor-pointer disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${syncingGames ? "animate-spin" : ""}`} />{syncingGames ? "Syncing games…" : "Sync games"}</button>
          <button type="button" onClick={() => void handleSyncPackages()} disabled={syncingPackages} className="admin-button admin-button-secondary justify-center cursor-pointer disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${syncingPackages ? "animate-spin" : ""}`} />{syncingPackages ? "Syncing packages…" : "Sync packages"}</button>
        </div>
        <div className="flex flex-wrap gap-4 text-xs"><Link href="/admin/games" className="text-emerald-300 hover:text-white">Manage games</Link><Link href="/admin/packages" className="text-emerald-300 hover:text-white">Manage packages</Link><Link href="/admin/smm-services" className="text-emerald-300 hover:text-white">SMM catalog</Link></div>
      </section>
    </main>
  );
}
