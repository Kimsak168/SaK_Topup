"use client";

import { useState, useMemo, useEffect, useCallback, useDeferredValue } from "react";
import { Search, X, RotateCcw, AlertCircle } from "lucide-react";
import { ClientGame } from "@/types/game";
import { GameCard } from "./GameCard";
import { GameGridSkeleton } from "./HomeSkeletons";
import { ActiveGamesTicker } from "./ActiveGamesTicker";

interface GameSearchProps {
  initialGames: ClientGame[];
  initialError?: string | null;
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

export function GameSearch({ initialGames, initialError }: GameSearchProps) {
  const [games, setGames] = useState<ClientGame[]>(() => initialGames || []);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(initialError || null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const deferredQuery = useDeferredValue(activeQuery);

  // Sync when initialGames changes
  useEffect(() => {
    setGames(initialGames || []);
    setFetchError(initialError || null);
  }, [initialGames, initialError]);

  // Client-side fallback retry mechanism
  const fetchClientGames = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/games", {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load games");
      }
      setGames(data.games || []);
      if (!data.games || data.games.length === 0) {
        setFetchError("មិនទាន់មានហ្គេមសកម្មក្នុងប្រព័ន្ធនៅឡើយទេ។");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "មានបញ្ហាតភ្ជាប់បណ្តាញ";
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveQuery(searchTerm.trim());
  };

  const handleClear = () => {
    setSearchTerm("");
    setActiveQuery("");
  };

  // Sort games: Popular games first, then alphabetically
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const popA = isGamePopular(a) ? 1 : 0;
      const popB = isGamePopular(b) ? 1 : 0;
      if (popA !== popB) return popB - popA; // Popular games first
      return a.name.localeCompare(b.name);
    });
  }, [games]);

  // Filter games based on search query (real-time filtering by name)
  const filteredGames = useMemo(() => {
    const rawQuery = deferredQuery.trim().toLowerCase();
    if (!rawQuery) return sortedGames;

    // Expand search terms with aliases if any
    const aliasTerms = SEARCH_ALIASES[rawQuery] || [];
    const searchTerms = [rawQuery, ...aliasTerms];

    return sortedGames.filter((game) => {
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
  }, [deferredQuery, sortedGames]);

  return (
    <section id="games" className="w-full min-w-0 space-y-4 sm:space-y-6 scroll-mt-28">
      {/* 1. Heading: Exact Khmer heading "ហ្គេមទាំងអស់" */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-xl sm:text-3xl font-extrabold text-[#172033] tracking-tight">
          ហ្គេមទាំងអស់
        </h2>

        {/* 2. Prominent Game Search directly below heading */}
        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="ស្វែងរកហ្គេម"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 max-w-2xl w-full"
        >
          {/* Search Input Container */}
          <div className="relative min-w-0 flex-1 group">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-4.5 sm:w-4.5 text-[#16A34A] pointer-events-none transition-colors group-focus-within:text-[#16A34A]" />
            <input
              type="text"
              name="gameQuery"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-controls="game-results"
              aria-label="ស្វែងរកហ្គេម"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveQuery(e.target.value); // Real-time searching while typing
              }}
              placeholder="ស្វែងរកហ្គេម"
              className="h-10 sm:h-12 w-full rounded-xl sm:rounded-2xl border border-[#BBF7D0] bg-white pl-9 sm:pl-11 pr-11 text-xs sm:text-sm text-[#172033] placeholder:text-xs sm:placeholder:text-sm placeholder:text-[#64748B] focus:border-[#22C55E] focus-visible:outline-none focus:ring-2 focus:ring-[#16A34A]/20 transition-all shadow-xs"
            />
            {/* Quick in-input clear button */}
            {searchTerm && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 flex h-7.5 w-7.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-[#64748B] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:text-[#22C55E] transition-colors cursor-pointer"
                aria-label="Clear search input"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>

          {/* Action Buttons: Search button and Clear button */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex h-10 sm:h-12 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold whitespace-nowrap text-white bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] transition-colors sm:h-12 sm:flex-initial sm:gap-2 sm:rounded-2xl sm:px-6 sm:text-sm shadow-xs cursor-pointer"
            >
              <Search className="h-4 w-4 sm:h-4 sm:w-4 text-white" />
              <span>ស្វែងរក</span>
            </button>

            {searchTerm && (
              <button
                type="button"
                onClick={handleClear}
                className="flex h-10 sm:h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] px-3.5 sm:px-4 text-xs sm:text-sm font-semibold text-[#64748B] hover:text-[#16A34A] active:text-[#22C55E] transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>សម្អាត</span>
              </button>
            )}
          </div>
        </form>

        {/* Active Games Ticker */}
        <div className="pt-2 sm:pt-3">
          <ActiveGamesTicker games={games} />
        </div>
      </div>

      {/* 3. Games Grid or Skeleton / Error / Empty States */}
      <div id="game-results" className="min-h-64" aria-busy={isLoading || activeQuery !== deferredQuery}>
      <p className="sr-only" role="status">{isLoading ? "Loading games" : `${filteredGames.length} games found`}</p>
      {isLoading ? (
        <GameGridSkeleton count={10} />
      ) : fetchError && games.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#BBF7D0] bg-white px-5 py-10 text-center sm:py-16 shadow-xs">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#16A34A] mb-3">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-[#172033]">មិនអាចផ្ទុកទិន្នន័យហ្គេមបានទេ</h3>
          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#64748B] max-w-md break-words">
            {fetchError}. សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត ឬចុចប៊ូតុងខាងក្រោមដើម្បីព្យាយាមម្តងទៀត។
          </p>
          <button
            type="button"
            onClick={fetchClientGames}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>ព្យាយាមម្តងទៀត (Retry)</span>
          </button>
        </div>
      ) : filteredGames.length > 0 ? (
        <div className="grid grid-cols-2 min-[340px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 lg:gap-5">
          {filteredGames.map((game) => (
            <GameCard key={game.id || game.slug} game={game} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#BBF7D0] bg-white px-5 py-12 text-center sm:py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] mb-3">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-[#172033]">រកមិនឃើញហ្គេមទេ</h3>
          <p className="mt-2 text-sm leading-relaxed text-[#64748B] max-w-sm break-words">
            {activeQuery
              ? `មិនមានលទ្ធផលសម្រាប់ "${activeQuery}"។ សូមព្យាយាមស្វែងរក Free Fire, PUBG Mobile ឬ Mobile Legends។`
              : "មិនទាន់មានហ្គេមត្រូវបានបើកដំណើរការនៅឡើយទេ។"}
          </p>
          {activeQuery ? (
            <button
              type="button"
              onClick={handleClear}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-2.5 text-xs font-bold text-[#16A34A] hover:bg-[#16A34A] hover:text-white active:bg-[#22C55E] transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>សម្អាតការស្វែងរក (Clear)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={fetchClientGames}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>ផ្ទុកឡើងវិញ (Reload)</span>
            </button>
          )}
        </div>
      )}
      </div>
    </section>
  );
}
