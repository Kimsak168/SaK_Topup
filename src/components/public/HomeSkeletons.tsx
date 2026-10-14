export function BannerSkeleton() {
  return (
    <div role="status" aria-label="Loading promotions" className="mx-auto w-[96%] sm:w-[94%] max-w-[1100px] space-y-2">
      <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-[#BBF7D0] bg-white shadow-xs">
        <div className="absolute inset-0 bg-gradient-to-r from-[#F0FDF4] via-[#DCFCE7]/50 to-[#F0FDF4] animate-pulse" />
        <div className="absolute bottom-4 left-6 h-4 w-32 rounded-md bg-[#DCFCE7]" />
      </div>
      <div aria-hidden="true" className="h-4" />
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="flex flex-col rounded-[12px] sm:rounded-[14px] overflow-hidden border border-[#BBF7D0] bg-white shadow-xs">
      {/* Thumbnail skeleton */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F0FDF4]">
        <div className="absolute inset-0 bg-gradient-to-r from-[#F0FDF4] via-[#DCFCE7]/50 to-[#F0FDF4] animate-pulse" />
      </div>
      {/* Content skeleton with matching compact spacing */}
      <div className="flex flex-col px-2 min-[360px]:px-2.5 pt-2 pb-2.5">
        <div className="flex h-[28px] min-[360px]:h-[30px] sm:h-[34px] items-center justify-center">
          <div className="h-3.5 sm:h-4 w-4/5 rounded bg-[#DCFCE7]/60 animate-pulse" />
        </div>
        <div className="mt-2 h-[28px] min-[360px]:h-[30px] sm:h-[36px] w-full rounded-[9px] sm:rounded-[11px] bg-[#BBF7D0]/50 animate-pulse" />
      </div>
    </div>
  );
}

export function GameGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading games" className="grid grid-cols-2 min-[340px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 lg:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}
