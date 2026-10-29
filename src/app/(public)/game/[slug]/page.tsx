import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";

export const dynamic = "force-dynamic";

interface LegacyGamePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Backward compatibility redirector from /game/[slug] to /games/webbuilder/[code]
 * Prevents broken bookmarks and avoids redirect loops.
 */
export default async function LegacyGameRedirectPage({ params }: LegacyGamePageProps) {
  const { slug } = await params;
  const normalized = (slug || "").trim().toLowerCase();

  // 1. Direct Free Fire alias handling -> WebBuilder
  if (
    !normalized.startsWith("vngzz2-") && (
      normalized.includes("freefire") ||
      normalized.startsWith("free-fire") ||
      normalized === "ff" ||
      normalized.includes("khsgmy") ||
      normalized.includes("sgmy")
    )
  ) {
    redirect("/games/webbuilder/freefire_khsgmy");
  }

  // 2. Direct PUBG Mobile alias handling -> WebBuilder pubgm
  if (normalized === "pubg-mobile" || normalized === "pubgm" || normalized === "pubg") {
    redirect("/games/webbuilder/pubgm");
  }

  // 3. Direct MLBB alias handling -> WebBuilder mlbb
  if (normalized === "mobile-legends" || normalized === "mlbb" || normalized === "mlbb_global") {
    redirect("/games/webbuilder/mlbb");
  }

  // 4. Direct Honor of Kings alias handling -> WebBuilder hok
  if (normalized === "honor-of-kings" || normalized === "hok" || normalized === "honor_of_kings") {
    redirect("/games/webbuilder/hok");
  }

  // 5. Direct Blood Strike alias handling -> WebBuilder bloodstrike
  if (normalized === "bloodstrike" || normalized === "blood-strike") {
    redirect("/games/webbuilder/bloodstrike");
  }

  // 6. Direct Magic Chess alias handling
  if (normalized === "magic-chess" || normalized === "magic-chess-gogo" || normalized === "magic_chess") {
    redirect("/games/webbuilder/magic_chess");
  }

  // 7. Direct 8 Ball Pool alias handling
  if (normalized === "8ballpool" || normalized === "8-ball-pool" || normalized === "8ball") {
    redirect("/games/webbuilder/8ballpool");
  }

  // 8. Check DB for other games
  let targetPath = `/games/webbuilder/${encodeURIComponent(normalized)}`;
  try {
    await connectDB();
    const game = await Game.findOne({
      $or: [{ slug: normalized }, { supplierGameCode: normalized }],
      isActive: true,
    }).lean();

    if (game) {
      const code = game.supplierGameCode || game.slug;
      const supplier = game.supplier || "webbuilder";
      targetPath = `/games/${encodeURIComponent(supplier)}/${encodeURIComponent(code)}`;
    }
  } catch (err) {
    console.error("Legacy redirect error:", err);
  }

  redirect(targetPath);
}
