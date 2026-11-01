export default function AdminPackagesLoading() {
  return (
    <div role="status" aria-label="Loading packages" className="space-y-5">
      <span className="sr-only">Loading packages…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-44 rounded-lg" /><div className="admin-skeleton h-4 w-60 max-w-full rounded" /></div>
      <div className="flex gap-3 flex-wrap">
        <div className="admin-skeleton h-10 w-40 rounded-xl" />
        <div className="admin-skeleton h-10 w-36 rounded-xl" />
        <div className="admin-skeleton h-10 flex-1 min-w-[120px] rounded-xl" />
      </div>
      <div className="admin-skeleton h-96 rounded-xl" />
    </div>
  );
}
