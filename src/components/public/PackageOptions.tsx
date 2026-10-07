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
      className={`package-option group relative flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-2.5 p-1.5 min-[360px]:p-2 sm:p-3 rounded-xl border cursor-pointer transition-all h-full justify-between min-h-[114px] sm:min-h-0 ${
        !isAvailable
          ? "opacity-40 bg-slate-50 border-[#F8DCE9] cursor-not-allowed"
          : isSelected
          ? "bg-[#FFF1F7] border-[#EC168C] ring-1.5 ring-[#EC168C]/20 shadow-xs sm:bg-[#FFF1F7] sm:border-[#EC168C]"
          : "bg-white border-[#F8DCE9] hover:border-[#F4C7DD] hover:shadow-xs"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className="absolute -top-1.5 right-1 sm:-top-2 sm:right-2 rounded-full px-1 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wider bg-[#EC168C] text-white shadow-xs z-10">
          {pkg.badge}
        </span>
      )}

      {/* Package Image — top on mobile, left side on desktop */}
      <div className="relative h-9 w-9 min-[360px]:h-10 min-[360px]:w-10 sm:h-12 sm:w-12 xl:h-14 xl:w-14 shrink-0 rounded-lg overflow-hidden border border-[#F8DCE9] bg-[#FFF1F7] flex items-center justify-center shadow-xs">
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
          <PackageIcon className="h-4 w-4 sm:h-5 sm:w-5 text-[#64748B]" />
        )}
      </div>

      {/* Info — below image on mobile, right side on desktop */}
      <div className="w-full flex-1 min-w-0 flex flex-col justify-between items-center sm:items-start pr-0 sm:pr-4">
        <div className="w-full min-w-0">
          <div className="text-[10px] min-[360px]:text-[11px] sm:text-xs xl:text-sm font-bold text-[#1E293B] leading-tight line-clamp-2 text-center sm:text-left min-h-[24px] min-[360px]:min-h-[26px] sm:min-h-0 break-words">
            {pkg.diamondsOrPoints || pkg.name}
          </div>
          {pkg.bonus ? (
            <div className="text-[8px] min-[360px]:text-[9px] font-bold text-[#10B981] truncate text-center sm:text-left mt-0.5">
              {pkg.bonus}
            </div>
          ) : (
            <div aria-hidden="true" className="h-[12px] sm:hidden" />
          )}
        </div>

        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-0.5 sm:gap-1.5 mt-1 sm:mt-0.5 w-full justify-center sm:justify-start">
            <span className="text-xs min-[360px]:text-[13px] sm:text-sm xl:text-base font-black text-[#EC168C] leading-none">
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
              <span className="text-[9px] min-[360px]:text-[10px] text-[#64748B] line-through leading-none">
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[9px] min-[360px]:text-[10px] font-semibold text-[#64748B] flex items-center justify-center sm:justify-start gap-1 mt-1 sm:mt-0.5">
            <Ban className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#64748B]" />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Selected Checkmark — small check badge in top-right corner */}
      {isSelected && isAvailable && (
        <div className="absolute top-1 right-1 sm:top-2 sm:right-2 h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 rounded-full bg-[#EC168C] flex items-center justify-center text-white shadow-xs">
          <Check className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-white" strokeWidth={3} />
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
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-[#EC168C] text-xs font-black text-white shadow-xs">
            2
          </span>
          <h3 className="text-base sm:text-lg font-bold text-[#1E293B]">
            Select {currencyName} Package
          </h3>
        </div>
        <span className="text-xs font-semibold text-[#64748B]">
          {validPackages.length} packages available
        </span>
      </div>

      {validPackages.length > 0 ? (
        <div className="space-y-5 sm:space-y-6">
          {/* Special Passes Section */}
          {specialPackages.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#EC168C]">
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
            <div className="space-y-2.5 sm:space-y-3">
              {hasDistinction && (
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#1E293B] pt-3 border-t border-[#F8DCE9]">
                  <Zap className="h-3.5 w-3.5 text-[#EC168C]" />
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
        <div className="rounded-xl border border-[#F8DCE9] bg-white p-6 text-center text-sm text-[#64748B]">
          No customer-ready packages configured yet. Check back soon!
        </div>
      )}
    </>
  );

});
