"use client";

import { useState, useMemo } from "react";
import { Search, X, RotateCcw } from "lucide-react";
import { ClientGame } from "@/types/game";
import { GameCard } from "./GameCard";

interface GameSearchProps {
  initialGames: ClientGame[];
}

// Strictly check if game is marked popular by administrator
function isGamePopular(game: ClientGame): boolean {
  return Boolean(game.isPopular);
}

// Aliases mapping for common gaming search shortcuts
const SEARCH_ALIASES: Record<string, string[]> = {
  ff: ["free fire", "freefire"],
  sgmy: ["free fire (sgmy)", "sgmy"],
  ffsgmy: ["free fire (sgmy)", "freefire_sgmy"],
  pubg: ["pubg mobile", "pubgm"],
  pubgm: ["pubg mobile", "pubgm"],
  ml: ["mobile legends", "mlbb"],
  mlbb: ["mobile legends", "mlbb"],
  val: ["valorant", "vp"],
  cod: ["call of duty", "codm"],
  codm: ["call of duty", "codm"],
  hsr: ["honkai", "star rail"],
  gi: ["genshin", "genshin impact"],
  wr: ["wild rift", "league of legends"],
};

export function GameSearch({ initialGames }: GameSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveQuery(searchTerm.trim());
  };

  const handleClear = () => {
    setSearchTerm("");
    setActiveQuery("");
  };

  // Sort games: Popular games first, then alphabetically
  const sortedInitialGames = useMemo(() => {
    return [...initialGames].sort((a, b) => {
      const popA = isGamePopular(a) ? 1 : 0;
      const popB = isGamePopular(b) ? 1 : 0;
      if (popA !== popB) return popB - popA; // Popular games first
      return a.name.localeCompare(b.name);
    });
  }, [initialGames]);

  // Filter games based on search query (real-time filtering by name)
  const filteredGames = useMemo(() => {
    const rawQuery = activeQuery.trim().toLowerCase();
    if (!rawQuery) return sortedInitialGames;

    // Expand search terms with aliases if any
    const aliasTerms = SEARCH_ALIASES[rawQuery] || [];
    const searchTerms = [rawQuery, ...aliasTerms];

    return sortedInitialGames.filter((game) => {
      const name = game.name.toLowerCase();
      const slug = (game.slug || "").toLowerCase();
      const publisher = (game.publisher || "").toLowerCase();

      return searchTerms.some(
        (term) =>
          name.includes(term) ||
          slug.includes(term) ||
          publisher.includes(term)
      );
    });
  }, [activeQuery, sortedInitialGames]);

  return (
    <section id="games" className="w-full min-w-0 space-y-6 scroll-mt-28">
      {/* 1. Heading: Exact Khmer heading "ហ្គេមទាំងអស់" without decorative icons or English headings */}
      <div className="space-y-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
          ហ្គេមទាំងអស់
        </h2>

        {/* 2. Prominent Game Search directly below heading */}
        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="ស្វែងរកហ្គេម"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-2xl w-full"
        >
          {/* Search Input Container */}
          <div className="relative min-w-0 flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-primary pointer-events-none transition-colors group-focus-within:text-primary" />
            <input
              type="text"
              name="gameQuery"
              aria-label="ស្វែងរកហ្គេម"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveQuery(e.target.value); // Real-time searching while typing
              }}
              placeholder="ស្វែងរកហ្គេម"
              className="h-12 w-full rounded-xl sm:rounded-2xl border border-input bg-card pl-11 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus-visible:outline-2 focus-visible:outline-ring focus:ring-4 focus:ring-ring/20 transition-all shadow-sm"
            />
            {/* Quick in-input clear button */}
            {searchTerm && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="Clear search input"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action Buttons: Search button and Clear button */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="public-button flex-1 sm:flex-initial flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl sm:rounded-2xl px-5 sm:px-6 text-xs sm:text-sm font-bold text-primary-foreground shadow-md shadow-pink-200/40 hover:shadow-soft hover:shadow-pink-300/40 transition-all cursor-pointer active:scale-95"
            >
              <Search className="h-4 w-4" />
              <span>ស្វែងរក</span>
            </button>

            {searchTerm && (
              <button
                type="button"
                onClick={handleClear}
                className="flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl border border-border bg-card hover:bg-muted px-4 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
                <span>សម្អាត</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 3. Games Grid: Exactly 5 cards/row on desktop, 3-4 on tablets, 2 on mobile */}
      {filteredGames.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
          {filteredGames.map((game) => (
            <GameCard key={game.id || game.slug} game={game} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center sm:py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent border border-pink-200 text-primary mb-3">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-foreground">រកមិនឃើញហ្គេមទេ</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-sm break-words">
            មិនមានលទ្ធផលសម្រាប់ &quot;{activeQuery}&quot;។ សូមព្យាយាមស្វែងរក Free Fire, PUBG Mobile ឬ Mobile Legends។
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent border border-pink-200 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground hover:border-pink-500 transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>សម្អាតការស្វែងរក (Clear)</span>
          </button>
        </div>
      )}
    </section>
  );
}
