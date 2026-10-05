import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { getGameBySupplierAndCode, getNormalizedPackages } from "@/lib/services/gameService";
import { GameTopUpClient } from "@/components/public/GameTopUpClient";

export const dynamic = "force-dynamic";

interface GamePageProps {
  params: Promise<{ supplier: string; code: string }>;
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { supplier, code } = await params;
  const result = await getGameBySupplierAndCode(supplier, code);

  if (result?.shouldRedirect || !result || !result.game) {
    return {
      title: "Game Top-Up — SakSuuu",
    };
  }

  const { game } = result;

  return {
    title: `Top Up ${game.name} — SakSuuu Game Top-Up`,
    description: `Recharge ${game.name} ${game.currencyName} instantly. Official direct API delivery with 24/7 automation.`,
  };
}

export default async function GameDetailPage({ params }: GamePageProps) {
  const { supplier, code } = await params;
  const [result, initialPackages] = await Promise.all([
    getGameBySupplierAndCode(supplier, code),
    getNormalizedPackages(supplier, code),
  ]);

  // Handle invalid supplier and game combinations cleanly without redirect loops
  if (result?.shouldRedirect) {
    redirect(result.shouldRedirect);
  }

  if (!result || !result.game) {
    notFound();
  }

  const { game } = result;

  return (
    <div className="relative min-h-screen w-full overflow-x-clip py-8 sm:py-12">
      {/* Background neon ambient spots */}
      <div className="absolute top-10 left-1/3 w-[600px] h-[300px] bg-pink-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <GameTopUpClient key={game.id} game={game} initialPackages={initialPackages} />
      </div>
    </div>
  );
}
