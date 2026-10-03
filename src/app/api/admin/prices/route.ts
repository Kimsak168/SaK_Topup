import { NextRequest, NextResponse } from "next/server";
import { updatePackageSellingPrice } from "@/lib/services/gameService";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const { packageId, sellingPrice, badge } = body;

    if (!packageId || typeof sellingPrice !== "number" || sellingPrice <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid packageId or sellingPrice" },
        { status: 400 }
      );
    }

    const success = await updatePackageSellingPrice(packageId, sellingPrice, badge);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Package not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Package selling price updated successfully in MongoDB",
    });
  } catch (error) {
    console.error("Admin price update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Price update failed",
      },
      { status: 500 }
    );
  }
}
