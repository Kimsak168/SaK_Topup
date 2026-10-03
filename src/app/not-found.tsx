import Link from "next/link";
import { Gamepad2, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent border border-pink-500/30 text-primary mb-4">
        <Gamepad2 className="h-8 w-8" />
      </div>

      <span className="text-xs font-bold uppercase tracking-wider text-primary">
        404 Page Not Found
      </span>
      <h2 className="text-2xl sm:text-3xl font-black text-foreground mt-1">
        Game Not Found
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        The game or page you are looking for doesn&apos;t exist or is currently unavailable.
      </p>

      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary transition-colors shadow-soft"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Browse All Games</span>
        </Link>
      </div>
    </div>
  );
}
