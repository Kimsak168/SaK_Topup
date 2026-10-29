"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";

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
  const imgSrc = PLATFORM_IMAGES[normId] || platform.image || "/images/logo.png";
  const href = `/services/${normId}`;

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`View ${platform.name} services`}
      title={platform.name}
      className="game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:-translate-y-[2px] motion-reduce:transition-none sm:rounded-[16px]"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#0D0916]">
        <Image
          src={imgSrc}
          alt={platform.name}
          fill
          sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 20vw, 280px"
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
            ? `${platform.count.toLocaleString()} សេវាកម្ម`
            : "បញ្ជាទិញឥឡូវនេះ"}{" "}
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
});
