export default function AdminPaymentsLoading() {
  return (
    <div role="status" aria-label="Loading payments" className="space-y-5">
      <span className="sr-only">Loading payments…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-40 rounded-lg" /><div className="admin-skeleton h-4 w-56 max-w-full rounded" /></div>
      <div className="admin-stats-grid">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="admin-skeleton min-h-24 rounded-xl" />)}
      </div>
      <div className="admin-skeleton h-72 rounded-xl" />
    </div>
  );
}
