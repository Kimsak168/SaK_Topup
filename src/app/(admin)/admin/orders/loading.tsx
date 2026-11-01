export default function AdminOrdersLoading() {
  return (
    <div role="status" aria-label="Loading orders" className="space-y-5">
      <span className="sr-only">Loading orders…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-36 rounded-lg" /><div className="admin-skeleton h-4 w-52 max-w-full rounded" /></div>
      <div className="flex gap-3 flex-wrap">
        <div className="admin-skeleton h-10 w-32 rounded-xl" />
        <div className="admin-skeleton h-10 flex-1 min-w-[120px] rounded-xl" />
      </div>
      <div className="admin-skeleton h-80 rounded-xl" />
    </div>
  );
}
