"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, Heart, Sparkles, Users } from "lucide-react";
import { SpiderWebSvg, getHalloweenSticker } from "./HalloweenAccents";

export interface PlatformItem {
  id: string;
  name: string;
  count?: number;
  image?: string;
}

const PLATFORM_IMAGES: Record<string, string> = {
  tiktok: "/images/platforms/tiktok-icon.svg",
  telegram: "/images/platforms/telegram-icon.svg",
  facebook: "/images/platforms/facebook-icon.svg",
  instagram: "/images/platforms/instagram-icon.svg",
  youtube: "/images/platforms/youtube-icon.svg",
};

export const PlatformCard = memo(function PlatformCard({
  platform,
}: {
  platform: PlatformItem;
}) {
  const normId = platform.id.toLowerCase();
  const isKhmerCurated = normId === "khmer" || normId === "tiktok-khmer" || normId === "boost-tiktok-khmer";
  const imgSrc = PLATFORM_IMAGES[normId] || platform.image || "/images/logo.png";
  const href = isKhmerCurated ? "/services/tiktok-khmer" : `/services/${normId}`;
  const sticker = getHalloweenSticker(platform.id || platform.name);

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={isKhmerCurated ? "Browse Boost TikTok Khmer packages" : `View ${platform.name} services`}
      title={platform.name}
      className="game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:-translate-y-[2px] motion-reduce:transition-none sm:rounded-[16px]"
    >
      {isKhmerCurated ? (
        <div className="relative flex aspect-square w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#250c27] via-[#6b174f] to-[#201344] p-4 text-white">
          {/* Halloween corner spiderweb */}
          <SpiderWebSvg className="pointer-events-none absolute -top-0.5 -left-0.5 size-7 sm:size-9 text-white/50 z-20 drop-shadow-sm transition-opacity duration-300 group-hover:text-amber-200/80" />

          {/* Halloween festive badge sticker */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 border border-orange-500/40 shadow-md shadow-orange-950/30 backdrop-blur-md transition-all duration-200 group-hover:scale-105 group-hover:border-orange-400 group-hover:bg-black/80"
          >
            <span className="text-[11px] sm:text-xs leading-none select-none">{sticker.icon}</span>
            <span className="hidden min-[420px]:inline text-[9px] font-extrabold uppercase tracking-wider text-orange-200">
              {sticker.label}
            </span>
          </span>

          <div aria-hidden="true" className="absolute -left-8 -top-10 size-36 rounded-full bg-pink-400/25 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-12 -right-8 size-40 rounded-full bg-violet-400/25 blur-3xl" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-pink-100/25 bg-black/20 px-2.5 py-1 text-[9px] font-extrabold tracking-[0.16em] text-pink-50 sm:left-4 sm:top-4 sm:text-[10px]">
            <Sparkles aria-hidden="true" className="size-3 text-pink-200" />
            BOOST TIKTOK KHMER
          </span>
          <div className="relative flex items-center gap-2.5 sm:gap-3" aria-hidden="true">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 sm:size-14">
              <Heart className="size-5 text-pink-100 sm:size-6" fill="currentColor" />
            </span>
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 sm:size-14">
              <Eye className="size-5 text-violet-100 sm:size-6" />
            </span>
            <span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/10 sm:size-14">
              <Users className="size-5 text-fuchsia-100 sm:size-6" />
            </span>
          </div>
          <p className="relative mt-4 text-center text-[10px] font-bold tracking-[0.18em] text-pink-100/90 sm:text-xs">
            LIKES · VIEWS · FOLLOWS
          </p>
          <span className="absolute bottom-3 right-3 rounded-full bg-[#F9A8D4] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#35102C] sm:bottom-4 sm:right-4 sm:text-[10px]">
            Fixed packages
          </span>
        </div>
      ) : (
        <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#0D0916]">
          {/* Halloween corner spiderweb */}
          <SpiderWebSvg className="pointer-events-none absolute -top-0.5 -left-0.5 size-7 sm:size-9 text-white/50 z-20 drop-shadow-sm transition-opacity duration-300 group-hover:text-amber-200/80" />

          {/* Halloween festive badge sticker */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 border border-orange-500/40 shadow-md shadow-orange-950/30 backdrop-blur-md transition-all duration-200 group-hover:scale-105 group-hover:border-orange-400 group-hover:bg-black/80"
          >
            <span className="text-[11px] sm:text-xs leading-none select-none">{sticker.icon}</span>
            <span className="hidden min-[420px]:inline text-[9px] font-extrabold uppercase tracking-wider text-orange-200">
              {sticker.label}
            </span>
          </span>

          <Image
            src={imgSrc}
            alt={platform.name}
            fill
            sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 20vw, 280px"
            loading="lazy"
            className="game-card-image relative z-10 object-cover object-center transition-[scale,opacity] duration-300 ease-out motion-safe:pointer-fine:group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        </div>
      )}

      {isKhmerCurated ? (
        <div className="flex min-h-[82px] min-w-0 shrink-0 flex-col items-center justify-center gap-1 bg-white px-2 py-2 text-center sm:min-h-[92px] sm:px-3">
          <h3 className="line-clamp-1 w-full min-w-0 text-[13px] leading-4 font-extrabold text-[#35102C] sm:text-[15px] sm:leading-5">
            Boost TikTok Khmer
          </h3>
          <span className="text-[10px] font-medium text-[#72566B] sm:text-xs">Khmer likes, views &amp; followers</span>
          <span className="mt-0.5 text-[10px] font-bold text-[#C02670] sm:text-[11px]">
            Browse packages <span aria-hidden="true">→</span>
          </span>
        </div>
      ) : (
        <div className="game-card-title flex min-h-14 min-w-0 shrink-0 flex-col items-center justify-center gap-1 bg-white px-2 py-1.5 sm:min-h-[68px] sm:px-3">
          <h3 className="line-clamp-1 w-full min-w-0 text-center text-[12px] leading-4 font-semibold wrap-anywhere text-[#172033] sm:text-[14px] sm:leading-5">
            {platform.name}
          </h3>
          <span className="game-card-cta">
            {typeof platform.count === "number" && platform.count > 0
              ? `${platform.count.toLocaleString()} services`
              : "Browse services"}{" "}
            <span aria-hidden="true">→</span>
          </span>
        </div>
      )}
    </Link>
  );
});
