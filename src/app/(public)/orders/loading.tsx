export default function OrdersLoading() {
  return (
    <div role="status" aria-label="Loading orders" className="storefront-container py-6">
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 z-50 animate-pulse" />

      <div className="max-w-3xl mx-auto space-y-5 px-4">
        <div className="h-7 w-40 rounded-lg bg-white/10 animate-pulse" />

        {/* Search skeleton */}
        <div className="h-12 w-full rounded-xl bg-white/10 animate-pulse" />

        {/* Order card skeletons */}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-5 w-36 rounded bg-white/10 animate-pulse" />
              <div className="h-6 w-20 rounded-full bg-white/10 animate-pulse" />
            </div>
            <div className="h-4 w-48 rounded bg-white/10 animate-pulse" />
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
              <div className="h-4 w-16 rounded bg-white/10 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
