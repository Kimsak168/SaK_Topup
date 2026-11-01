import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/auth";
import {
  createVngzzSmmDeposit,
  checkVngzzTransaction,
  getVngzzSmmProfile,
} from "@/lib/suppliers/vngzz2Smm";
import { VngzzGameError } from "@/lib/suppliers/vngzz2";

export const dynamic = "force-dynamic";

/**
 * Validates whether the incoming request is authorized by either:
 * 1. An active Admin session (cookie or admin JWT Bearer)
 * 2. An API Key matching configured server secrets (X-API-Key or Authorization Bearer)
 */
async function authorizeRequest(req: NextRequest): Promise<boolean> {
  // 1. Check admin session
  const session = await getAdminSessionFromRequest(req);
  if (session) return true;

  // 2. Check API Key header
  const apiKey = req.headers.get("x-api-key") || req.headers.get("x-apikey");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const candidateKey = apiKey || bearerToken;
  if (!candidateKey) return false;

  const validKeys = [
    process.env.ADMIN_API_KEY,
    process.env.VNGZZ2_PAYMENT_API_KEY,
    process.env.VNGZZ2_GAME_API_KEY,
    process.env.VNGZZ2_PRIMARY_API_KEY,
  ].filter((k): k is string => Boolean(k && k.trim()));

  return validKeys.some((k) => k.trim() === candidateKey.trim());
}

/**
 * POST /api/v1/smm/deposit
 * Top up SMM wallet balance with ABA KHQR (0% fee).
 * Accepts: { amount: "10.00" | 10.00, currency?: "USD" | "KHR" }
 */
export async function POST(req: NextRequest) {
  const isAuth = await authorizeRequest(req);
  if (!isAuth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Admin session or valid API key required." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: "Deposit request body must be an object." },
      { status: 400 }
    );
  }

  const rawAmount = body.amount;
  if (
    (typeof rawAmount !== "string" && typeof rawAmount !== "number") ||
    !rawAmount ||
    (typeof rawAmount === "number" && rawAmount <= 0)
  ) {
    return NextResponse.json(
      { success: false, error: "Parameter 'amount' must be a positive number or string (e.g. '10.00')." },
      { status: 400 }
    );
  }

  const currency = body.currency === "KHR" ? "KHR" : "USD";

  try {
    const result = await createVngzzSmmDeposit({
      amount: rawAmount,
      currency,
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof VngzzGameError ? error.status : 502;
    const message = error instanceof Error ? error.message : "SMM deposit request failed.";
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * GET /api/v1/smm/deposit
 * If `?transaction_id=...` is provided: checks payment status of the deposit.
 * Otherwise: returns the current SMM reseller profile and balance.
 */
export async function GET(req: NextRequest) {
  const isAuth = await authorizeRequest(req);
  if (!isAuth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Admin session or valid API key required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get("transaction_id");

  try {
    if (transactionId) {
      const result = await checkVngzzTransaction(transactionId);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const profile = await getVngzzSmmProfile();
    return NextResponse.json(
      { success: true, ...profile },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof VngzzGameError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Failed to query SMM deposit/profile.";
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}

