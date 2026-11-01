export default function AdminSmmLoading() {
  return (
    <div role="status" aria-label="Loading SMM services" className="space-y-5">
      <span className="sr-only">Loading SMM services…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-48 rounded-lg" /><div className="admin-skeleton h-4 w-64 max-w-full rounded" /></div>
      <div className="flex gap-3">
        <div className="admin-skeleton h-10 w-40 rounded-xl" />
        <div className="admin-skeleton h-10 flex-1 rounded-xl" />
      </div>
      <div className="admin-skeleton h-80 rounded-xl" />
    </div>
  );
}
