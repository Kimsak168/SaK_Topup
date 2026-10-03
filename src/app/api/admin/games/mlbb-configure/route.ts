import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { requireAdminAuth } from "@/lib/auth";
import { getG2BulkCatalogue } from "@/lib/suppliers/g2bulk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const { targetProductCode = "mlbb" } = body;

    const cleanCode = String(targetProductCode).trim().toLowerCase();

    if (cleanCode !== "mlbb" && cleanCode !== "mlbb_global") {
      return NextResponse.json(
        { success: false, error: "Target product code must be 'mlbb' or 'mlbb_global'" },
        { status: 400 }
      );
    }

    // 1. Locate the game record in MongoDB
    const targetGame = await Game.findOne({
      supplier: "g2bulk",
      supplierGameCode: cleanCode,
    });

    if (!targetGame) {
      return NextResponse.json(
        { success: false, error: `Game record with code '${cleanCode}' not found in database.` },
        { status: 404 }
      );
    }

    // 2. Set this product as the SINGLE active Mobile Legends game
    targetGame.isActive = true;
    targetGame.isPopular = true;
    targetGame.isTrending = true;
    targetGame.requiresServer = true;
    targetGame.serverLabel = "Zone ID (4-5 digits)";
    targetGame.userIdLabel = "User ID";
    await targetGame.save();

    // 3. Deactivate all OTHER Mobile Legends variants to prevent duplicate listings on homepage
    await Game.updateMany(
      {
        supplier: "g2bulk",
        $or: [
          { supplierGameCode: { $regex: /^mlbb/i } },
          { slug: { $regex: /^mlbb/i } },
          { name: { $regex: /mobile legends/i } },
        ],
        _id: { $ne: targetGame._id },
      },
      {
        $set: { isActive: false },
      }
    );

    // 4. Synchronize real catalogue from G2Bulk while PRESERVING existing admin pricing & settings
    const catalogue = await getG2BulkCatalogue(cleanCode);
    let packagesCreated = 0;
    let packagesPreserved = 0;

    for (const item of catalogue) {
      const codeId = String(item.id);
      const existingPkg = await GamePackage.findOne({
        supplier: "g2bulk",
        supplierProductCode: codeId,
      });

      if (existingPkg) {
        // PRESERVE existing administrator configured prices and custom settings
        existingPkg.buyingPrice = item.amount;
        existingPkg.name = item.name;
        existingPkg.gameSlug = targetGame.slug;
        existingPkg.gameCode = cleanCode;
        await existingPkg.save();
        packagesPreserved++;
      } else {
        // Create new package record with default active state
        await GamePackage.create({
          gameSlug: targetGame.slug,
          gameCode: cleanCode,
          supplier: "g2bulk",
          supplierProductCode: codeId,
          name: item.name,
          diamondsOrPoints: item.name,
          buyingPrice: item.amount,
          sellingPrice: null, // Left for admin pricing or automatic default margin
          isActive: true,
          isFeatured: false,
          adminConfigured: false,
          sortOrder: 0,
        });
        packagesCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully configured '${targetGame.name}' (${cleanCode}) as the active Mobile Legends game. Other variations deactivated.`,
      activeGame: {
        id: String(targetGame._id),
        name: targetGame.name,
        slug: targetGame.slug,
        supplierGameCode: targetGame.supplierGameCode,
        isActive: targetGame.isActive,
      },
      packageStats: {
        totalFromG2Bulk: catalogue.length,
        packagesPreserved,
        packagesCreated,
      },
    });
  } catch (error: unknown) {
    console.error("MLBB configure error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to configure MLBB",
      },
      { status: 500 }
    );
  }
}
