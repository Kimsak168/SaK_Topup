import type { ClientGame, ClientPackage } from "@/types/game";

export type PackageVariant = "free-fire" | "mobile-legends" | "other";
export type PackageKind =
  | "monthly"
  | "weekly-double"
  | "weekly-lite"
  | "weekly"
  | "weekly-elite"
  | "weekly-five"
  | "twilight"
  | "featured";

export function getPackageVariant(game: Pick<ClientGame, "name" | "slug" | "code">): PackageVariant {
  const haystack = `${game.name} ${game.slug} ${game.code}`;
  if (/free\s*fire|freefire/i.test(haystack)) return "free-fire";
  if (/mobile\s*legends|mlbb/i.test(haystack)) return "mobile-legends";
  return "other";
}

export function getPackageKind(pkg: ClientPackage, variant: Exclude<PackageVariant, "other">): PackageKind | null {
  const label = `${pkg.name} ${pkg.diamondsOrPoints || ""}`.toLowerCase();

  if (variant === "free-fire") {
    if (/\bmonthly\b/.test(label)) return "monthly";
    if (/\bweekly\b/.test(label) && /[\u00d7x]\s*2\b/.test(label)) return "weekly-double";
    if (/\bweekly\s*lite\b/.test(label)) return "weekly-lite";
    return null;
  }

  if (/\btwilight\b/.test(label)) return "twilight";
  if (/\bweekly\b/.test(label) && /[\u00d7x]\s*5\b/.test(label)) return "weekly-five";
  if (/\bweekly\b.*\belite\b/.test(label)) return "weekly-elite";
  if (/\bweekly\b/.test(label)) return "weekly";
  return null;
}

/**
 * Picks only the featured marquee packages for a game so SSR/RSC payloads do
 * not serialize hundreds of unused package records onto the home page.
 */
export function selectFeaturedSlides(
  game: ClientGame,
  packages: ClientPackage[],
  variant: PackageVariant
): { game: ClientGame; pkg: ClientPackage; kind: PackageKind; variant: PackageVariant }[] {
  const isEligible = (item: ClientPackage) => item.isAvailable && (item.sellingPrice ?? 0) > 0;
  if (variant === "other") {
    const pkg = packages
      .filter(isEligible)
      .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || (a.sellingPrice ?? Infinity) - (b.sellingPrice ?? Infinity))[0];
    return pkg ? [{ game, pkg, kind: "featured", variant }] : [];
  }

  const kinds = variant === "free-fire"
    ? (["monthly", "weekly-double", "weekly-lite"] as const)
    : (["weekly-elite", "weekly-five", "twilight"] as const);

  return kinds.flatMap((kind) => {
    const pkg = packages.find((item) => getPackageKind(item, variant) === kind && isEligible(item))
      ?? (kind === "weekly-elite"
        ? packages.find((item) => getPackageKind(item, variant) === "weekly" && isEligible(item))
        : undefined);
    return pkg ? [{ game, pkg, kind, variant }] : [];
  });
}

