import Image from "next/image";
import Link from "next/link";
import { Package as PackageIcon } from "lucide-react";
import type { ClientGame, ClientPackage } from "@/types/game";

type PackageVariant = "free-fire" | "mobile-legends" | "other";
type PackageKind = "monthly" | "weekly-double" | "weekly-lite" | "weekly" | "weekly-elite" | "weekly-five" | "twilight" | "featured";

interface FeaturedPackageGroup {
  game: ClientGame;
  packages: ClientPackage[];
  variant: PackageVariant;
}

interface HomeFeaturedPackagesProps {
  groups: FeaturedPackageGroup[];
}

interface FeaturedPackageSlide {
  game: ClientGame;
  pkg: ClientPackage;
  kind: PackageKind;
  variant: PackageVariant;
}

function getPackageKind(pkg: ClientPackage, variant: Exclude<PackageVariant, "other">): PackageKind | null {
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

function PackageSlide({ game, pkg, kind, variant }: { game: ClientGame; pkg: ClientPackage; kind: PackageKind; variant: PackageVariant }) {
  const price = pkg.sellingPrice;
  if (price === null) return null;
  const originalPrice = pkg.originalPrice && pkg.originalPrice > price ? pkg.originalPrice : null;
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const customImage = pkg.customImage?.trim() || null;
  const fallbackImage = variant === "free-fire"
    ? kind === "monthly"
      ? "/images/packages/freefire-monthly-transparent.png"
      : "/images/packages/freefire-weekly-transparent.png"
    : game.image || "/images/diamond-crystals.png";
  const badge = kind === "monthly" ? "Best value" : pkg.badge;
  const useMobileLegendsIcon = variant === "mobile-legends" && !customImage;
  const useGameCover = variant === "other" && !customImage;
  const artClassName = useMobileLegendsIcon
    ? "home-package-slide-art home-package-slide-art--icon"
    : useGameCover
      ? "home-package-slide-art home-package-slide-art--game"
      : "home-package-slide-art";

  return (
    <Link
      className="home-package-slide"
      href={`${game.path}?package=${encodeURIComponent(pkg.id)}`}
      prefetch={false}
      title={`${game.name}: select ${pkg.diamondsOrPoints || pkg.name}`}
    >
      {badge && <span className="home-package-best-value">{badge}</span>}
      <span className={artClassName}>
        {useMobileLegendsIcon ? (
          <PackageIcon aria-hidden="true" />
        ) : (
          <Image
            src={customImage || fallbackImage}
            alt=""
            fill
            sizes={useGameCover ? "64px" : "96px"}
            className={useGameCover ? "rounded-xl object-cover" : "object-contain"}
          />
        )}
      </span>
      <span className="home-package-slide-info">
        <span className="home-package-slide-game">{game.name}</span>
        <strong>{pkg.diamondsOrPoints || pkg.name}</strong>
        <span className="home-package-slide-pricing">
          <b>${price.toFixed(2)}</b>
          {originalPrice && <del>${originalPrice.toFixed(2)}</del>}
          {discount > 0 && <small>{discount}% off</small>}
        </span>
      </span>
    </Link>
  );
}

export function HomeFeaturedPackages({ groups }: HomeFeaturedPackagesProps) {
  const slides = groups.flatMap<FeaturedPackageSlide>(({ game, packages, variant }) => {
    const isEligible = (item: ClientPackage) => item.isAvailable && (item.sellingPrice ?? 0) > 0;
    if (variant === "other") {
      const pkg = packages
        .filter(isEligible)
        .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || (a.sellingPrice ?? Infinity) - (b.sellingPrice ?? Infinity))[0];
      return pkg ? [{ game, pkg, kind: "featured" as const, variant }] : [];
    }

    const kinds = variant === "free-fire"
      ? ["monthly", "weekly-double", "weekly-lite"] as const
      : ["weekly-elite", "weekly-five", "twilight"] as const;

    return kinds.flatMap((kind) => {
      const pkg = packages.find((item) => getPackageKind(item, variant) === kind && isEligible(item))
        ?? (kind === "weekly-elite"
          ? packages.find((item) => getPackageKind(item, variant) === "weekly" && isEligible(item))
          : undefined);
      return pkg ? [{ game, pkg, kind, variant }] : [];
    });
  });

  if (slides.length === 0) return null;
  const animationDuration = Math.max(48, slides.length * 8);

  return (
    <section className="home-package-marquee-section" aria-label="Featured packages for active games">
      <div className="home-package-marquee" role="region" aria-label="Active game package offers">
        <div className="home-package-marquee-track" style={{ animationDuration: `${animationDuration}s` }}>
          {[0, 1].map((copy) => (
            <div className="home-package-marquee-group" key={copy} aria-hidden={copy === 1} inert={copy === 1}>
              {slides.map(({ game, pkg, kind, variant }) => (
                <PackageSlide key={`${variant}-${pkg.id}`} game={game} pkg={pkg} kind={kind} variant={variant} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
