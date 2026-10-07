import { getClientGames } from "@/lib/services/gameService";
import { GameSearch } from "@/components/public/GameSearch";
import { Gamepad2 } from "lucide-react";
import { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Games Catalogue — SakSuuu Game Top-Up",
  description:
    "Browse official game top-up catalogue. Recharge diamonds, UC, and in-game passes for Free Fire, PUBG Mobile, Mobile Legends, and more.",
};

export default async function GamesCataloguePage() {
  const games = await getClientGames(undefined, undefined, { throwOnError: true });

  return (
    <div className="min-h-screen py-3 sm:py-10 px-2.5 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-5 sm:space-y-10">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-2 sm:space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#F4C7DD] bg-[#FFF1F7] px-3 sm:px-3.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#EC168C] shadow-xs">
          <Gamepad2 className="h-3.5 w-3.5 text-[#EC168C]" />
          <span>Full Catalogue</span>
        </div>
        <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-[#1E293B] tracking-tight">
          Browse All Games & Top-Up Options
        </h1>
        <p className="text-xs sm:text-sm text-[#64748B]">
          Instant automated fulfillment direct to your Player ID. Select your game below to begin.
        </p>
      </div>

      {/* Game Search & Filter Grid */}
      <GameSearch initialGames={games} />
    </div>
  );
}
