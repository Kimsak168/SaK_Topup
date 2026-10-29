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
            prefetch={false}
            tabIndex={ariaHidden ? -1 : 0}
            className="rounded-sm text-[11.5px] sm:text-[12px] font-medium text-[#16A34A] hover:text-[#22C55E] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#22C55E] focus-visible:outline-offset-2"
          >
            {game.name}
          </Link>
          <span
            aria-hidden="true"
            className="mx-3 size-[3px] shrink-0 rounded-full bg-[#22C55E] select-none sm:mx-4"
          />
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

  // Dynamically calculate animation duration so items scroll at a steady, comfortable reading speed
  // ~2.5 seconds per game creates a relaxed, premium glide instead of a fast blur.
  const durationSec = Math.max(50, Math.round(fullGameList.length * 2.5));

  return (
    <div
      role="region"
      aria-label="Active Games"
      className="ticker-wrapper relative isolate flex h-9 w-full min-w-0 items-center overflow-hidden rounded-[10px] px-1 select-none sm:h-10"
    >
      {/* Moving track with duplicated GameList for seamless loop */}
      <div
        className="ticker-track"
        style={{
          ["--ticker-duration" as string]: `${durationSec}s`,
          animationDuration: `${durationSec}s`,
        }}
      >
        <GameList games={fullGameList} />
        <GameList games={fullGameList} ariaHidden={true} />
      </div>
    </div>
  );
}
