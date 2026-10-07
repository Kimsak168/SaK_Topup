"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { Ban, Check, Package as PackageIcon, Sparkles, Zap } from "lucide-react";
import type { ClientPackage } from "@/types/game";

interface PackageCardProps {
  pkg: ClientPackage;
  isSelected: boolean;
  onSelect: (pkg: ClientPackage) => void;
}

const PackageCard = memo(function PackageCard({ pkg, isSelected, onSelect }: PackageCardProps) {
  const isAvailable = pkg.isAvailable && pkg.sellingPrice !== null && pkg.sellingPrice > 0;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageSrc = pkg.customImage?.trim();
  return (
    <button
      key={pkg.id}
      type="button"
      aria-pressed={isSelected}
      disabled={!isAvailable}
      onClick={() => {
        if (isAvailable) onSelect(pkg);
      }}
      className={`package-option group relative flex flex-col sm:flex-row items-center text-center sm:text-left gap-1.5 sm:gap-2.5 p-1.5 min-[360px]:p-2 sm:p-3 rounded-lg sm:rounded-xl border cursor-pointer transition-all ${
        !isAvailable
          ? "opacity-40 bg-muted border-border cursor-not-allowed"
          : isSelected
          ? "bg-pink-50/70 border-primary ring-2 ring-primary/20 shadow-soft shadow-pink-500/10 sm:bg-accent sm:border-primary"
          : "bg-card border-card-border hover:border-primary hover:shadow-soft hover:shadow-pink-500/8"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className="public-button absolute -top-1.5 right-1 sm:-top-2 sm:right-2 rounded-full px-1 py-0.5 text-[7px] sm:px-1.5 sm:text-[8px] font-black uppercase tracking-wider text-primary-foreground shadow-xs z-10">
          {pkg.badge}
        </span>
      )}

      {/* Package Image — top on mobile, left side on desktop */}
      <div className="relative h-10 w-10 min-[360px]:h-11 min-[360px]:w-11 sm:h-14 sm:w-14 xl:h-16 xl:w-16 shrink-0 rounded-lg sm:rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center shadow-xs sm:shadow-sm">
        {imageSrc && failedImage !== imageSrc ? (
          <Image
            src={imageSrc}
            alt={pkg.name}
            fill
            sizes="(max-width: 639px) 44px, (min-width: 1280px) 64px, 56px"
            loading="lazy"
            className="object-contain p-0.5 sm:p-0 sm:object-cover"
            onError={() => setFailedImage(imageSrc)}
          />
        ) : (
          <PackageIcon className="h-4 w-4 sm:h-5 sm:w-5 text-secondary-foreground" />
        )}
      </div>

      {/* Info — below image on mobile, right side on desktop */}
      <div className="w-full flex-1 min-w-0 flex flex-col justify-between items-center sm:items-start pr-0 sm:pr-5">
        <div className="w-full">
          <div className="text-[10px] min-[360px]:text-[11px] sm:text-sm font-bold text-foreground leading-tight sm:leading-snug line-clamp-2 text-center sm:text-left h-7 sm:h-auto break-words">
            {pkg.diamondsOrPoints || pkg.name}
          </div>
          {pkg.bonus && (
            <div className="text-[8px] min-[360px]:text-[9px] sm:text-[10px] font-bold text-success truncate text-center sm:text-left mt-0.5">
              {pkg.bonus}
            </div>
          )}
        </div>

        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-0.5 sm:gap-1.5 mt-1 sm:mt-0.5 w-full justify-center sm:justify-start">
            <span className="text-xs min-[360px]:text-[13px] sm:text-base font-black text-primary leading-none">
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
              <span className="text-[9px] sm:text-[10px] text-secondary-foreground line-through leading-none">
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground flex items-center justify-center sm:justify-start gap-1 mt-1 sm:mt-0.5">
            <Ban className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground" />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Selected Checkmark — small check badge in top-right corner */}
      {isSelected && isAvailable && (
        <div className="absolute top-1 right-1 sm:top-2 sm:right-2 h-3.5 w-3.5 sm:h-5 sm:w-5 rounded-full bg-primary flex items-center justify-center shadow-xs sm:shadow-md sm:shadow-pink-500/25">
          <Check className="h-2 w-2 sm:h-3 sm:w-3 text-primary-foreground" strokeWidth={3} />
        </div>
      )}
    </button>
  );
});
PackageCard.displayName = "PackageCard";

interface PackageOptionsProps {
  packages: ClientPackage[];
  selectedId?: string;
  currencyName: string;
  onSelect: (pkg: ClientPackage) => void;
}

export const PackageOptions = memo(function PackageOptions({ packages, selectedId, currencyName, onSelect }: PackageOptionsProps) {
  const { validPackages, specialPackages, diamondPackages } = useMemo(() => {
    const validPackages = packages.filter(p => p.isAvailable && p.sellingPrice !== null && p.sellingPrice > 0);
    const specialPackages: ClientPackage[] = [];
    const diamondPackages: ClientPackage[] = [];
    for (const pkg of validPackages) {
      const special = pkg.group === "special" || pkg.category === "special" || /pass|pack|weekly|monthly|twilight|starlight|member/i.test(pkg.name);
      (special ? specialPackages : diamondPackages).push(pkg);
    }
    return { validPackages, specialPackages, diamondPackages };
  }, [packages]);
  const hasDistinction = specialPackages.length > 0 && diamondPackages.length > 0;
  const renderPackageCard = (pkg: ClientPackage) => (
    <PackageCard key={pkg.id} pkg={pkg} isSelected={selectedId === pkg.id} onSelect={onSelect} />
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="public-button flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-primary-foreground shadow-md">
            2
          </span>
          <h3 className="text-base sm:text-lg font-bold text-foreground">
            Select {currencyName} Package
          </h3>
        </div>
        <span className="text-xs font-semibold text-secondary-foreground">
          {validPackages.length} packages available
        </span>
      </div>

      {validPackages.length > 0 ? (
        <div className="space-y-6">
          {/* Special Passes Section */}
          {specialPackages.length > 0 && (
            <div className="space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-purple">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Passes &amp; Special Bundles</span>
                </div>
              )}
              <div className="grid grid-cols-2 min-[340px]:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-1.5 min-[360px]:gap-2 sm:gap-3">
                {specialPackages.map(renderPackageCard)}
              </div>
            </div>
          )}

          {/* Diamond Denominations Section */}
          {diamondPackages.length > 0 && (
            <div className="space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-blue pt-3 border-t border-border">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Diamond Denominations</span>
                </div>
              )}
              <div className="grid grid-cols-2 min-[340px]:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-1.5 min-[360px]:gap-2 sm:gap-3">
                {diamondPackages.map(renderPackageCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No customer-ready packages configured yet. Check back soon!
        </div>
      )}
    </>
  );

});
