"use client";

import Link from "next/link";
import { ClientGame } from "@/types/game";

interface ActiveGamesTickerProps {
  games: ClientGame[];
}

function GameList({ games, ariaHidden }: { games: ClientGame[]; ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden}
      className="inline-flex items-center shrink-0"
    >
      {games.map((game, idx) => (
        <span
          key={`${game.id || game.slug || game.code}-${idx}`}
          className="inline-flex items-center shrink-0"
        >
          <Link
            href={game.path || `/games/${game.supplier}/${game.code || game.slug}`}
            tabIndex={ariaHidden ? -1 : 0}
            className="text-xs sm:text-[13.5px] font-semibold text-[#16A34A] hover:text-[#22C55E] active:text-[#22C55E] transition-colors whitespace-nowrap outline-none focus:outline-none focus-visible:outline-none"
          >
            {game.name}
          </Link>
          <span
            aria-hidden="true"
            className="mx-3 sm:mx-3.5 text-[8px] sm:text-[9px] text-[#BBF7D0] select-none"
          >
            •
          </span>
        </span>
      ))}
    </div>
  );
}

export function ActiveGamesTicker({ games }: ActiveGamesTickerProps) {
  if (!games || games.length === 0) return null;

  // Filter only valid active games and deduplicate
  const uniqueGames = Array.from(
    new Map(
      games
        .filter((g) => Boolean(g.name && g.name.trim()))
        .map((g) => [g.name.trim().toLowerCase(), g])
    ).values()
  );

  if (uniqueGames.length === 0) return null;

  // Ensure the single list has enough items so that half the track comfortably exceeds wide screens
  const repeatMultiplier = Math.max(1, Math.ceil(8 / uniqueGames.length));
  const fullGameList = Array.from({ length: repeatMultiplier }, () => uniqueGames).flat();

  return (
    <div
      role="region"
      aria-label="Active Games"
      className="ticker-wrapper relative w-full h-[34px] sm:h-[36px] flex items-center overflow-hidden select-none"
    >
      {/* Subtle edge fade gradient masks */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-14 bg-gradient-to-r from-[#F7FFF9] to-transparent z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-14 bg-gradient-to-l from-[#F7FFF9] to-transparent z-10"
      />

      {/* Moving track with duplicated GameList for seamless loop */}
      <div className="ticker-track">
        <GameList games={fullGameList} />
        <GameList games={fullGameList} ariaHidden={true} />
      </div>
    </div>
  );
}
