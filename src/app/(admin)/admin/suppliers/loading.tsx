export default function AdminSuppliersLoading() {
  return (
    <div role="status" aria-label="Loading suppliers" className="space-y-5">
      <span className="sr-only">Loading suppliers…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-40 rounded-lg" /><div className="admin-skeleton h-4 w-56 max-w-full rounded" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="admin-skeleton h-32 rounded-xl" />)}
      </div>
    </div>
  );
}
