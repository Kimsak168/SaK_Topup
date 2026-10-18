import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getAdminRedirect } from "@/lib/adminRedirect";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Server-side Protection for /admin routes
  if (pathname.startsWith("/admin")) {
    // Allow access to login page
    if (pathname === "/admin/login") {
      const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (token) {
        const session = await verifyAdminToken(token);
        if (session) {
          // Already authenticated, redirect to /admin
          const from = getAdminRedirect(request.nextUrl.searchParams.get("from"));
          return NextResponse.redirect(new URL(from, request.url));
        }
      }
      return NextResponse.next();
    }

    // Protect all other /admin routes
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const session = token ? await verifyAdminToken(token) : null;

    if (!session) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // 2. Server-side Protection for /api/admin routes
  if (pathname.startsWith("/api/admin")) {
    // Exclude public admin auth routes
    if (pathname === "/api/admin/auth/login") {
      return NextResponse.next();
    }

    const token =
      request.cookies.get(ADMIN_COOKIE_NAME)?.value ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const session = token ? await verifyAdminToken(token) : null;
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Administrator authentication required",
        },
        { status: 401 }
      );
    }

    return NextResponse.next();
  }

  // 3. Customer route normalization: /games/[supplier]/[code] invalid combinations and aliases
  if (pathname.startsWith("/games/")) {
    const parts = pathname.split("/").filter(Boolean); // ['games', supplier, code]
    if (parts.length >= 3) {
      const supplier = parts[1].toLowerCase();
      const code = parts[2].toLowerCase();

      // Free Fire routing to WebBuilder (Canonical game code: freefire_sgmy)
      if (
        (supplier === "g2bulk" || supplier === "vizo") &&
        (code.includes("freefire") || code.startsWith("free-fire") || code === "ff")
      ) {
        return NextResponse.redirect(new URL("/games/webbuilder/freefire_sgmy", request.url));
      }

      // Canonical Free Fire path on WebBuilder
      if (
        supplier === "webbuilder" &&
        (code === "free-fire" || code === "freefire" || code === "ff" || code === "freefire_global")
      ) {
        return NextResponse.redirect(new URL("/games/webbuilder/freefire_sgmy", request.url));
      }

      // PUBG Mobile routing to G2Bulk
      if (supplier === "vizo" && (code === "pubgm" || code === "pubg-mobile")) {
        return NextResponse.redirect(new URL("/games/g2bulk/pubgm", request.url));
      }
      if (supplier === "g2bulk" && code === "pubg-mobile") {
        return NextResponse.redirect(new URL("/games/g2bulk/pubgm", request.url));
      }

      // Mobile Legends routing to WebBuilder (Canonical game code: mlbb)
      if (
        (supplier === "vizo" || supplier === "g2bulk") &&
        (code === "mlbb" || code === "mobile-legends" || code === "mlbb_global")
      ) {
        return NextResponse.redirect(new URL("/games/webbuilder/mlbb", request.url));
      }
      if (supplier === "webbuilder" && (code === "mobile-legends" || code === "mlbb_global")) {
        return NextResponse.redirect(new URL("/games/webbuilder/mlbb", request.url));
      }

      // Honor of Kings routing to WebBuilder (Canonical game code: hok)
      if (supplier !== "webbuilder" && (code === "honor-of-kings" || code === "hok" || code === "honor_of_kings")) {
        return NextResponse.redirect(new URL("/games/webbuilder/hok", request.url));
      }
      if (supplier === "webbuilder" && (code === "honor-of-kings" || code === "honor_of_kings")) {
        return NextResponse.redirect(new URL("/games/webbuilder/hok", request.url));
      }
    }
  }

  // 4. Handle legacy /game/[slug] redirects
  if (pathname.startsWith("/game/")) {
    const parts = pathname.split("/").filter(Boolean); // ['game', slug]
    if (parts.length >= 2) {
      const slug = parts[1].toLowerCase();

      if (slug.includes("freefire") || slug.startsWith("free-fire") || slug === "ff") {
        return NextResponse.redirect(new URL("/games/webbuilder/freefire_sgmy", request.url));
      }

      if (slug === "pubg-mobile" || slug === "pubgm") {
        return NextResponse.redirect(new URL("/games/g2bulk/pubgm", request.url));
      }

      if (slug === "mobile-legends" || slug === "mlbb" || slug === "mlbb_global") {
        return NextResponse.redirect(new URL("/games/webbuilder/mlbb", request.url));
      }

      if (slug === "valorant") {
        return NextResponse.redirect(new URL("/games/g2bulk/valorant", request.url));
      }

      if (slug === "bloodstrike" || slug === "blood-strike") {
        return NextResponse.redirect(new URL("/games/g2bulk/bloodstrike", request.url));
      }

      if (slug === "honor-of-kings" || slug === "hok" || slug === "honor_of_kings") {
        return NextResponse.redirect(new URL("/games/webbuilder/hok", request.url));
      }

      // Let the legacy page resolve the configured supplier from the database.
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/games/:path*",
    "/game/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
