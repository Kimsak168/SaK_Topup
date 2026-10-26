import { NextResponse } from "next/server";
import { checkAnajakPayHealth } from "@/lib/services/anajakPayService";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkAnajakPayHealth();
  return NextResponse.json(health, {
    headers: {
      "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
    },
  });
}
