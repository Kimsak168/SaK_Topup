import { Suspense } from "react";
import { getClientGames } from "@/lib/services/gameService";
import { getPublicBanners } from "@/lib/services/bannerService";
import { PromotionalBanner } from "@/components/public/PromotionalBanner";
import { GameSearch } from "@/components/public/GameSearch";
import { BannerSkeleton, CatalogueSkeleton } from "@/components/public/HomeSkeletons";
import { Metadata } from "next";

// Public shell + catalogue are cacheable; admin writes invalidate the page.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "SakSuuu Game Top-Up — បញ្ចូលលុយហ្គេមលឿនរហ័ស 24/7",
  description:
    "Official game top-up platform for Cambodia. Instant recharge for Free Fire, PUBG Mobile, Mobile Legends, and more with WebBuilder API.",
};

async function BannerSection() {
  // Throw on a failed regeneration so ISR retains the last healthy page.
  const banners = await getPublicBanners();

  return (
    <section className="w-full">
      <PromotionalBanner banners={banners} />
    </section>
  );
}

async function GamesSection() {
  const games = await getClientGames(undefined, undefined, { throwOnError: true });
  return <GameSearch initialGames={games} />;
}

export default function HomePage() {
  return (
    <div className="storefront-home storefront-container">
      <div className="storefront-banner-wrap">
        <Suspense fallback={<BannerSkeleton />}>
          <BannerSection />
        </Suspense>
      </div>

      <Suspense fallback={<CatalogueSkeleton />}>
        <GamesSection />
      </Suspense>
    </div>
  );
}
