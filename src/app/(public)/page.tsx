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
import { getPackageVariant, selectFeaturedSlides } from "@/lib/featuredPackages";
import type { ClientGame } from "@/types/game";

// Cache at Vercel Edge with ISR (Incremental Static Regeneration).
// Fast sub-50ms response from CDN; regenerates in background every 60 seconds.
export const revalidate = 60;

export const metadata: Metadata = {
  title: {
    absolute: "Asura Store",
  },
  description: "Asura Store — Game top-up and social media services for Cambodia.",
};

async function HomeBanners() {
  const banners = await getPublicBanners().catch(() => []);
  return <PromotionalBanner banners={banners} />;
}

async function HomeGames() {
  const games = await getClientGames(undefined, undefined, { throwOnError: true }).catch(() => null);
  const catalogue = games || [];
  return (
    <>
      <Suspense fallback={
        <div className="home-package-marquee-skeleton" role="status" aria-label="Loading featured packages">
          <div /><div /><div /><div />
        </div>
      }>
        <HomeGamePackages games={catalogue} />
      </Suspense>
      <HomeCatalogue games={catalogue} initialError={games === null ? "The game catalog is temporarily unavailable." : null} />
    </>
  );
}

async function HomeGamePackages({ games }: { games: ClientGame[] }) {
  const featuredGroups = await Promise.all(games
    .filter((game) => game.supplier === "webbuilder" && game.checkoutSupported !== false)
    .map(async (game) => {
      const variant = getPackageVariant(game);
      const packages = await getNormalizedPackages(game.supplier, game.code).catch(() => []);
      const pickedPackages = selectFeaturedSlides(game, packages, variant).map((slide) => slide.pkg);
      return {
        game,
        packages: pickedPackages,
        variant,
      };
    }));

  return <HomeFeaturedPackages groups={featuredGroups} />;
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
