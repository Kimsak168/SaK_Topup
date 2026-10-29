import { getClientGames } from "@/lib/services/gameService";
import { getPublicBanners } from "@/lib/services/bannerService";
import { getPublicSmmCatalog } from "@/lib/services/smmCatalogService";
import { PromotionalBanner } from "@/components/public/PromotionalBanner";
import { HomeCatalogue } from "@/components/public/HomeCatalogue";
import SmmStorefront from "@/components/public/SmmStorefront";
import { Metadata } from "next";

// Read the database-backed catalogue at request time. Its unstable_cache entries
// remain reusable and revalidate every five minutes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SakSuuu Game Top-Up & Social Media Services ? 24/7",
  description: "Game top-up and social media services for Cambodia.",
};

export default async function HomePage() {
  const [banners, gamesResult, smmCatalogResult] = await Promise.all([
    getPublicBanners().catch(() => []),
    getClientGames(undefined, undefined, { throwOnError: true }).catch(() => null),
    getPublicSmmCatalog({
      page: 1,
      limit: 12,
      platform: "all",
      type: "all",
      category: "All",
      search: "",
      sort: "recommended",
    }).catch(() => null),
  ]);

  const games = gamesResult || [];
  const initialError = gamesResult === null ? "The game catalog is temporarily unavailable." : null;

  const initialSmmData = smmCatalogResult?.success
    ? {
        services: smmCatalogResult.services
          .filter((s): s is typeof s & { min: number; max: number } =>
            typeof s.min === "number" && typeof s.max === "number" && s.min > 0 && s.max >= s.min
          )
          .map((s) => ({
            service: s.service,
            name: s.name,
            category: s.category,
            platform: s.platform,
            serviceType: s.serviceType,
            rate: s.rate,
            min: s.min,
            max: s.max,
            ...(typeof s.refill === "boolean" ? { refill: s.refill } : {}),
            ...(s.description ? { description: s.description } : {}),
          })),
        platforms: smmCatalogResult.platforms,
        categories: smmCatalogResult.categories,
        catalogTotal: smmCatalogResult.catalogTotal,
        total: smmCatalogResult.total,
        totalPages: smmCatalogResult.pagination?.totalPages || 1,
      }
    : undefined;

  return (
    <div className="storefront-home storefront-container">
      {/* 1. Promotional Banner */}
      <div className="storefront-banner-wrap mb-6 sm:mb-8">
        <PromotionalBanner banners={banners} />
      </div>

      {/* 2. Games Section with Game Icons */}
      <HomeCatalogue games={games} initialError={initialError} />

      {/* 3. All Platforms (Social Media Growth) */}
      <SmmStorefront homeLayout initialData={initialSmmData} />
    </div>
  );
}
