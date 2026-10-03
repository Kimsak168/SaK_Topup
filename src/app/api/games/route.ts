import { NextRequest, NextResponse } from "next/server";
import { getClientGames } from "@/lib/services/gameService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;

    const games = await getClientGames(category, search);

    return NextResponse.json({
      success: true,
      count: games.length,
      games,
    });
  } catch (error) {
    console.error("API /api/games error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch games",
      },
      { status: 500 }
    );
  }
}
