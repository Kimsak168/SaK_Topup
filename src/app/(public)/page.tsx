import { Suspense } from "react";
import { getClientGames } from "@/lib/services/gameService";
import { getPublicBanners } from "@/lib/services/bannerService";
import { PromotionalBanner } from "@/components/public/PromotionalBanner";
import { GameSearch } from "@/components/public/GameSearch";
import { BannerSkeleton, GameGridSkeleton } from "@/components/public/HomeSkeletons";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SakSuuu Game Top-Up — បញ្ចូលលុយហ្គេមលឿនរហ័ស 24/7",
  description:
    "Official game top-up platform for Cambodia. Instant recharge for Free Fire, PUBG Mobile, Mobile Legends, and more with Vizo and G2Bulk APIs.",
};

async function BannerSection() {
  const banners = await getPublicBanners();
  if (!banners || banners.length === 0) return null;
  return (
    <section className="w-full">
      <PromotionalBanner banners={banners} />
    </section>
  );
}

async function GamesSection() {
  const games = await getClientGames();
  return <GameSearch initialGames={games} />;
}

export default function HomePage() {
  return (
    <div className="relative w-full overflow-x-clip text-foreground">
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-pink-600/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-80 right-10 w-[350px] h-[350px] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Main Content Container — flows naturally into footer */}
      <div className="w-[92%] max-w-[1500px] mx-auto px-1 sm:px-2 pt-2 pb-10 sm:pt-4 sm:pb-14 space-y-8 sm:space-y-10 relative z-10">
        {/* 1. Promotional Banner Carousel directly below navbar with Suspense streaming */}
        <Suspense fallback={<BannerSkeleton />}>
          <BannerSection />
        </Suspense>

        {/* 2. All Games Section: "ហ្គេមទាំងអស់", search bar, and 5-col game cards */}
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                  ហ្គេមទាំងអស់
                </h2>
                <div className="h-12 max-w-2xl w-full rounded-2xl bg-card border border-border animate-pulse" />
              </div>
              <GameGridSkeleton count={10} />
            </div>
          }
        >
          <GamesSection />
        </Suspense>
      </div>
    </div>
  );
}
