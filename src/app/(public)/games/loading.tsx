import { GameGridSkeleton } from "@/components/public/HomeSkeletons";

export default function CatalogueLoading() {
  return (
    <div role="status" aria-label="Loading games" className="max-w-7xl mx-auto px-4 py-10 space-y-10">
      <div aria-hidden="true" className="mx-auto h-32 max-w-3xl rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      <GameGridSkeleton count={10} />
    </div>
  );
}
