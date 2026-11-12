import Image from "next/image";
import { StorefrontLink } from "./StorefrontLink";
import { Package as PackageIcon } from "lucide-react";
import {
  selectFeaturedSlides,
  type PackageKind,
  type PackageVariant,
} from "@/lib/featuredPackages";
import type { ClientGame, ClientPackage } from "@/types/game";

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

function PackageSlide({ game, pkg, kind, variant }: { game: ClientGame; pkg: ClientPackage; kind: PackageKind; variant: PackageVariant }) {
  const price = pkg.sellingPrice;
  if (price === null) return null;
  const originalPrice = pkg.originalPrice && pkg.originalPrice > price ? pkg.originalPrice : null;
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const customImage = pkg.customImage?.trim() || null;
  const fallbackImage = variant === "free-fire"
    ? kind === "monthly"
      ? "/images/packages/freefire-monthly-transparent.webp"
      : "/images/packages/freefire-weekly-transparent.webp"
    : game.image || "/images/diamond-crystals.webp";
  const badge = kind === "monthly" ? "Best value" : pkg.badge;
  const useMobileLegendsIcon = variant === "mobile-legends" && !customImage;
  const useGameCover = variant === "other" && !customImage;
  const artClassName = useMobileLegendsIcon
    ? "home-package-slide-art home-package-slide-art--icon"
    : useGameCover
      ? "home-package-slide-art home-package-slide-art--game"
      : "home-package-slide-art";

  return (
    <StorefrontLink
      className="home-package-slide"
      href={`${game.path}?package=${encodeURIComponent(pkg.id)}`}
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
            quality={80}
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
    </StorefrontLink>
  );
}

export function HomeFeaturedPackages({ groups }: HomeFeaturedPackagesProps) {
  const slides = groups.flatMap<FeaturedPackageSlide>(({ game, packages, variant }) =>
    selectFeaturedSlides(game, packages, variant)
  );

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
