export default function AdminEventsLoading() {
  return (
    <div role="status" aria-label="Loading events" className="space-y-5">
      <span className="sr-only">Loading events…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-40 rounded-lg" /><div className="admin-skeleton h-4 w-48 max-w-full rounded" /></div>
      <div className="admin-skeleton h-10 w-40 rounded-xl" />
      <div className="admin-skeleton h-64 rounded-xl" />
    </div>
  );
}
