import { getClientGames } from "@/lib/services/gameService";
import { GameSearch } from "@/components/public/GameSearch";
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
    <div className="storefront-container storefront-catalogue-page">
      <div className="storefront-page-heading">
        <p className="storefront-eyebrow">The game top-up catalogue</p>
        <h1>Find your next top-up.</h1>
        <p>Diamonds, UC, passes and more. Choose a game to get started.</p>
      </div>
      <GameSearch initialGames={games} heading="All Games" />
    </div>
  );
}
