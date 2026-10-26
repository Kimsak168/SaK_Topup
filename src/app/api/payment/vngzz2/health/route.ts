import { NextResponse } from "next/server";
import { checkVngZz2Health, isVngZz2Configured } from "@/lib/services/vngzzPayWayService";

export const dynamic = "force-dynamic";

export async function GET() {
  const isConfigured = isVngZz2Configured();
  if (!isConfigured) {
    return NextResponse.json({
      success: true,
      available: false,
      isConfigured: false,
      message: "VngZz2 Payment API key is not configured.",
    });
  }

  const health = await checkVngZz2Health(5000);
  return NextResponse.json({
    success: true,
    available: health.available,
    isConfigured: true,
    state: health.state,
    latencyMs: health.latencyMs,
    service: health.service,
    version: health.version,
    message: health.message,
  });
}
