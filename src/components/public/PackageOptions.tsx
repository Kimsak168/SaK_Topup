"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { Ban, Check, Package as PackageIcon, Sparkles, Zap } from "lucide-react";
import type { ClientPackage } from "@/types/game";

const DEFAULT_DIAMOND_IMAGE = "/images/diamond-crystals.png";

interface PackageCardProps {
  pkg: ClientPackage;
  isDiamond: boolean;
  isSelected: boolean;
  defaultDiamondImage?: string;
  onSelect: (pkg: ClientPackage) => void;
}

const PackageCard = memo(function PackageCard({ pkg, isDiamond, isSelected, defaultDiamondImage = DEFAULT_DIAMOND_IMAGE, onSelect }: PackageCardProps) {
  const isAvailable = pkg.isAvailable && pkg.sellingPrice !== null && pkg.sellingPrice > 0;
  const discountPercent = isAvailable && pkg.originalPrice !== null && pkg.originalPrice > (pkg.sellingPrice ?? 0)
    ? Math.round(((pkg.originalPrice - (pkg.sellingPrice ?? 0)) / pkg.originalPrice) * 100)
    : 0;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const customImageSrc = pkg.customImage?.trim();
  const diamondImage = defaultDiamondImage;
  const imageSrc = customImageSrc && failedImage !== customImageSrc
    ? customImageSrc
    : isDiamond && failedImage !== diamondImage
    ? diamondImage
    : null;
  return (
    <button
      key={pkg.id}
      type="button"
      aria-pressed={isSelected}
      disabled={!isAvailable}
      onClick={() => {
        if (isAvailable) onSelect(pkg);
      }}
      className={`package-option group relative flex min-h-[50px] min-[360px]:min-h-[54px] sm:min-h-[58px] w-full flex-row items-center gap-2 min-[360px]:gap-2.5 sm:gap-3 rounded-xl border px-2 py-1.5 min-[360px]:px-2.5 min-[360px]:py-2 sm:px-3 sm:py-2 text-left cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-[#C084FC] focus-visible:outline-offset-2 ${
        !isAvailable
          ? "opacity-50 bg-[#0D0914]/40 border-[#2E1F45]/60 cursor-not-allowed"
          : isSelected
          ? "bg-[#180E2B] border-[#C084FC] ring-1.5 ring-[#C084FC]/50 shadow-[0_0_18px_rgba(192,132,252,0.22)]"
          : "bg-[#0D0914] border-[#2E1F45] hover:border-[#C084FC]/60 hover:bg-[#140D24] hover:shadow-[0_4px_14px_rgba(192,132,252,0.1)] active:scale-[0.985]"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className="absolute -top-2 left-2 rounded-full px-1.5 py-0.5 text-[6.5px] min-[360px]:text-[7px] sm:text-[7.5px] font-black uppercase tracking-wider bg-gradient-to-r from-[#A855F7] to-[#7C3AED] text-white shadow-xs z-10 pointer-events-none">
          {pkg.badge}
        </span>
      )}

      {/* Package Image — picture on left (big, prominent, fills frame) */}
      <div className="relative h-10 w-10 min-[360px]:h-11 min-[360px]:w-11 sm:h-12 sm:w-12 shrink-0 rounded-xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={pkg.name}
            fill
            sizes="(max-width: 639px) 44px, 48px"
            loading="lazy"
            className={`object-contain scale-115 transition-opacity duration-200 ease-out ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(true);
              setFailedImage(imageSrc);
            }}
          />
        ) : isDiamond ? (
          <Zap className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 text-[#C084FC] stroke-[2] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
        ) : (
          <PackageIcon className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 text-[#C084FC]/85 group-hover:text-[#C084FC] transition-colors" />
        )}
      </div>

      {/* Info — on right (compact & clean) */}
      <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
        <div className="text-[11px] min-[360px]:text-xs sm:text-[13px] font-bold text-[#F8F5FF] leading-tight truncate">
          {(() => {
            const raw = (pkg.diamondsOrPoints || pkg.name).trim();
            const levelUp = raw.replace(/Level\s*Up\s*(?:Package|Pass)?\s*[-–—:]*\s*(?:Level|Lv\.?)?\s*(\d+)/i, "Level Up $1");
            return isDiamond && !/diamonds?/i.test(levelUp) ? `${levelUp} Diamonds` : levelUp;
          })()}
        </div>
        {pkg.bonus ? (
          <div className="mt-0.5 truncate text-[7.5px] min-[360px]:text-[8.5px] font-semibold text-[#22C55E] leading-none">
            {pkg.bonus}
          </div>
        ) : null}

        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-0.5 sm:mt-1 leading-none">
            <span className="text-[12px] min-[360px]:text-[13px] sm:text-sm font-black text-[#C084FC] tracking-tight">
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
              <span className="text-[8px] min-[360px]:text-[8.5px] text-[#64748B] line-through font-medium">
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="rounded px-1.5 py-0.5 text-[6.5px] min-[360px]:text-[7px] font-black leading-none bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/30">
                {discountPercent}% off
              </span>
            )}
          </div>
        ) : (
          <div className="text-[9px] min-[360px]:text-[10px] font-semibold text-[#64748B] flex items-center gap-1 mt-0.5">
            <Ban className="h-2.5 w-2.5 text-[#64748B]" />
            <span>Unavailable</span>
          </div>
        )}
      </div>

      {/* Selected Checkmark — top right */}
      {isSelected && isAvailable && (
        <div className="package-check-pop absolute top-1 right-1 h-3.5 w-3.5 min-[360px]:h-4 min-[360px]:w-4 rounded-full bg-[#C084FC] flex items-center justify-center text-black shadow-xs">
          <Check className="h-2 w-2 min-[360px]:h-2.5 min-[360px]:w-2.5 text-black" strokeWidth={3} />
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
  gameSlug?: string;
  onSelect: (pkg: ClientPackage) => void;
}

export const PackageOptions = memo(function PackageOptions({ packages, selectedId, currencyName, gameSlug, onSelect }: PackageOptionsProps) {
  const isMlbbGame = gameSlug
    ? gameSlug.includes("mlbb") || gameSlug.includes("mobile-legends")
    : packages.some(p => p.customImage?.includes("mlbb-diamond") || p.id?.toLowerCase().includes("mlbb") || p.supplierProductCode?.toLowerCase().includes("mlbb"));
  const defaultDiamondImage = isMlbbGame ? "/images/mlbb-diamond.png" : DEFAULT_DIAMOND_IMAGE;

  const { validPackages, specialPackages, diamondPackages } = useMemo(() => {
    const validPackages = packages.filter(p => p.isAvailable && p.sellingPrice !== null && p.sellingPrice > 0);
    const specialPackages: ClientPackage[] = [];
    const diamondPackages: ClientPackage[] = [];
    for (const pkg of validPackages) {
      const visibleName = (pkg.diamondsOrPoints || pkg.name).trim();
      const allNames = `${visibleName} ${pkg.name}`;
      const packageName = /\b(pass|pack|weekly|monthly|twilight|starlight|member|subscription|bundle|membership|vip)\b/i.test(allNames);
      const diamondName = /\bdiamonds?\b/i.test(visibleName) || /^\d[\d,\s]*$/.test(visibleName);
      const special = packageName || (!diamondName && (pkg.group === "special" || pkg.category === "special"));
      (special ? specialPackages : diamondPackages).push(pkg);
    }
    return { validPackages, specialPackages, diamondPackages };
  }, [packages]);
  const renderPackageCard = (pkg: ClientPackage, isDiamond: boolean) => (
    <PackageCard key={pkg.id} pkg={pkg} isDiamond={isDiamond} isSelected={selectedId === pkg.id} defaultDiamondImage={defaultDiamondImage} onSelect={onSelect} />
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="topup-step-title">
          <span className="topup-step-number">
            2
          </span>
          <h2 className="text-sm sm:text-base font-bold text-[#F8F5FF]">
            Select Package<span className="sr-only"> for {currencyName}</span>
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#64748B]">
          {validPackages.length} options
        </span>
      </div>

      {validPackages.length > 0 ? (
        <div className="space-y-4 sm:space-y-5">
          {/* Package Section */}
          {specialPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#C084FC]">
                <Sparkles className="h-4 w-4 text-[#C084FC] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
                <span>Packages</span>
              </div>
              <div className="topup-package-grid">
                {specialPackages.map((pkg) => renderPackageCard(pkg, false))}
              </div>
            </div>
          )}

          {/* Diamond Section */}
          {diamondPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#C084FC] ${specialPackages.length > 0 ? "border-t border-[#2E1F45] pt-3.5" : ""}`}>
                <Zap className="h-4 w-4 text-[#C084FC] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
                <span>Diamonds</span>
              </div>
              <div className="topup-package-grid">
                {diamondPackages.map((pkg) => renderPackageCard(pkg, true))}
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
