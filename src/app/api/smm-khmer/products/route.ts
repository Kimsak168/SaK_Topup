import { NextResponse } from "next/server";
import { getKhmerSmmCatalog, VngzzKhmerSmmError } from "@/lib/suppliers/vngzz2SmmKhmer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await getKhmerSmmCatalog();
    return NextResponse.json(
      { success: true, ...catalog },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof VngzzKhmerSmmError ? error.status : 502;
    const message = error instanceof VngzzKhmerSmmError
      ? error.message
      : "Khmer SMM products are temporarily unavailable.";
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
