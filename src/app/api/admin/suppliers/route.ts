import { NextRequest, NextResponse } from "next/server";
import { getWebBuilderBalance } from "@/lib/suppliers/webbuilder";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function configuration() {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    webbuilder: {
      status: process.env.WEBBUILDER_API_KEY ? "configured" : "unavailable",
      latencyMs: null as number | null,
      baseUrl: process.env.WEBBUILDER_BASE_URL || "https://webbuilderservice.dev/v1",
      apiKeyConfigured: Boolean(process.env.WEBBUILDER_API_KEY),
      reseller: null as Record<string, unknown> | null,
      error: null as string | null,
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  return NextResponse.json(configuration());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const result = configuration();

  if (result.webbuilder.apiKeyConfigured) {
    const start = Date.now();
    try {
      const bal = await getWebBuilderBalance();
      result.webbuilder.status = "connected";
      result.webbuilder.reseller = {
        balance: (bal.available_cents / 100).toFixed(2),
        available_cents: bal.available_cents,
        reserved_cents: bal.reserved_cents,
      };
    } catch (error) {
      console.error("WebBuilder verification failed:", error);
      result.webbuilder.status = "failed";
      result.webbuilder.error =
        error instanceof Error ? error.message : "WebBuilder connection failed";
    } finally {
      result.webbuilder.latencyMs = Date.now() - start;
    }
  }

  result.timestamp = new Date().toISOString();
  return NextResponse.json(result);
}
