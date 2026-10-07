import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { getGameBySupplierAndCode, getNormalizedPackages } from "@/lib/services/gameService";
import { GameTopUpClient } from "@/components/public/GameTopUpClient";

// Public HTML and RSC can be reused as well as the underlying catalogue data.
// Admin catalogue writes invalidate this route through invalidateCatalogueCache.
export const revalidate = 300;

// Generate each game on its first visit, without contacting Atlas during build.
export function generateStaticParams() {
  return [];
}

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
    <div className="relative min-h-screen w-full overflow-x-clip py-2 min-[360px]:py-3 sm:py-8">
      <div className="max-w-7xl mx-auto px-2 min-[360px]:px-3 sm:px-6 lg:px-8 relative z-10">
        <GameTopUpClient key={game.id} game={game} initialPackages={initialPackages} />
      </div>
    </div>
  );
}
