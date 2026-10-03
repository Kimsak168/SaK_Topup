import { RefreshCw } from "lucide-react";

export default function GameLoading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-accent border border-pink-500/20 text-primary">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
      <p className="text-sm font-semibold text-secondary-foreground">
        Loading game packages and live pricing...
      </p>
    </div>
  );
}
