"use client";

import { memo } from "react";
import { StorefrontLink } from "./StorefrontLink";
import Image from "next/image";
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
  other: "/images/asura-store-logo.webp",
};

export const PlatformCard = memo(function PlatformCard({
  platform,
}: {
  platform: PlatformItem;
}) {
  const normId = platform.id.toLowerCase();
  const imgSrc = PLATFORM_IMAGES[normId] || platform.image || "/images/logo.webp";
  const href = `/services/${normId}`;
  const sticker = getHalloweenSticker(platform.id || platform.name);

  return (
    <StorefrontLink
      href={href}
      aria-label={`View ${platform.name} services`}
      title={platform.name}
      className="game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:-translate-y-[2px] motion-reduce:transition-none sm:rounded-[16px]"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#0D0916]">
        {/* Water Festival corner ripple */}
        <SpiderWebSvg className="pointer-events-none absolute -top-0.5 -left-0.5 size-7 sm:size-9 text-white/60 z-20 drop-shadow-sm transition-opacity duration-300 group-hover:text-sky-200/90" />

        {/* Water Festival festive badge sticker */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 border border-sky-400/40 shadow-md shadow-sky-950/30 backdrop-blur-md transition-all duration-200 group-hover:scale-105 group-hover:border-sky-300 group-hover:bg-black/85"
        >
          <span className="text-[11px] sm:text-xs leading-none select-none">{sticker.icon}</span>
          <span className="hidden min-[420px]:inline text-[9px] font-extrabold uppercase tracking-wider text-sky-200">
            {sticker.label}
          </span>
        </span>

        <Image
          src={imgSrc}
          alt={platform.name}
          fill
          sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 20vw, 280px"
          quality={100}
          loading="lazy"
          className="game-card-image relative z-10 object-cover object-center transition-[scale,opacity] duration-300 ease-out motion-safe:pointer-fine:group-hover:scale-[1.03] motion-reduce:transition-none"
        />
      </div>

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
    </StorefrontLink>
  );
});
