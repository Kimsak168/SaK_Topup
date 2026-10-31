import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramOutboxService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ success: false }, { status: 401 });
  try {
    await connectDB();
    return NextResponse.json({ success: true, ...await dispatchPendingTelegramNotifications() });
  } catch {
    return NextResponse.json({ success: false, error: "Notification worker unavailable" }, { status: 503 });
  }
}
