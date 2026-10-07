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
      className={`game-card group relative flex h-full min-w-0 flex-col rounded-xl sm:rounded-2xl overflow-hidden bg-card focus-visible:outline-2 focus-visible:outline-ring ${
        isPopular
          ? "border border-pink-300/60 shadow-[0_4px_24px_rgba(255,46,147,0.12)] hover:shadow-[0_12px_40px_rgba(255,46,147,0.2)]"
          : "border border-card-border shadow-soft hover:shadow-[0_12px_32px_rgba(126,34,206,0.12)]"
      } hover:border-pink-300/70`}
    >
      {/* 1. Game Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
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

        {/* POPULAR badge only if marked popular — no other clutter */}
        {isPopular && (
          <div className="absolute left-1 top-1 z-10 sm:left-2.5 sm:top-2.5">
            <span className="public-button inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-primary-foreground shadow-md sm:gap-1 sm:rounded-md sm:px-2 sm:text-[9px] sm:tracking-wider">
              <Flame aria-hidden="true" className="h-2 w-2 fill-white sm:h-2.5 sm:w-2.5" />
              <span>POPULAR</span>
            </span>
          </div>
        )}
      </div>

      {/* 2. Simplified Card Content: ONLY Game Name and Top Up Button */}
      <div className="flex flex-1 flex-col justify-between p-2 sm:p-4">
        {/* Game Name (consistent 2-line height for uniform alignment across all cards) */}
        <div>
          <h3 className="text-[11px] sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug h-8 sm:h-auto sm:min-h-[2.5rem] break-words">
            {game.name}
          </h3>
        </div>

        {/* 3. Top Up Button */}
        <div className="mt-2 sm:mt-3 sm:pt-2">
          <div className="game-action-button flex h-7 sm:h-10 w-full items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-bold text-white">
            <span>Top Up</span>
            <span aria-hidden="true">&rarr;</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
