export default function Loading() {
  return (
    <div className="min-h-[70vh] w-full flex flex-col items-center justify-center gap-4">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-pink-500/20 border-t-pink-500 animate-spin" />
        <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 animate-pulse" />
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-primary">
        Loading SakSuuu Top-Up...
      </p>
    </div>
  );
}
