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
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-accent px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          <Gamepad2 className="h-3.5 w-3.5 text-primary" />
          <span>Full Catalogue</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
          Browse All Games & Top-Up Options
        </h1>
        <p className="text-sm text-secondary-foreground">
          Instant automated fulfillment direct to your Player ID. Select your game below to begin.
        </p>
      </div>

      {/* Game Search & Filter Grid */}
      <GameSearch initialGames={games} />
    </div>
  );
}
