"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type ServiceRow = {
  id: string;
  supplierServiceId: string;
  name: string;
  platform: string;
  serviceType: string;
  category: string;
  description: string;
  sourceCategory?: string;
  sourceDescription?: string;
  rate: number | null;
  min: number | null;
  max: number | null;
  refill: boolean | null;
  supplierAvailable: boolean;
  isActive: boolean;
  isValid: boolean;
  duplicateCandidate: boolean;
  requiresReview: boolean;
  reviewFlags: string[];
  syncedAt: string;
};

type AdminData = {
  stats: { total: number; active: number; inactive: number; unavailable: number; manualReview: number; duplicateGroups: number; duplicateCandidates: number; invalid: number; needsReview: number };
  services: ServiceRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  audit: { action: string; actor: string; planHash?: string; summary: Record<string, unknown>; createdAt: string }[];
};

type SyncPlan = {
  hash: string;
  sourceCount: number;
  validCount: number;
  invalidCount: number;
  unavailableCount: number;
  duplicateSupplierIdCount: number;
  duplicateNameCount: number;
  manualReviewCount: number;
  services: { supplierServiceId: string; name: string; platform: string; category: string; rate: number | null; isValid: boolean; requiresReview: boolean; reviewFlags: string[] }[];
};

type CleanupPlan = {
  hash: string;
  total: number;
  counts: { valid: number; duplicates: number; invalid: number; unavailable: number; manualReview: number; proposedChanges: number; safeToApply: number };
  entries: { supplierServiceId: string; name: string; status: string; safeToApply: boolean; orderReferenced: boolean; orderReferences: number; paymentReferences: number; changes: Record<string, unknown>; reviewFlags: string[] }[];
};

const PLATFORMS = ["all", "tiktok", "telegram", "facebook", "instagram", "youtube", "other"];
const PAGE_SIZE = 25;

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Database; tone: string }) {
  return (
    <div className="admin-stat-card">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div>
      <div><p className="text-xs text-[#94A3B8]">{label}</p><p className="mt-1 text-xl font-bold text-[#F8FAFC]">{value.toLocaleString()}</p></div>
    </div>
  );
}

export default function AdminSmmServicesPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ search, platform, status, page: String(page), limit: String(PAGE_SIZE) });
      const response = await fetch(`/api/admin/smm-services?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Could not load catalog data");
      setData(payload as AdminData);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load catalog data");
    } finally {
      setLoading(false);
    }
  }, [search, platform, status, page]);

  useEffect(() => { void load(); }, [load]);

  const pageCount = Math.max(1, data?.pagination.totalPages || 1);
  const visibleIds = useMemo(() => data?.services.map((service) => service.id) || [], [data?.services]);

  async function postAction(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/admin/smm-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Catalog action failed");
    return payload;
  }

  async function previewSync() {
    try {
      setWorking(true);
      const payload = await postAction("preview-sync");
      setSyncPlan(payload.plan as SyncPlan);
      setCleanupPlan(null);
      setConfirmation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not preview supplier sync");
    } finally { setWorking(false); }
  }

  async function applySync() {
    if (!syncPlan) return;
    try {
      setWorking(true);
      const result = await postAction("apply-sync", { planHash: syncPlan.hash, confirmation });
      toast.success(`Catalog synchronized. ${result.summary.backedUpRecords} existing records backed up; invalid and ambiguous services remain inactive.`);
      setSyncPlan(null);
      setConfirmation("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Supplier sync failed");
    } finally { setWorking(false); }
  }

  async function previewCleanup() {
    try {
      setWorking(true);
      const payload = await postAction("preview-cleanup");
      setCleanupPlan(payload.plan as CleanupPlan);
      setSyncPlan(null);
      setConfirmation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not preview cleanup");
    } finally { setWorking(false); }
  }

  async function applyCleanup() {
    if (!cleanupPlan) return;
    try {
      setWorking(true);
      const payload = await postAction("apply-cleanup", { planHash: cleanupPlan.hash, confirmation });
      toast.success(`Cleanup complete: ${payload.summary.updated} safe display fields normalized; ${payload.summary.backedUpRecords} records backed up. No records were deleted.`);
      setCleanupPlan(null);
      setConfirmation("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Catalog cleanup failed");
    } finally { setWorking(false); }
  }

  async function bulkStatus(nextStatus: "active" | "inactive") {
    if (!selected.length) return;
    try {
      setWorking(true);
      const payload = await postAction("bulk-status", { status: nextStatus, serviceIds: selected });
      toast.success(`${payload.changed} service${payload.changed === 1 ? "" : "s"} updated.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update selected services");
    } finally { setWorking(false); }
  }

  return (
    <main className="admin-page space-y-5">
      <header className="admin-page-heading">
        <div>
          <h1>Social Media Services</h1>
          <p className="admin-page-description">Review the real supplier catalog, preview changes, and manage which validated services appear publicly.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="admin-button admin-button-secondary" onClick={() => void previewCleanup()} disabled={working}>
            <ShieldCheck className="h-4 w-4" /> Preview cleanup
          </button>
          <button className="admin-button admin-button-primary" onClick={() => void previewSync()} disabled={working}>
            <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} /> Preview supplier sync
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active services" value={data?.stats.active || 0} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-300" />
        <StatCard label="Inactive / unavailable" value={(data?.stats.inactive || 0) + (data?.stats.unavailable || 0)} icon={Database} tone="bg-slate-500/10 text-slate-300" />
        <StatCard label="Duplicate candidates" value={data?.stats.duplicateCandidates || 0} icon={Users} tone="bg-amber-500/10 text-amber-300" />
        <StatCard label="Invalid / needs review" value={data?.stats.needsReview || 0} icon={AlertTriangle} tone="bg-rose-500/10 text-rose-300" />
      </section>

      {(syncPlan || cleanupPlan) && (
        <section className="admin-card space-y-4 border border-amber-500/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-white"><Sparkles className="h-4 w-4 text-emerald-300" />{syncPlan ? "Supplier sync preview" : "Cleanup preview"}</h2>
              <p className="mt-1 text-xs text-[#94A3B8]">Review the counts below. Nothing changes until the exact confirmation phrase is entered and applied.</p>
            </div>
            <button className="admin-button admin-button-secondary" onClick={() => { setSyncPlan(null); setCleanupPlan(null); setConfirmation(""); }}>Close</button>
          </div>
          {syncPlan && <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {[ ["Supplier records", syncPlan.sourceCount], ["Validated", syncPlan.validCount], ["Invalid", syncPlan.invalidCount], ["Unavailable", syncPlan.unavailableCount], ["Duplicate IDs", syncPlan.duplicateSupplierIdCount], ["Manual review", syncPlan.manualReviewCount] ].map(([label, value]) => <div className="rounded-xl border border-[#263246] bg-[#0C1422] p-3" key={label}><p className="text-[11px] text-[#94A3B8]">{label}</p><p className="mt-1 font-bold text-white">{Number(value).toLocaleString()}</p></div>)}
            </div>
            <div className="max-h-52 overflow-auto rounded-xl border border-[#263246]">
              {syncPlan.services.slice(0, 20).map((service) => <div key={service.supplierServiceId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263246] px-3 py-2 text-xs last:border-0"><span className="min-w-0 truncate text-white">{service.name || "Unnamed service"}</span><span className="text-[#94A3B8]">{service.platform} · {service.category}</span><span className={service.isValid && !service.requiresReview ? "text-emerald-300" : "text-amber-300"}>{service.isValid && !service.requiresReview ? "Validated" : "Review required"}</span></div>)}
            </div>
            <p className="text-xs text-[#94A3B8]">Shows up to 20 records. Existing supplier IDs and order history are preserved; stale supplier records are marked unavailable instead of deleted.</p>
          </>}
          {cleanupPlan && <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {Object.entries(cleanupPlan.counts).map(([label, value]) => <div className="rounded-xl border border-[#263246] bg-[#0C1422] p-3" key={label}><p className="text-[11px] capitalize text-[#94A3B8]">{label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</p><p className="mt-1 font-bold text-white">{value.toLocaleString()}</p></div>)}
            </div>
            <div className="max-h-52 overflow-auto rounded-xl border border-[#263246]">
              {cleanupPlan.entries.filter((entry) => Object.keys(entry.changes).length || entry.reviewFlags.length || entry.orderReferenced).slice(0, 20).map((entry) => <div key={entry.supplierServiceId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263246] px-3 py-2 text-xs last:border-0"><span className="min-w-0 truncate text-white">{entry.name || "Unnamed service"}</span><span className="text-[#94A3B8]">{Object.keys(entry.changes).join(", ") || "No automatic change"}{entry.orderReferenced ? ` · ${entry.orderReferences} orders / ${entry.paymentReferences} payments` : ""}</span><span className={entry.safeToApply ? "text-emerald-300" : "text-amber-300"}>{entry.safeToApply ? "Safe normalization" : "Manual review"}</span></div>)}
            </div>
            <p className="text-xs text-[#94A3B8]">The cleanup only changes normalized display fields on unambiguous, valid, unreferenced records. It never deletes services or edits orders or payments.</p>
          </>}
          <div className="flex flex-col gap-2 border-t border-[#263246] pt-4 sm:flex-row sm:items-center">
            <input className="admin-input flex-1" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={syncPlan ? "Type SYNC REAL SUPPLIER CATALOG" : "Type APPLY SMM CLEANUP"} aria-label="Type the required confirmation phrase" />
            <button className="admin-button admin-button-primary" disabled={working || (syncPlan ? confirmation !== "SYNC REAL SUPPLIER CATALOG" : confirmation !== "APPLY SMM CLEANUP")} onClick={() => void (syncPlan ? applySync() : applyCleanup())}>
              {working ? "Applying…" : syncPlan ? "Apply supplier sync" : "Apply safe cleanup"}
            </button>
          </div>
        </section>
      )}

      <section className="admin-card space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input className="admin-input w-full pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search service, platform, or supplier ID" aria-label="Search services" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="admin-input" value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }} aria-label="Filter by platform">{PLATFORMS.map((item) => <option key={item} value={item}>{item === "all" ? "All platforms" : item}</option>)}</select>
            <select className="admin-input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="unavailable">Unavailable</option><option value="duplicate">Duplicate candidates</option><option value="invalid">Invalid</option><option value="review">Needs review</option></select>
          </div>
        </div>

        {selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><span className="text-sm text-emerald-100">{selected.length} selected</span><div className="flex gap-2"><button className="admin-button admin-button-secondary" disabled={working} onClick={() => void bulkStatus("inactive")}>Deactivate selected</button><button className="admin-button admin-button-primary" disabled={working} onClick={() => void bulkStatus("active")}>Activate selected</button></div></div>}

        <div className="overflow-x-auto rounded-2xl border border-[#263246]">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-[#0C1422] text-[#94A3B8]"><tr><th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all services on this page" checked={visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))} onChange={(event) => setSelected(event.target.checked ? visibleIds : [])} /></th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Platform / type</th><th className="px-3 py-3">Price / 1,000</th><th className="px-3 py-3">Limits</th><th className="px-3 py-3">Availability</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-4 py-12 text-center text-[#94A3B8]">Loading database services…</td></tr>
                : !data?.services.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-[#94A3B8]">No catalog records match these filters. Preview a supplier sync to import real services.</td></tr>
                  : data.services.map((service) => <tr key={service.id} className="border-t border-[#263246] align-top">
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${service.name || "unnamed service"}`} checked={selected.includes(service.id)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, service.id] : items.filter((id) => id !== service.id))} /></td>
                    <td className="max-w-[340px] px-3 py-3"><p className="font-semibold text-white">{service.name || "Unnamed service"}</p><p className="mt-1 text-[10px] text-[#64748B]">Supplier ID: {service.supplierServiceId}</p>{(service.reviewFlags.length > 0 || service.duplicateCandidate) && <><p className="mt-1 text-[10px] text-amber-300">{[...service.reviewFlags, ...(service.duplicateCandidate ? ["duplicate_candidate"] : [])].join(" · ")}</p><p className="mt-1 line-clamp-2 text-[10px] text-[#94A3B8]">Supplier source: {[service.sourceCategory, service.sourceDescription].filter(Boolean).join(" · ") || "No supplier details provided"}</p></>}</td>
                    <td className="px-3 py-3 capitalize text-[#CBD5E1]">{service.platform}<p className="mt-1 text-[10px] text-[#64748B]">{service.category}</p></td>
                    <td className="px-3 py-3 font-mono text-[#CBD5E1]">{service.rate && service.rate > 0 ? `$${service.rate.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 font-mono text-[#94A3B8]">{service.min?.toLocaleString() || "—"} – {service.max?.toLocaleString() || "—"}</td>
                    <td className="px-3 py-3"><span className={service.isActive && service.isValid && !service.duplicateCandidate ? "text-emerald-300" : service.duplicateCandidate || service.requiresReview || !service.isValid ? "text-amber-300" : "text-slate-500"}>{service.isActive && service.isValid && !service.duplicateCandidate ? "Active" : service.duplicateCandidate ? "Duplicate / review" : service.supplierAvailable ? "Inactive / review" : "Unavailable"}</span></td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-[#94A3B8]"><span>{data?.pagination.total.toLocaleString() || 0} records</span><div className="flex items-center gap-3"><button className="admin-button admin-button-secondary" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></button><span>Page {page} of {pageCount}</span><button className="admin-button admin-button-secondary" aria-label="Next page" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="h-4 w-4" /></button></div></div>
      </section>

      <section className="admin-card">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold text-white">Catalog audit history</h2><p className="mt-1 text-xs text-[#94A3B8]">Recent sync and cleanup actions by administrator.</p></div><button className="admin-button admin-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button></div>
        {!data?.audit.length ? <p className="py-5 text-xs text-[#64748B]">No catalog changes have been applied.</p> : <div className="space-y-2">{data.audit.map((entry, index) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#263246] bg-[#0C1422] px-3 py-2 text-xs" key={`${entry.createdAt}-${index}`}><span className="font-semibold capitalize text-white">{entry.action.replaceAll("_", " ")}</span><span className="text-[#94A3B8]">{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</span><span className="text-[#94A3B8]">{Object.entries(entry.summary).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</span></div>)}</div>}
      </section>
    </main>
  );
}
