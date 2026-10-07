export default function GameLoading() {
  return (
    <div role="status" aria-label="Loading game" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <span className="sr-only">Loading game packages...</span>
      <div aria-hidden="true" className="h-24 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-48 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-2 min-[340px]:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-1.5 min-[360px]:gap-2 sm:gap-3">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 rounded-lg sm:h-24 sm:rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />)}
          </div>
        </div>
        <div className="h-80 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}
