export default function GameLoading() {
  return (
    <div role="status" aria-label="Loading game" className="max-w-7xl mx-auto px-2 min-[360px]:px-3 sm:px-6 lg:px-8 py-2 min-[360px]:py-3 sm:py-8 space-y-4 sm:space-y-6">
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
