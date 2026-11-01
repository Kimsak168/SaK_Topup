export default function AdminGamesLoading() {
  return (
    <div role="status" aria-label="Loading games" className="space-y-5">
      <span className="sr-only">Loading games…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-40 rounded-lg" /><div className="admin-skeleton h-4 w-56 max-w-full rounded" /></div>
      <div className="flex gap-3">
        <div className="admin-skeleton h-10 w-32 rounded-xl" />
        <div className="admin-skeleton h-10 flex-1 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="admin-skeleton h-40 rounded-xl" />)}
      </div>
    </div>
  );
}
