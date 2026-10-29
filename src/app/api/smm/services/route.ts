import { NextRequest, NextResponse } from "next/server";
import { getPublicSmmCatalog, type PublicSmmCatalogQuery } from "@/lib/services/smmCatalogService";

export const dynamic = "force-dynamic";

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const platform = (params.get("platform") || "all").trim().toLowerCase();
  const type = (params.get("type") || "all").trim().toLowerCase();
  if (!platform || !/^[a-z0-9_-]+$/.test(platform)) {
    return NextResponse.json(
      { success: false, error: "Unsupported platform filter", services: [], total: 0 },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!["all", "followers", "likes", "views", "comments", "shares", "other"].includes(type)) {
    return NextResponse.json(
      { success: false, error: "Unsupported service type filter", services: [], total: 0 },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const sortValue = params.get("sort");
  const query: PublicSmmCatalogQuery = {
    page: positiveInteger(params.get("page"), 1, 100000),
    limit: positiveInteger(params.get("limit"), 24, 100),
    platform,
    type,
    category: (params.get("category") || "All").trim().slice(0, 100),
    search: (params.get("search") || "").trim().slice(0, 100),
    sort: sortValue === "price-low" || sortValue === "price-high" || sortValue === "name" ? sortValue : "recommended",
  };

  try {
    const result = await getPublicSmmCatalog(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[SMM Services API Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load the service catalogue", services: [], total: 0 },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
