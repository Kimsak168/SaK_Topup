"use client";

import { memo, useMemo } from "react";
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
  return (
    <button
      key={pkg.id}
      type="button"
      aria-pressed={isSelected}
      disabled={!isAvailable}
      onClick={() => {
        if (isAvailable) onSelect(pkg);
      }}
      className={`group relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-[transform,box-shadow] duration-200 cursor-pointer ${
        !isAvailable
          ? "opacity-40 bg-muted border-border cursor-not-allowed"
          : isSelected
          ? "bg-accent border-primary ring-2 ring-primary/20 shadow-soft shadow-pink-500/10"
          : "bg-card backdrop-blur-sm border-card-border hover:-translate-y-0.5 hover:border-primary hover:shadow-soft hover:shadow-pink-500/8 hover:bg-card"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className="public-button absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-primary-foreground shadow-sm z-10">
          {pkg.badge}
        </span>
      )}

      {/* Package Image — left side */}
      <div className="relative h-14 w-14 xl:h-16 xl:w-16 shrink-0 rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center shadow-sm">
        {pkg.customImage ? (
          <Image src={pkg.customImage} alt={pkg.name} fill sizes="(min-width: 1280px) 64px, 56px" loading="lazy" className="object-cover" />
        ) : (
          <PackageIcon className="h-5 w-5 text-secondary-foreground" />
        )}
      </div>

      {/* Info — right side */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 pr-5">
        <div className="text-[13px] sm:text-sm font-bold text-foreground leading-snug break-words">
          {pkg.diamondsOrPoints || pkg.name}
        </div>
        {pkg.bonus && (
          <div className="text-[10px] font-bold text-success break-words">
            {pkg.bonus}
          </div>
        )}
        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm sm:text-base font-black text-primary">
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
              <span className="text-[10px] text-secondary-foreground line-through">
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 mt-0.5">
            <Ban className="h-3 w-3 text-muted-foreground" />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Selected Checkmark */}
      {isSelected && isAvailable && (
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md shadow-pink-500/25">
          <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
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
