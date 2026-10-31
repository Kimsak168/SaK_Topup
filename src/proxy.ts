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

  // 3. Customer route normalization. Keep supplier-owned catalogs on their
  // supplier routes; only apply legacy aliases to WebBuilder game URLs.
  if (pathname.startsWith("/games/")) {
    const parts = pathname.split("/").filter(Boolean); // ['games', supplier, code]
    if (parts.length >= 3) {
      const supplier = parts[1].toLowerCase();
      const rawCode = parts[2].toLowerCase();

      // Preserve exact supplier and regional codes for imported catalogs.
      if (["vngzz2", "g2bulk"].includes(supplier)) {
        return NextResponse.next();
      }

      // Canonical code mappings
      let canonicalCode = rawCode;
      if (rawCode.includes("freefire") || rawCode.startsWith("free-fire") || rawCode === "ff" || rawCode.includes("khsgmy") || rawCode.includes("sgmy")) {
        canonicalCode = "freefire_khsgmy";
      } else if (rawCode === "mlbb" || rawCode === "mobile-legends" || rawCode === "mlbb_global") {
        canonicalCode = "mlbb";
      } else if (rawCode === "honor-of-kings" || rawCode === "hok" || rawCode === "honor_of_kings") {
        canonicalCode = "hok";
      } else if (rawCode === "pubg-mobile" || rawCode === "pubgm") {
        canonicalCode = "pubgm";
      } else if (rawCode === "blood-strike" || rawCode === "bloodstrike") {
        canonicalCode = "bloodstrike";
      } else if (rawCode === "magic-chess" || rawCode === "magic-chess-gogo" || rawCode === "magic_chess") {
        canonicalCode = "magic_chess";
      } else if (rawCode === "8ballpool" || rawCode === "8-ball-pool") {
        canonicalCode = "8ballpool";
      } else if (rawCode === "telegram" || rawCode === "telegram-stars" || rawCode === "tg") {
        canonicalCode = "telegram";
      }

      if (supplier !== "webbuilder" || rawCode !== canonicalCode) {
        return NextResponse.redirect(new URL(`/games/webbuilder/${canonicalCode}`, request.url));
      }
    }
  }

  // 4. Handle legacy /game/[slug] redirects
  if (pathname.startsWith("/game/")) {
    const parts = pathname.split("/").filter(Boolean); // ['game', slug]
    if (parts.length >= 2) {
      const slug = parts[1].toLowerCase();

      if (slug.startsWith("vngzz2-")) return NextResponse.next();

      let canonicalCode: string | null = null;
      if (slug.includes("freefire") || slug.startsWith("free-fire") || slug === "ff" || slug.includes("khsgmy") || slug.includes("sgmy")) {
        canonicalCode = "freefire_khsgmy";
      } else if (slug === "mobile-legends" || slug === "mlbb" || slug === "mlbb_global") {
        canonicalCode = "mlbb";
      } else if (slug === "honor-of-kings" || slug === "hok" || slug === "honor_of_kings") {
        canonicalCode = "hok";
      } else if (slug === "pubg-mobile" || slug === "pubgm") {
        canonicalCode = "pubgm";
      } else if (slug === "bloodstrike" || slug === "blood-strike") {
        canonicalCode = "bloodstrike";
      } else if (slug === "magic-chess" || slug === "magic-chess-gogo" || slug === "magic_chess") {
        canonicalCode = "magic_chess";
      } else if (slug === "8ballpool" || slug === "8-ball-pool") {
        canonicalCode = "8ballpool";
      } else if (slug === "telegram" || slug === "telegram-stars" || slug === "tg") {
        canonicalCode = "telegram";
      }

      if (canonicalCode) {
        return NextResponse.redirect(new URL(`/games/webbuilder/${canonicalCode}`, request.url));
      }
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
