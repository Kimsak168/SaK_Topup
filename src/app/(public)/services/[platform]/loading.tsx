function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-white/[0.07] ${className}`} />;
}

export default function PlatformServiceLoading() {
  return (
    <div
      role="status"
      aria-label="Loading platform services"
      aria-busy="true"
      className="service-topup-page relative min-h-screen w-full overflow-x-clip py-3 text-white sm:py-8"
    >
      <span className="sr-only">Loading platform services...</span>
      <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
        </div>

        <section
          aria-hidden="true"
          className="rounded-2xl border border-violet-500/20 bg-[#0E0918] p-4 shadow-lg sm:p-6"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-2xl sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-6 w-3/4 max-w-md" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
          </div>
        </section>

        <div aria-hidden="true" className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-8">
            <section className="space-y-4 rounded-[16px] border border-violet-500/20 bg-[#0E0918] p-4 shadow-lg sm:p-5">
              <Skeleton className="h-5 w-64 max-w-full" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-3 w-3/4" />
            </section>

            <section className="space-y-4 rounded-[16px] border border-violet-500/20 bg-[#0E0918] p-4 shadow-lg sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-56 max-w-[70%]" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-10 w-full rounded-xl" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-20 w-full rounded-2xl" />
            </section>
          </div>

          <section className="space-y-5 rounded-[16px] border border-violet-500/20 bg-[#0E0918] p-4 shadow-lg sm:p-5 lg:col-span-4">
            <Skeleton className="h-5 w-52 max-w-full" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </section>
        </div>
      </div>
    </div>
  );
}
