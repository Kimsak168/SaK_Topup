"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { Ban, Check, Coins, Package as PackageIcon, Sparkles, Zap } from "lucide-react";
import type { ClientPackage } from "@/types/game";

const DEFAULT_DIAMOND_IMAGE = "/images/diamond-crystals.webp";

interface PackageCardProps {
  pkg: ClientPackage;
  isCurrency: boolean;
  gameKind: "pubg" | "hok" | "mlbb" | "freefire" | "other";
  currencyName?: string;
  isSelected: boolean;
  loadImageEagerly: boolean;
  defaultCurrencyImage?: string;
  artworkCache: Map<string, string | null>;
  onSelect: (pkg: ClientPackage) => void;
}

const PackageCard = memo(function PackageCard({
  pkg,
  isCurrency,
  gameKind,
  currencyName,
  isSelected,
  loadImageEagerly,
  defaultCurrencyImage,
  artworkCache,
  onSelect,
}: PackageCardProps) {
  const isAvailable = pkg.isAvailable && pkg.sellingPrice !== null && pkg.sellingPrice > 0;
  const discountPercent = isAvailable && pkg.originalPrice !== null && pkg.originalPrice > (pkg.sellingPrice ?? 0)
    ? Math.round(((pkg.originalPrice - (pkg.sellingPrice ?? 0)) / pkg.originalPrice) * 100)
    : 0;
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [processedImage, setProcessedImage] = useState<{ source: string; url: string } | null>(null);
  const customImageSrc = pkg.customImage?.trim();
  const currencyImage = defaultCurrencyImage;
  const imageSrc = customImageSrc && !failedImages.has(customImageSrc)
    ? customImageSrc
    : isCurrency && currencyImage && !failedImages.has(currencyImage)
    ? currencyImage
    : null;
  const processedImageUrl = processedImage?.source === imageSrc ? processedImage.url : null;

  return (
    <button
      key={pkg.id}
      type="button"
      title={pkg.name}
      aria-pressed={isSelected}
      disabled={!isAvailable}
      onClick={() => {
        if (isAvailable) onSelect(pkg);
      }}
      className={`package-option group relative flex min-h-[50px] min-[360px]:min-h-[54px] sm:min-h-[58px] w-full flex-row items-center gap-2 sm:gap-2.5 rounded-xl border px-2 py-1 min-[360px]:px-2.5 text-left cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-[#C084FC] focus-visible:outline-offset-2 ${
        !isAvailable
          ? "opacity-50 bg-[#0D0914]/40 border-[#2E1F45]/60 cursor-not-allowed"
          : isSelected
          ? "bg-[#180E2B] border-[#C084FC] ring-1.5 ring-[#C084FC]/50 shadow-[0_0_18px_rgba(192,132,252,0.22)]"
          : "bg-[#0D0914] border-[#2E1F45] hover:border-[#C084FC]/60 hover:bg-[#140D24] hover:shadow-[0_4px_14px_rgba(192,132,252,0.1)] active:scale-[0.985]"
      }`}
    >
      <div className="package-option-artwork relative shrink-0 flex items-center justify-center transition-transform group-hover:scale-[1.03]">
        {imageSrc ? (
          <Image
            src={processedImageUrl || imageSrc}
            alt=""
            fill
            sizes="96px"
            quality={80}
            loading={loadImageEagerly ? "eager" : "lazy"}
            className="package-option-image object-contain"
            onLoad={(event) => {
              if (processedImageUrl) return;

              const image = event.currentTarget;
              const processImage = async () => {
                try {
                  const { removeWhiteBackground } = await import("@/lib/packageArtwork");
                  const transparentImage = removeWhiteBackground(image, artworkCache);
                  if (transparentImage) setProcessedImage({ source: imageSrc, url: transparentImage });
                } catch {
                  // Keep the original artwork if the optional processor cannot load.
                }
              };

              const idleWindow = window as Window & {
                requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
              };
              if (idleWindow.requestIdleCallback) {
                idleWindow.requestIdleCallback(processImage, { timeout: 1500 });
              } else {
                window.setTimeout(processImage, 0);
              }
            }}
            onError={() => {
              setProcessedImage(null);
              // Remember both failures so custom and fallback artwork cannot
              // alternate forever, downloading and rerendering on each error.
              setFailedImages(previous => new Set(previous).add(imageSrc));
            }}
          />
        ) : isCurrency ? (
          gameKind === "pubg" ? (
            <div className="flex h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-[10px] font-black text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.45)] border border-amber-200 select-none">
              UC
            </div>
          ) : gameKind === "hok" ? (
            <Coins className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 text-amber-400 stroke-[2] drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          ) : (
            <Zap className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 text-[#C084FC] stroke-[2] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
          )
        ) : (
          <PackageIcon className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8 text-[#C084FC]/85 group-hover:text-[#C084FC] transition-colors" />
        )}
      </div>

      {/* Info — on right (compact & clean) */}
      <div className="package-option-info min-w-0 flex-1 flex flex-col justify-center text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="package-option-title min-w-0 flex-1 line-clamp-1 font-bold leading-tight">
          {(() => {
            const raw = (pkg.name || pkg.diamondsOrPoints || "").trim();
            const levelUp = raw.replace(/Level\s*Up\s*(?:Package|Pass)?\s*[-–—:]*\s*(?:Level|Lv\.?)?\s*(\d+)/i, "Level Up $1");
            if (!isCurrency) return levelUp;
            if (gameKind === "pubg" || /uc/i.test(currencyName || "")) {
              return !/\buc\b/i.test(levelUp) ? `${levelUp} UC` : levelUp;
            }
            if (gameKind === "hok" || /token/i.test(currencyName || "")) {
              return !/tokens?/i.test(levelUp) ? `${levelUp} Tokens` : levelUp;
            }
            if (/diamonds?/i.test(currencyName || "")) {
              return !/diamonds?/i.test(levelUp) ? `${levelUp} Diamonds` : levelUp;
            }
            return /^\d[\d,\s]*$/.test(levelUp) && currencyName ? `${levelUp} ${currencyName}` : levelUp;
          })()}
          </div>
          {pkg.badge && (
            <span className="package-option-badge shrink-0 rounded-full px-2 py-1 font-black uppercase leading-none">
              {pkg.badge}
            </span>
          )}
        </div>
        {pkg.bonus ? (
          <div className="package-option-bonus mt-1 truncate font-semibold leading-none">
            {pkg.bonus}
          </div>
        ) : null}

        {isAvailable && pkg.sellingPrice !== null ? (
          <div className="package-option-prices mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-none">
            <span className="package-option-selling-price font-black tracking-tight">
              ${pkg.sellingPrice.toFixed(2)}
            </span>
            {pkg.originalPrice && pkg.originalPrice > pkg.sellingPrice && (
              <span className="package-option-original-price font-medium line-through">
                ${pkg.originalPrice.toFixed(2)}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="package-option-discount rounded px-1.5 py-1 font-black leading-none">
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
  title?: string;
  stepNumber?: number | null;
  onSelect: (pkg: ClientPackage) => void;
}

export const PackageOptions = memo(function PackageOptions({
  packages,
  selectedId,
  currencyName,
  gameSlug,
  title = "Select Package",
  stepNumber = 2,
  onSelect,
}: PackageOptionsProps) {
  const artworkCache = useMemo(() => new Map<string, string | null>(), [packages]);
  const isPubg = Boolean((gameSlug && /pubg/i.test(gameSlug)) || /uc/i.test(currencyName));
  const isHok = Boolean((gameSlug && /hok|honor/i.test(gameSlug)) || /token/i.test(currencyName));
  const isMlbbGame = Boolean(
    gameSlug
      ? gameSlug.includes("mlbb") || gameSlug.includes("mobile-legends")
      : packages.some(p => p.customImage?.includes("mlbb-diamond") || p.id?.toLowerCase().includes("mlbb") || p.supplierProductCode?.toLowerCase().includes("mlbb"))
  );
  const isFreeFire = Boolean(gameSlug && /free-?fire/i.test(gameSlug));

  const gameKind: "pubg" | "hok" | "mlbb" | "freefire" | "other" = isPubg
    ? "pubg"
    : isHok
    ? "hok"
    : isMlbbGame
    ? "mlbb"
    : isFreeFire
    ? "freefire"
    : "other";

  const defaultCurrencyImage = isMlbbGame
    ? "/images/mlbb-diamond.webp"
    : isPubg || isHok
    ? undefined
    : DEFAULT_DIAMOND_IMAGE;

  const currencySectionTitle = isPubg
    ? "UC"
    : isHok
    ? "Tokens"
    : isFreeFire || isMlbbGame || /diamonds?/i.test(currencyName)
    ? "Diamonds"
    : currencyName || "Currency";

  const { validPackages, specialPackages, currencyPackages } = useMemo(() => {
    const validPackages = packages.filter(p => p.isAvailable && p.sellingPrice !== null && p.sellingPrice > 0);
    const specialPackages: ClientPackage[] = [];
    const currencyPackages: ClientPackage[] = [];

    const isSpecialPackage = (pkg: ClientPackage): boolean => {
      if (pkg.group === "special" || pkg.category === "special") return true;

      const visibleName = (pkg.name || pkg.diamondsOrPoints || "").trim();
      const allNames = `${visibleName} ${pkg.name || ""}`;

      const hasSpecialKeywords = /\b(pass|pack|weekly|monthly|twilight|starlight|member|subscription|bundle|membership|vip|prime|deal|emblem|materials?|first purchase|card|bag|rebate|coins?|box|lucky|shadow|zilong|skin|access|level\s*up|bonuses)\b/i.test(allNames);
      if (hasSpecialKeywords) return true;

      if (isPubg) {
        // Pure UC packages match "60 UC", "325 UC", "1800 UC (discounted)", etc.
        const isUc = /\b\d+.*uc\b/i.test(visibleName);
        return !isUc;
      }

      if (isHok) {
        // Pure Token packages match "16 Tokens", "80 Tokens", etc.
        const isToken = /\b\d+.*tokens?\b/i.test(visibleName);
        return !isToken;
      }

      const diamondName = /\bdiamonds?\b/i.test(visibleName) || /^\d[\d,\s]*$/.test(visibleName);
      return !diamondName;
    };

    for (const pkg of validPackages) {
      if (isSpecialPackage(pkg)) {
        specialPackages.push(pkg);
      } else {
        currencyPackages.push(pkg);
      }
    }

    return { validPackages, specialPackages, currencyPackages };
  }, [packages, isPubg, isHok]);

  const eagerSpecialCount = Math.min(specialPackages.length, 3);
  const renderPackageCard = (pkg: ClientPackage, isCurrency: boolean, loadImageEagerly: boolean) => (
    <PackageCard
      key={pkg.id}
      pkg={pkg}
      isCurrency={isCurrency}
      gameKind={gameKind}
      currencyName={currencyName}
      isSelected={selectedId === pkg.id}
      loadImageEagerly={loadImageEagerly}
      defaultCurrencyImage={defaultCurrencyImage}
      artworkCache={artworkCache}
      onSelect={onSelect}
    />
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="topup-step-title">
          {stepNumber !== null ? <span className="topup-step-number">{stepNumber}</span> : null}
          <h2 className="text-sm sm:text-base font-bold text-[#F8F5FF]">
            {title}<span className="sr-only"> for {currencyName}</span>
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
                {specialPackages.map((pkg, index) => renderPackageCard(pkg, false, index < 3))}
              </div>
            </div>
          )}

          {/* Currency Section (Diamonds / UC / Tokens) */}
          {currencyPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#C084FC] ${specialPackages.length > 0 ? "border-t border-[#2E1F45] pt-3.5" : ""}`}>
                {isPubg || isHok ? (
                  <Coins className="h-4 w-4 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                ) : (
                  <Zap className="h-4 w-4 text-[#C084FC] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
                )}
                <span>{currencySectionTitle}</span>
              </div>
              <div className="topup-package-grid">
                {currencyPackages.map((pkg, index) => renderPackageCard(pkg, true, index < 3 - eagerSpecialCount))}
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
