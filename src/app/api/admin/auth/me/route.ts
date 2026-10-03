import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);

  if (!session) {
    return NextResponse.json(
      { success: false, authenticated: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    authenticated: true,
    user: {
      username: session.username,
      name: session.name || "SakSuuu Administrator",
      role: session.role || "Super Admin",
    },
  });
}
