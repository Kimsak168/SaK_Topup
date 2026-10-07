export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading dashboard" className="admin-page">
      <span className="sr-only">Loading dashboard...</span>
      <div className="space-y-3"><div className="admin-skeleton h-8 w-52 rounded-lg" /><div className="admin-skeleton h-4 w-72 max-w-full rounded" /></div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="admin-skeleton h-32 rounded-2xl" />)}
      </div>
      <div className="admin-skeleton h-80 rounded-2xl" />
    </div>
  );
}
