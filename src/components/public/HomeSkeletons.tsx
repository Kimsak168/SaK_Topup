export function BannerSkeleton() {
  return (
    <div className="w-full space-y-3">
      <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card/60 shadow-soft" style={{ aspectRatio: "5 / 2" }}>
        <div className="absolute inset-0 bg-gradient-to-r from-muted/40 via-muted/80 to-muted/40 animate-pulse" />
        <div className="absolute bottom-4 left-6 h-4 w-32 rounded-md bg-muted/60" />
      </div>
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-border/60 bg-card/50 shadow-soft">
      {/* Thumbnail skeleton */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/50">
        <div className="absolute inset-0 bg-gradient-to-r from-muted/30 via-muted/70 to-muted/30 animate-pulse" />
      </div>
      {/* Content skeleton */}
      <div className="flex flex-1 flex-col justify-between p-3.5 sm:p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-4 w-4/5 rounded bg-muted/70 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="h-9 sm:h-10 w-full rounded-xl bg-muted/60 animate-pulse" />
      </div>
    </div>
  );
}

export function GameGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}
