"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ClientGame } from "@/types/game";

interface GameCardProps {
  game: ClientGame;
}

export const GameCard = memo(function GameCard({ game }: GameCardProps) {
  const router = useRouter();
  const href = game.path || `/games/${game.supplier}/${game.code || game.slug}`;
  const [imgSrc, setImgSrc] = useState<string>(() => game.image || "/images/freefire.jpg");

  // Keep POPULAR only if explicitly marked popular by administrator
  const isPopular = Boolean(game.isPopular);

  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      className="game-card group relative flex min-w-0 flex-col rounded-[12px] sm:rounded-[14px] p-[1.5px] overflow-hidden bg-white shadow-[0_4px_14px_rgba(22,163,74,0.06)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.12)] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-[#16A34A]"
    >
      {/* Animated subtle running gradient border (1.5px thickness, soft green colors, no heavy glow) */}
      <span
        aria-hidden="true"
        className="game-card-border pointer-events-none absolute -inset-[150%] rounded-full bg-[conic-gradient(from_0deg_at_50%_50%,#16A34A_0deg,#22C55E_90deg,#34D399_180deg,#86EFAC_270deg,#16A34A_360deg)] opacity-40 group-hover:opacity-85 transition-opacity duration-300"
      />

      {/* Inner card container covering the center with solid white */}
      <div className="relative z-10 flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[10.5px] sm:rounded-[12.5px] bg-white">
        {/* 1. Game Image (4:3 aspect ratio, main focus) */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F0FDF4]">
          <Image
            src={imgSrc}
            alt={game.name}
            fill
            sizes="(max-width: 359px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, 20vw"
            className="game-card-image object-cover object-center group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgSrc("/images/freefire.jpg")}
          />

          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />

          {/* 2. POPULAR badge: small, compact, green background, white text */}
          {isPopular && (
            <div className="absolute left-1.5 top-1.5 sm:left-2 sm:top-2 z-10">
              <span className="inline-flex items-center rounded-[5px] sm:rounded-md px-1.5 py-0.5 sm:px-2 text-[8.5px] min-[360px]:text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#16A34A] text-white shadow-xs">
                POPULAR
              </span>
            </div>
          )}
        </div>

        {/* 3. Compact Card Body with strictly balanced spacing */}
        <div className="flex flex-col px-2 min-[360px]:px-2.5 pt-2 pb-2.5">
          {/* Game Name: exactly 8px below image, centered, max 2 lines, fixed height for perfect row alignment */}
          <div className="flex h-[28px] min-[360px]:h-[30px] sm:h-[34px] items-center justify-center">
            <h3 className="line-clamp-2 text-center text-[11px] min-[360px]:text-[11.5px] sm:text-[13.5px] font-semibold leading-tight text-[#172033] group-hover:text-[#16A34A] transition-colors break-words">
              {game.name}
            </h3>
          </div>

          {/* Top Up Button: exactly 8px below title, 10px to bottom, height 36px desktop */}
          <div className="mt-2">
            <div className="flex h-[28px] min-[360px]:h-[30px] sm:h-[36px] w-full items-center justify-center rounded-[9px] sm:rounded-[11px] bg-[#16A34A] text-[10.5px] min-[360px]:text-[11.5px] sm:text-[13px] font-bold text-white shadow-xs group-hover:bg-[#22C55E] group-active:scale-[0.98] transition-all duration-150">
              Top Up
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});
