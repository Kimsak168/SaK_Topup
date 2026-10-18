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
      className={`package-option group relative flex min-h-[104px] w-full flex-col items-center gap-1 rounded-xl border p-1.5 text-center cursor-pointer transition-[background-color,border-color,box-shadow] sm:min-h-[88px] sm:flex-row sm:gap-1.5 sm:p-2 sm:text-left focus-visible:outline-2 focus-visible:outline-[#22C55E] focus-visible:outline-offset-2 ${
        !isAvailable
          ? "opacity-50 bg-[#F0FDF4]/50 border-[#DCFCE7] cursor-not-allowed"
          : isSelected
          ? "bg-[#16A34A] border-[#15803D] ring-2 ring-[#22C55E]/50 shadow-md"
          : "bg-white border-[#DCFCE7] hover:border-[#22C55E] hover:shadow-xs active:bg-[#F0FDF4]"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className="absolute -top-1.5 right-1 sm:-top-2 sm:right-2 rounded-full px-1 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wider bg-[linear-gradient(135deg,#16A34A,#22C55E)] text-white shadow-xs z-10">
          {pkg.badge}
        </span>
      )}

      {/* Package Image — top on mobile, left side on desktop */}
      <div className="relative aspect-square w-full max-w-[80px] shrink-0 rounded-xl overflow-hidden bg-transparent flex items-center justify-center sm:aspect-auto sm:h-14 sm:w-14 sm:max-w-none md:h-16 md:w-16 lg:h-16 lg:w-16">
        {imageSrc && failedImage !== imageSrc ? (
          <Image
            src={imageSrc}
            alt={pkg.name}
            fill
            sizes="(max-width: 639px) 80px, (max-width: 767px) 56px, 64px"
            loading="lazy"
            className="object-contain sm:object-cover"
            onError={() => setFailedImage(imageSrc)}
          />
        ) : (
          <PackageIcon className="h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-[#64748B]" />
        )}
      </div>

      {/* Info — below image on mobile, right side on desktop */}
      <div className="flex w-full min-w-0 flex-col items-center sm:w-auto sm:flex-1 sm:items-start">
        <div className="w-full min-w-0">
          <div className={`text-[10px] min-[400px]:text-[11px] sm:text-[11px] font-semibold leading-tight line-clamp-2 text-center break-words sm:text-left ${isSelected ? "text-white" : "text-[#172033]"}`}>
            {pkg.diamondsOrPoints || pkg.name}
          </div>
          {pkg.bonus ? (
            <div className={`text-[8px] sm:text-[10px] font-bold truncate text-center mt-0.5 sm:text-left ${isSelected ? "text-green-100" : "text-[#22C55E]"}`}>
              {pkg.bonus}
            </div>
          ) : null}
        </div>

        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="flex w-full flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 mt-1 sm:justify-start">
            <span className={`text-[12px] min-[400px]:text-[13px] sm:text-[13px] font-bold leading-none ${isSelected ? "text-white" : "text-[#16A34A]"}`}>
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
                <span className={`text-[8px] min-[400px]:text-[8px] sm:text-[8px] line-through leading-none ${isSelected ? "text-white/70" : "text-[#94A3B8]"}`}>
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] font-semibold text-[#64748B] flex items-center justify-center gap-1 mt-1 sm:justify-start">
            <Ban className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#64748B]" />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Selected Checkmark — small check badge in top-right corner */}
      {isSelected && isAvailable && (
        <div className="package-check-pop absolute top-1 right-1 sm:top-2 sm:right-2 h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 rounded-full bg-white flex items-center justify-center text-[#16A34A] shadow-xs">
          <Check className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-[#16A34A]" strokeWidth={3} />
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
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="topup-step-title">
          <span className="topup-step-number">
            2
          </span>
          <h2 className="text-sm sm:text-base font-bold text-[#172033]">
            Select Package<span className="sr-only"> for {currencyName}</span>
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#64748B]">
          {validPackages.length} options
        </span>
      </div>

      {validPackages.length > 0 ? (
        <div className="space-y-4 sm:space-y-5">
          {/* Special Passes Section */}
          {specialPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#16A34A]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Passes &amp; Special Bundles</span>
                </div>
              )}
              <div className="topup-package-grid">
                {specialPackages.map(renderPackageCard)}
              </div>
            </div>
          )}

          {/* Diamond Denominations Section */}
          {diamondPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#172033] pt-2.5 border-t border-[#DCFCE7]">
                  <Zap className="h-3.5 w-3.5 text-[#16A34A]" />
                  <span>Diamond Denominations</span>
                </div>
              )}
              <div className="topup-package-grid">
                {diamondPackages.map(renderPackageCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[#BBF7D0] bg-white p-6 text-center text-sm text-[#64748B]">
          No customer-ready packages configured yet. Check back soon!
        </div>
      )}
    </>
  );

});
