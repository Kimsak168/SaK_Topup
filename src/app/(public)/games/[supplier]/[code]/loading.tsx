export default function GameLoading() {
  return (
    <div role="status" aria-label="Loading game" className="max-w-7xl mx-auto px-2 min-[360px]:px-3 sm:px-6 lg:px-8 py-2 min-[360px]:py-3 sm:py-8 space-y-4 sm:space-y-6">
      <span className="sr-only">Loading game packages...</span>
      <div aria-hidden="true" className="h-24 rounded-[14px] bg-[#F0FDF4] border border-[#DCFCE7] animate-pulse motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-48 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] animate-pulse motion-reduce:animate-none" />
          <div className="topup-package-grid">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[54px] sm:h-[58px] rounded-xl bg-[#F0FDF4] dark:bg-[#0D0914] border border-[#DCFCE7] dark:border-[#2E1F45] animate-pulse motion-reduce:animate-none" />)}
          </div>
        </div>
        <div className="h-80 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}
