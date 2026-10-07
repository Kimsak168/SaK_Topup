"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Flame } from "lucide-react";
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
      className={`game-card group relative flex h-full min-w-0 flex-col justify-between rounded-xl sm:rounded-2xl overflow-hidden bg-white border ${
        isPopular
          ? "border-pink-300/80 shadow-xs hover:shadow-sm"
          : "border-pink-100/90 shadow-xs hover:shadow-sm"
      } hover:border-pink-300 transition-all focus-visible:outline-2 focus-visible:outline-primary`}
    >
      {/* 1. Game Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-pink-50/40">
        <Image
          src={imgSrc}
          alt={game.name}
          fill
          sizes="(max-width: 359px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, 20vw"
          className="game-card-image object-cover object-center"
          onError={() => setImgSrc("/images/freefire.jpg")}
        />

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

        {/* POPULAR badge only if marked popular */}
        {isPopular && (
          <div className="absolute left-1 top-1 z-10 sm:left-2 sm:top-2">
            <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-black uppercase tracking-wide bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs sm:rounded-md sm:px-1.5 sm:text-[8px]">
              <Flame aria-hidden="true" className="h-2 w-2 fill-white sm:h-2.5 sm:w-2.5" />
              <span>POPULAR</span>
            </span>
          </div>
        )}
      </div>

      {/* 2. Simplified Card Content: ONLY Game Name and Top Up Button */}
      <div className="flex flex-1 flex-col justify-between p-1.5 min-[360px]:p-2 sm:p-4">
        {/* Game Name (consistent 2-line height for uniform alignment across all cards) */}
        <div>
          <h3 className="text-[10px] min-[360px]:text-[11px] sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug h-8 sm:h-auto sm:min-h-[2.5rem] break-words text-center sm:text-left">
            {game.name}
          </h3>
        </div>

        {/* 3. Top Up Button */}
        <div className="mt-1.5 sm:mt-3 sm:pt-2">
          <div className="game-action-button flex h-7 sm:h-10 w-full items-center justify-center gap-1 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-bold text-white shadow-xs active:scale-95 transition-all">
            <span>Top Up</span>
            <span aria-hidden="true">&rarr;</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
