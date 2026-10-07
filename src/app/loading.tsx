export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="w-full min-h-[50vh] flex flex-col items-center justify-center py-16 px-4">
      {/* Top subtle indeterminate progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 z-50 animate-pulse" />

      {/* Shimmering pulse indicator */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin" />
          <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 animate-pulse" />
        </div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">
          កំពុងផ្ទុក...
        </p>
      </div>
    </div>
  );
}
