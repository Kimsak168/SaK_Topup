import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramOutboxService";
import { logCronEvent } from "@/lib/cronLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logCronEvent({
      tag: "CRON_AUTH",
      event: "permanent_error",
      error: "Unauthorized cron access attempt to /api/cron/telegram",
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 20;

  const started = Date.now();
  try {
    await connectDB();
    const result = await dispatchPendingTelegramNotifications(limit);
    const durationMs = Date.now() - started;

    logCronEvent({
      tag: "CRON_TELEGRAM",
      event: "summary",
      durationMs,
      stats: { ...result },
    });

    return NextResponse.json({
      success: true,
      job: "telegram",
      timestamp: new Date().toISOString(),
      durationMs,
      ...result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Notification worker unavailable";
    logCronEvent({
      tag: "CRON_TELEGRAM",
      event: "permanent_error",
      error: errorMsg,
    });
    return NextResponse.json({ success: false, error: "Notification worker unavailable" }, { status: 503 });
  }
}
