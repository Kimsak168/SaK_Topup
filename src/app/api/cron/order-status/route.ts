import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { reconcilePendingOrderStatuses } from "@/lib/services/orderStatusWorkerService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ success: false }, { status: 401 });
  try {
    await connectDB();
    return NextResponse.json({ success: true, ...await reconcilePendingOrderStatuses() });
  } catch {
    return NextResponse.json({ success: false, error: "Status worker unavailable" }, { status: 503 });
  }
}
