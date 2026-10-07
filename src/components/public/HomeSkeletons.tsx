export function BannerSkeleton() {
  return (
    <div role="status" aria-label="Loading promotions" className="w-full space-y-3">
      <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card/60 shadow-soft h-[138px] sm:h-auto" style={{ aspectRatio: "5 / 2" }}>
        <div className="absolute inset-0 bg-gradient-to-r from-muted/40 via-muted/80 to-muted/40 animate-pulse" />
        <div className="absolute bottom-4 left-6 h-4 w-32 rounded-md bg-muted/60" />
      </div>
      <div aria-hidden="true" className="h-7 sm:h-11" />
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl sm:rounded-2xl overflow-hidden border border-pink-100/90 bg-white shadow-xs">
      {/* Thumbnail skeleton */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-pink-50/50">
        <div className="absolute inset-0 bg-gradient-to-r from-pink-50/40 via-pink-100/40 to-pink-50/40 animate-pulse" />
      </div>
      {/* Content skeleton */}
      <div className="flex flex-1 flex-col justify-between p-1.5 min-[360px]:p-2 sm:p-3 space-y-2 sm:space-y-3">
        <div className="space-y-1">
          <div className="h-8 w-4/5 rounded bg-pink-100/60 animate-pulse" />
        </div>
        <div className="h-7 sm:h-9 w-full rounded-lg sm:rounded-xl bg-pink-200/50 animate-pulse" />
      </div>
    </div>
  );
}

export function GameGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading games" className="grid grid-cols-2 min-[360px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}
