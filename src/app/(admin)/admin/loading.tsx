export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-5">
      <span className="sr-only">Loading dashboard...</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-52 rounded-lg" /><div className="admin-skeleton h-4 w-72 max-w-full rounded" /></div>
      <div className="admin-stats-grid">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="admin-skeleton min-h-28 rounded-xl" />)}
      </div>
      <div className="admin-skeleton h-64 rounded-xl" />
    </div>
  );
}
