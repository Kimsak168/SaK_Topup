import { NextRequest, NextResponse } from "next/server";
import { getClientGames } from "@/lib/services/gameService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;

    const games = await getClientGames(category, search, {
      timeoutMs: 5000,
      throwOnError: true,
    });

    return NextResponse.json(
      {
        success: true,
        count: games.length,
        games,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("API /api/games error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch games from database",
        games: [],
      },
      { status: 503 }
    );
  }
}
