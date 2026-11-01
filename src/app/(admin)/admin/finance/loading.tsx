export default function AdminFinanceLoading() {
  return (
    <div role="status" aria-label="Loading finance" className="space-y-5">
      <span className="sr-only">Loading finance…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-36 rounded-lg" /><div className="admin-skeleton h-4 w-48 max-w-full rounded" /></div>
      <div className="admin-stats-grid">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="admin-skeleton min-h-28 rounded-xl" />)}
      </div>
      <div className="admin-skeleton h-64 rounded-xl" />
    </div>
  );
}
