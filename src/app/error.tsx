"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-rose-500/30 text-destructive mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <h2 className="text-2xl font-black text-foreground">Something Went Wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        {error.message || "An unexpected error occurred while processing your request. Please try again."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary transition-colors shadow-soft cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </button>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-5 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
        >
          <Home className="h-4 w-4" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
