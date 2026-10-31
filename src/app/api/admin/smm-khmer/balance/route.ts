import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getKhmerSmmBalance, VngzzKhmerSmmError } from "@/lib/suppliers/vngzz2SmmKhmer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const data = await getKhmerSmmBalance();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof VngzzKhmerSmmError ? error.status : 502;
    const message = error instanceof VngzzKhmerSmmError ? error.message : "Khmer SMM balance is unavailable.";
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
