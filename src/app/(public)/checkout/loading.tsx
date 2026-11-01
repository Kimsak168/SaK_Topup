export default function CheckoutLoading() {
  return (
    <div role="status" aria-label="Loading checkout" className="storefront-container py-6">
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 z-50 animate-pulse" />

      <div className="max-w-2xl mx-auto space-y-6 px-4">
        {/* Back button skeleton */}
        <div className="h-9 w-28 rounded-xl bg-white/5 animate-pulse" />

        {/* Order summary card skeleton */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl bg-white/10 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 rounded bg-white/10 animate-pulse" />
              <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
            </div>
            <div className="h-6 w-20 rounded bg-white/10 animate-pulse" />
          </div>
        </div>

        {/* Player ID input skeleton */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="h-5 w-32 rounded bg-white/10 animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-white/10 animate-pulse" />
        </div>

        {/* Payment button skeleton */}
        <div className="h-14 w-full rounded-2xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 animate-pulse" />
      </div>
    </div>
  );
}
