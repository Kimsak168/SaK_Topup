import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { getGameBySupplierAndCode, getNormalizedPackages } from "@/lib/services/gameService";
import { GameTopUpClient } from "@/components/public/GameTopUpClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GamePageProps {
  params: Promise<{ supplier: string; code: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  try {
    const { supplier, code } = await params;
    const result = await getGameBySupplierAndCode(supplier, code);

    if (result?.shouldRedirect || !result || !result.game) {
      return {
        title: "Game Top-Up — Asura Store",
      };
    }

    const { game } = result;

    return {
      title: `Top Up ${game.name} — Asura Store`,
      description: `Recharge ${game.name} ${game.currencyName} instantly. Official direct API delivery with 24/7 automation.`,
    };
  } catch {
    return {
      title: "Game Top-Up — Asura Store",
    };
  }
}

export default async function GameDetailPage({ params, searchParams }: GamePageProps) {
  const queryParams: Promise<{ [key: string]: string | string[] | undefined }> =
    searchParams ?? Promise.resolve({});
  const [{ supplier, code }, query] = await Promise.all([
    params,
    queryParams,
  ]);
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
        <GameTopUpClient
          key={game.id}
          game={game}
          initialPackages={initialPackages}
          initialSelectedPackageId={typeof query.package === "string" ? query.package : undefined}
        />
      </div>
    </div>
  );
}
