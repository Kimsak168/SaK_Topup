import { NextResponse } from "next/server";
import { checkVngZz2Health, isVngZz2Configured } from "@/lib/services/vngzzPayWayService";

export const dynamic = "force-dynamic";

export async function GET() {
  const isConfigured = isVngZz2Configured();
  if (!isConfigured) {
    return NextResponse.json({
      success: true,
      available: true,
      isConfigured: false,
      mode: "sandbox",
      message: "ABA PayWay V2 is operating in Sandbox mode. Add VNGZZ2_PRIMARY_API_KEY to .env.local to activate Live gateway.",
    });
  }

  const health = await checkVngZz2Health(5000);
  return NextResponse.json({
    success: true,
    available: health.available,
    isConfigured: true,
    mode: "live",
    state: health.state,
    latencyMs: health.latencyMs,
    service: health.service,
    version: health.version,
    message: health.message,
  });
}
