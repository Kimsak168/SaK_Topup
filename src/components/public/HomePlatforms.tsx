import { getPublicSmmCatalogSummary } from "@/lib/services/smmPublicCatalogService";
import { PlatformCard } from "./PlatformCard";

const PLATFORMS = [
  { id: "tiktok", name: "TikTok" },
  { id: "telegram", name: "Telegram" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "youtube", name: "YouTube" },
];

export async function HomePlatforms() {
  const summary = await getPublicSmmCatalogSummary().catch(() => null);
  const counts = new Map(summary?.platforms.map((platform) => [platform.id, platform.count]));
  return (
    <div className="w-full text-slate-100">
      <div id="services" className="scroll-mt-28" />
      <section id="all-platforms" className="mt-12 sm:mt-20 mb-14 sm:mb-24 scroll-mt-28" aria-labelledby="all-platforms-title">
        <div className="storefront-catalogue-heading mb-5 sm:mb-7">
          <div>
            <h2 id="all-platforms-title" className="text-xl sm:text-2xl font-bold">បណ្តាញសង្គមទាំងអស់</h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
              ជ្រើសរើសបណ្តាញសង្គមដើម្បីស្វែងរកសេវាកម្មបង្កើនការចូលរួម និងការតាមដាន។
            </p>
          </div>
          {summary && summary.catalogTotal > 0 && (
            <span className="storefront-game-count">{summary.catalogTotal.toLocaleString()} សេវាកម្ម</span>
          )}
        </div>
        <div className="storefront-grid">
          {PLATFORMS.map((platform) => <PlatformCard key={platform.id} platform={{ ...platform, count: counts.get(platform.id) }} />)}
        </div>
      </section>
      <div id="social-services" className="scroll-mt-28" />
    </div>
  );
}
