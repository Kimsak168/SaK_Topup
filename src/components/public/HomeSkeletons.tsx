export function BannerSkeleton() {
  return (
    <div role="status" aria-label="Loading promotions" className="mx-auto w-full max-w-[1100px] space-y-1.5">
      <div
        className="relative w-full aspect-video overflow-hidden rounded-[10px] md:rounded-[12px] border border-[#BBF7D0] shadow-xs"
        style={{ aspectRatio: "16 / 9" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#F0FDF4] via-[#DCFCE7]/50 to-[#F0FDF4] animate-pulse" />
      </div>
      <div aria-hidden="true" className="h-3" />
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div aria-hidden="true" className="game-card flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white sm:rounded-[16px]">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#F0FDF4]">
        <div className="absolute inset-0 bg-[#DCFCE7]/60 motion-safe:animate-pulse" />
      </div>
      <div className="game-card-title flex h-12 min-w-0 shrink-0 items-center justify-center bg-white px-2 py-1.5 sm:h-14 sm:px-3">
        <div className="h-3.5 w-3/4 rounded bg-[#BBF7D0]/60 motion-safe:animate-pulse sm:h-4" />
      </div>
    </div>
  );
}

export function GameGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading games" className="storefront-grid">
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CatalogueSkeleton() {
  return (
    <div role="status" aria-label="Loading catalogue">
      <div className="home-package-marquee-skeleton" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
      </div>
      <div aria-hidden="true" className="h-11 w-full max-w-[720px] rounded-xl border border-[#DCFCE7] bg-white motion-safe:animate-pulse" />
      <div aria-hidden="true" className="my-3 h-9 rounded-[10px] bg-[#DCFCE7]/40 motion-safe:animate-pulse sm:h-10" />
      <div className="storefront-catalogue-heading">
        <div>
          <h2>ហ្គេមពេញនិយម</h2>
        </div>
      </div>
      <GameGridSkeleton count={10} />
    </div>
  );
}

export function PlatformsSkeleton() {
  return (
    <div className="mt-12 sm:mt-20 mb-14 sm:mb-24" role="status" aria-label="Loading platforms">
      <div aria-hidden="true" className="mb-5 h-16 rounded-xl bg-white/50 motion-safe:animate-pulse sm:mb-7" />
      <GameGridSkeleton count={5} />
    </div>
  );
}

export function GameEventsSkeleton() {
  return (
    <section className="home-section" role="status" aria-label="Loading game events">
      <div className="home-section-heading mb-4">
        <div>
          <div aria-hidden="true" className="mb-2 h-2.5 w-28 rounded bg-pink-200/70 motion-safe:animate-pulse" />
          <div aria-hidden="true" className="h-7 w-40 rounded bg-pink-200/70 motion-safe:animate-pulse" />
          <div aria-hidden="true" className="mt-2 h-3 w-72 max-w-full rounded bg-pink-100 motion-safe:animate-pulse" />
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-[19px] border border-pink-100 bg-white shadow-sm">
            <div className="aspect-video bg-gradient-to-br from-pink-100 via-rose-50 to-purple-100 motion-safe:animate-pulse" />
            <div className="space-y-3 p-4">
              <div className="h-3 w-28 rounded bg-pink-100 motion-safe:animate-pulse" />
              <div className="h-5 w-3/4 rounded bg-pink-100 motion-safe:animate-pulse" />
              <div className="h-3 w-full rounded bg-pink-50 motion-safe:animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-pink-50 motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
