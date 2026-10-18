import { CatalogueSkeleton } from "@/components/public/HomeSkeletons";

export default function CatalogueLoading() {
  return (
    <div className="storefront-container storefront-catalogue-page">
      <div aria-hidden="true" className="mb-5 h-20 max-w-xl rounded-xl bg-[#DCFCE7]/40 motion-safe:animate-pulse" />
      <CatalogueSkeleton />
    </div>
  );
}
