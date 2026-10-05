import { NextRequest, NextResponse } from "next/server";
import { testVizo } from "@/lib/suppliers/vizo";
import { testG2Bulk } from "@/lib/suppliers/g2bulk";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function configuration() {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    vizo: {
      status: process.env.VIZO_API_KEY ? "configured" : "unavailable",
      latencyMs: null as number | null,
      baseUrl: process.env.VIZO_BASE_URL || "https://api.vizoapp.store",
      apiKeyConfigured: Boolean(process.env.VIZO_API_KEY),
      reseller: null as Record<string, unknown> | null,
      error: null as string | null,
    },
    g2bulk: {
      status: process.env.G2BULK_API_KEY ? "configured" : "unavailable",
      latencyMs: null as number | null,
      baseUrl: process.env.G2BULK_BASE_URL || "https://api.g2bulk.com/v1",
      apiKeyConfigured: Boolean(process.env.G2BULK_API_KEY),
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
  await Promise.all([
    (async () => {
      if (!result.vizo.apiKeyConfigured) return;
      const start = Date.now();
      try {
        const profile = await testVizo();
        result.vizo.status = profile ? "connected" : "failed";
        result.vizo.reseller = profile ? {
          balance: profile.balance,
          id: profile.id,
          username: profile.username,
          total_spent: profile.total_spent,
          total_orders: profile.total_orders,
          success_orders: profile.success_orders,
          failed_orders: profile.failed_orders,
        } : null;
        if (!profile) result.vizo.error = "Vizo did not return an account profile";
      } catch (error) {
        console.error("Vizo verification failed:", error);
        result.vizo.status = "failed";
        result.vizo.error = error instanceof Error ? error.message : "Vizo connection failed";
      } finally {
        result.vizo.latencyMs = Date.now() - start;
      }
    })(),
    (async () => {
      if (!result.g2bulk.apiKeyConfigured) return;
      const start = Date.now();
      try {
        const profile = await testG2Bulk();
        result.g2bulk.status = profile?.success ? "connected" : "failed";
        result.g2bulk.reseller = profile?.success ? {
          balance: profile.balance,
          user_id: profile.user_id,
          username: profile.username,
          first_name: profile.first_name,
        } : null;
        if (!profile?.success) result.g2bulk.error = "G2Bulk returned an unsuccessful status";
      } catch (error) {
        console.error("G2Bulk verification failed:", error);
        result.g2bulk.status = "failed";
        result.g2bulk.error = error instanceof Error ? error.message : "G2Bulk connection failed";
      } finally {
        result.g2bulk.latencyMs = Date.now() - start;
      }
    })(),
  ]);
  result.timestamp = new Date().toISOString();
  return NextResponse.json(result);
}
