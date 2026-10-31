import { Suspense } from "react";
import { getClientGames, getNormalizedPackages } from "@/lib/services/gameService";
import { getPublicBanners } from "@/lib/services/bannerService";
import { PromotionalBanner } from "@/components/public/PromotionalBanner";
import { HomeCatalogue } from "@/components/public/HomeCatalogue";
import { HomeFeaturedPackages } from "@/components/public/HomeFeaturedPackages";
import { HomePlatforms } from "@/components/public/HomePlatforms";
import { HomeGameEvents } from "@/components/public/HomeGameEvents";
import { BannerSkeleton, CatalogueSkeleton, GameEventsSkeleton, PlatformsSkeleton } from "@/components/public/HomeSkeletons";
import { Metadata } from "next";

// Read the database-backed catalogue at request time. Its unstable_cache entries
// remain reusable and revalidate every five minutes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SakSuuu Game Top-Up & Social Media Services — 24/7",
  description: "Game top-up and social media services for Cambodia.",
};

async function HomeBanners() {
  const banners = await getPublicBanners().catch(() => []);
  return <PromotionalBanner banners={banners} />;
}

async function HomeGames() {
  const games = await getClientGames(undefined, undefined, { throwOnError: true }).catch(() => null);
  const catalogue = games || [];
  const featuredGroups = await Promise.all(catalogue
    .filter((game) => game.supplier === "webbuilder" && game.checkoutSupported !== false)
    .map(async (game) => ({
      game,
      packages: await getNormalizedPackages(game.supplier, game.code).catch(() => []),
      variant: /free\s*fire|freefire/i.test(`${game.name} ${game.slug} ${game.code}`)
        ? "free-fire" as const
        : /mobile\s*legends|mlbb/i.test(`${game.name} ${game.slug} ${game.code}`)
          ? "mobile-legends" as const
          : "other" as const,
    })));

  return (
    <>
      <HomeFeaturedPackages groups={featuredGroups} />
      <HomeCatalogue games={catalogue} initialError={games === null ? "The game catalog is temporarily unavailable." : null} />
    </>
  );
}

export default function HomePage() {
  return (
    <div className="storefront-home storefront-container">
      {/* 1. Promotional Banner */}
      <div className="storefront-banner-wrap mb-3 sm:mb-4">
        <Suspense fallback={<BannerSkeleton />}>
          <HomeBanners />
        </Suspense>
      </div>

      {/* 2. Games Section with Game Icons */}
      <Suspense fallback={<CatalogueSkeleton />}>
        <HomeGames />
      </Suspense>

      {/* 3. All Platforms (Social Media Growth) */}
      <Suspense fallback={<PlatformsSkeleton />}>
        <HomePlatforms />
      </Suspense>

      {/* 4. Game events follow the services section */}
      <Suspense fallback={<GameEventsSkeleton />}>
        <HomeGameEvents />
      </Suspense>
    </div>
  );
}
