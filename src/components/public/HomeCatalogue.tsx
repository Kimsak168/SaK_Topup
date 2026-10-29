"use client";

import { GameSearch } from "@/components/public/GameSearch";
import type { ClientGame } from "@/types/game";

interface HomeCatalogueProps {
  games: ClientGame[];
  initialError?: string | null;
}

export function HomeCatalogue({ games, initialError }: HomeCatalogueProps) {
  return (
    <GameSearch
      initialGames={games}
      initialError={initialError}
      heading="ហ្គេមពេញនិយម"
    />
  );
}
