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
    if (typeof record.amount !== "string" || (record.currency !== "USD" && record.currency !== "KHR")) {
      return NextResponse.json({ success: false, error: "Provide an amount and USD or KHR currency." }, { status: 400 });
    }
    const data = await createKhmerSmmDeposit({ amount: record.amount, currency: record.currency });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof VngzzKhmerSmmError ? error.status : 502;
    const message = error instanceof VngzzKhmerSmmError ? error.message : "Khmer SMM deposit request failed.";
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
