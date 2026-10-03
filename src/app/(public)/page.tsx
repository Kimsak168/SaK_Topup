import { getClientGames } from "@/lib/services/gameService";
import { getPublicBanners } from "@/lib/services/bannerService";
import { PromotionalBanner } from "@/components/public/PromotionalBanner";
import { GameSearch } from "@/components/public/GameSearch";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SakSuuu Game Top-Up — បញ្ចូលលុយហ្គេមលឿនរហ័ស 24/7",
  description:
    "Official game top-up platform for Cambodia. Instant recharge for Free Fire, PUBG Mobile, Mobile Legends, and more with Vizo and G2Bulk APIs.",
};

export default async function HomePage() {
  // Fetch active promotional banners and enabled games from MongoDB
  const [banners, games] = await Promise.all([
    getPublicBanners(),
    getClientGames(),
  ]);

  return (
    <div className="relative w-full overflow-x-clip text-foreground">
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-pink-600/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-80 right-10 w-[350px] h-[350px] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Main Content Container — flows naturally into footer */}
      <div className="w-[92%] max-w-[1500px] mx-auto px-1 sm:px-2 pt-2 pb-10 sm:pt-4 sm:pb-14 space-y-8 sm:space-y-10 relative z-10">
        {/* 1. Promotional Banner Carousel directly below navbar */}
        {banners.length > 0 && (
          <section className="w-full">
            <PromotionalBanner banners={banners} />
          </section>
        )}

        {/* 2. All Games Section: "ហ្គេមទាំងអស់", search bar, and 5-col game cards */}
        <GameSearch initialGames={games} />
      </div>
    </div>
  );
}
