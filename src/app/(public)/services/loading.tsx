export default function ServicesLoading() {
  return (
    <div role="status" aria-label="Loading services" className="storefront-container py-6">
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 z-50 animate-pulse" />

      <div className="max-w-6xl mx-auto space-y-6 px-4">
        {/* Header skeleton */}
        <div className="text-center space-y-2">
          <div className="h-8 w-64 mx-auto rounded-lg bg-white/10 animate-pulse" />
          <div className="h-4 w-48 mx-auto rounded bg-white/10 animate-pulse" />
        </div>

        {/* Platform tabs skeleton */}
        <div className="flex gap-3 overflow-hidden pb-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 w-28 rounded-full bg-white/10 animate-pulse shrink-0" />
          ))}
        </div>

        {/* Category filter skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-48 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-10 flex-1 rounded-xl bg-white/10 animate-pulse" />
        </div>

        {/* Service cards grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-6 w-24 rounded-full bg-white/10 animate-pulse" />
                <div className="h-6 w-16 rounded bg-white/10 animate-pulse" />
              </div>
              <div className="h-4 w-full rounded bg-white/10 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-white/10 animate-pulse" />
              <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
