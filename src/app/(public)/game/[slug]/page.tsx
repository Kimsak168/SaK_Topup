import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";

export const dynamic = "force-dynamic";

interface LegacyGamePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Backward compatibility redirector from /game/[slug] to /games/[supplier]/[code]
 * Prevents broken bookmarks and avoids redirect loops.
 */
export default async function LegacyGameRedirectPage({ params }: LegacyGamePageProps) {
  const { slug } = await params;
  const normalized = (slug || "").trim().toLowerCase();

  // 1. Direct Free Fire alias handling -> always Vizo
  if (normalized.includes("freefire") || normalized === "free-fire" || normalized === "ff") {
    redirect("/games/vizo/freefire_global");
  }

  // 2. Direct PUBG Mobile alias handling -> always G2Bulk
  if (normalized === "pubg-mobile" || normalized === "pubgm") {
    redirect("/games/g2bulk/pubgm");
  }

  // 3. Direct MLBB alias handling -> G2Bulk mlbb
  if (normalized === "mobile-legends" || normalized === "mlbb") {
    redirect("/games/g2bulk/mlbb");
  }
  if (normalized === "mlbb_global") {
    redirect("/games/g2bulk/mlbb_global");
  }

  // 4. Check DB for other games
  try {
    await connectDB();
    const game = await Game.findOne({
      $or: [{ slug: normalized }, { supplierGameCode: normalized }],
      isActive: true,
    }).lean();

    if (game) {
      const supplier = game.supplier;
      const code = game.supplierGameCode || game.slug;
      redirect(`/games/${supplier}/${code}`);
    }
  } catch (err) {
    console.error("Legacy redirect error:", err);
  }

  // Default fallback to G2Bulk
  redirect(`/games/g2bulk/${normalized}`);
}
