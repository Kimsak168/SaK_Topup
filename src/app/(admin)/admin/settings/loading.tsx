export default function AdminSettingsLoading() {
  return (
    <div role="status" aria-label="Loading settings" className="space-y-5">
      <span className="sr-only">Loading settings…</span>
      <div className="space-y-1.5"><div className="admin-skeleton h-7 w-36 rounded-lg" /><div className="admin-skeleton h-4 w-52 max-w-full rounded" /></div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="admin-skeleton h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
