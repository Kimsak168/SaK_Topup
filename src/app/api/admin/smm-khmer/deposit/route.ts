import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { createKhmerSmmDeposit, VngzzKhmerSmmError } from "@/lib/suppliers/vngzz2SmmKhmer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid deposit request." }, { status: 400 });
  }

  try {
    const record = body as Record<string, unknown>;
    const rawAmount = typeof record.amount === "number" ? record.amount.toFixed(2) : String(record.amount || "").trim();
    const currency = record.currency === "KHR" ? "KHR" : "USD";
    if (!rawAmount || isNaN(parseFloat(rawAmount)) || parseFloat(rawAmount) <= 0) {
      return NextResponse.json({ success: false, error: "Provide a valid positive deposit amount." }, { status: 400 });
    }
    const data = await createKhmerSmmDeposit({ amount: rawAmount, currency });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof VngzzKhmerSmmError ? error.status : 502;
    const message = error instanceof VngzzKhmerSmmError ? error.message : "Khmer SMM deposit request failed.";
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
