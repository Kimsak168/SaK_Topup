import { NextRequest, NextResponse } from "next/server";
import { testVizo } from "@/lib/suppliers/vizo";
import { testG2Bulk } from "@/lib/suppliers/g2bulk";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  const result = {
    success: true,
    timestamp: new Date().toISOString(),
    vizo: {
      status: "offline",
      latencyMs: 0,
      baseUrl: process.env.VIZO_BASE_URL || "https://api.vizoapp.store",
      apiKeyConfigured: Boolean(process.env.VIZO_API_KEY),
      apiKeyMasked: process.env.VIZO_API_KEY
        ? `${process.env.VIZO_API_KEY.slice(0, 8)}...${process.env.VIZO_API_KEY.slice(-6)}`
        : "Not configured",
      reseller: null as Record<string, unknown> | null,
      error: null as string | null,
    },
    g2bulk: {
      status: "offline",
      latencyMs: 0,
      baseUrl: process.env.G2BULK_BASE_URL || "https://api.g2bulk.com/v1",
      apiKeyConfigured: Boolean(process.env.G2BULK_API_KEY),
      apiKeyMasked: process.env.G2BULK_API_KEY
        ? `${process.env.G2BULK_API_KEY.slice(0, 8)}...${process.env.G2BULK_API_KEY.slice(-6)}`
        : "Not configured",
      reseller: null as Record<string, unknown> | null,
      error: null as string | null,
    },
  };

  // Test Vizo API
  const vizoStart = Date.now();
  try {
    const vizoProfile = await testVizo();
    result.vizo.latencyMs = Date.now() - vizoStart;
    result.vizo.status = "online";
    result.vizo.reseller = vizoProfile;
  } catch (err: unknown) {
    result.vizo.latencyMs = Date.now() - vizoStart;
    result.vizo.status = "error";
    result.vizo.error = err instanceof Error ? err.message : "Vizo connection failed";
  }

  // Test G2Bulk API
  const g2Start = Date.now();
  try {
    const g2Profile = await testG2Bulk();
    result.g2bulk.latencyMs = Date.now() - g2Start;
    if (g2Profile && g2Profile.success) {
      result.g2bulk.status = "online";
      result.g2bulk.reseller = g2Profile;
    } else {
      result.g2bulk.status = "error";
      result.g2bulk.error = "G2Bulk returned unsuccessful status";
    }
  } catch (err: unknown) {
    result.g2bulk.latencyMs = Date.now() - g2Start;
    result.g2bulk.status = "error";
    result.g2bulk.error = err instanceof Error ? err.message : "G2Bulk connection failed";
  }

  return NextResponse.json(result);
}
