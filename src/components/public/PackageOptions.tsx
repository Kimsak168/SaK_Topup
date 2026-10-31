"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { Ban, Check, Package as PackageIcon, Sparkles, Zap } from "lucide-react";
import type { ClientPackage } from "@/types/game";

const DEFAULT_DIAMOND_IMAGE = "/images/diamond-crystals.png";

function removeWhiteBackground(image: HTMLImageElement): string | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || width * height > 1_000_000) return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height);
    const { data } = pixels;
    const pixelCount = width * height;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;

    const isWhiteBackground = (pixel: number) => {
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const minimum = Math.min(red, green, blue);
      const maximum = Math.max(red, green, blue);
      return minimum >= 224 && maximum - minimum <= 36;
    };

    const visit = (pixel: number) => {
      if (visited[pixel]) return;
      visited[pixel] = 1;
      if (isWhiteBackground(pixel)) queue[tail++] = pixel;
    };

    for (let x = 0; x < width; x++) {
      visit(x);
      visit((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      visit(y * width);
      visit(y * width + width - 1);
    }

    if (tail === 0) return null;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      if (x > 0) visit(pixel - 1);
      if (x + 1 < width) visit(pixel + 1);
      if (pixel >= width) visit(pixel - width);
      if (pixel + width < pixelCount) visit(pixel + width);
    }

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      if (!visited[pixel] || !isWhiteBackground(pixel)) continue;

      const offset = pixel * 4;
      const minimum = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const alpha = 1 - minimum / 255;
      if (alpha <= 0) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
      }

      // Remove the white matte from edge pixels so it does not leave a pale halo.
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.max(
          0,
          Math.min(255, Math.round((data[offset + channel] - 255 * (1 - alpha)) / alpha))
        );
      }
      data[offset + 3] = Math.round(alpha * 255);
    }

    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

interface PackageCardProps {
  pkg: ClientPackage;
  isDiamond: boolean;
  isSelected: boolean;
  loadImageEagerly: boolean;
  defaultDiamondImage?: string;
  onSelect: (pkg: ClientPackage) => void;
}

const PackageCard = memo(function PackageCard({ pkg, isDiamond, isSelected, loadImageEagerly, defaultDiamondImage = DEFAULT_DIAMOND_IMAGE, onSelect }: PackageCardProps) {
  const isAvailable = pkg.isAvailable && pkg.sellingPrice !== null && pkg.sellingPrice > 0;
  const discountPercent = isAvailable && pkg.originalPrice !== null && pkg.originalPrice > (pkg.sellingPrice ?? 0)
    ? Math.round(((pkg.originalPrice - (pkg.sellingPrice ?? 0)) / pkg.originalPrice) * 100)
    : 0;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
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
            src={processedImage || imageSrc}
            alt=""
            fill
            sizes="96px"
            quality={80}
            loading={loadImageEagerly ? "eager" : "lazy"}
            className="package-option-image object-contain"
            onLoad={(event) => {
              if (processedImage) return;

              const image = event.currentTarget;
              const processImage = () => {
                const transparentImage = removeWhiteBackground(image);
                if (transparentImage) setProcessedImage(transparentImage);
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
      <div className="package-option-info min-w-0 flex-1 flex flex-col justify-center text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="package-option-title min-w-0 flex-1 line-clamp-1 font-bold leading-tight">
          {(() => {
            const raw = (pkg.diamondsOrPoints || pkg.name).trim();
            const levelUp = raw.replace(/Level\s*Up\s*(?:Package|Pass)?\s*[-–—:]*\s*(?:Level|Lv\.?)?\s*(\d+)/i, "Level Up $1");
            return isDiamond && !/diamonds?/i.test(levelUp) ? `${levelUp} Diamonds` : levelUp;
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

export const PackageOptions = memo(function PackageOptions({ packages, selectedId, currencyName, gameSlug, title = "Select Package", stepNumber = 2, onSelect }: PackageOptionsProps) {
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
  const eagerSpecialCount = Math.min(specialPackages.length, 3);
  const renderPackageCard = (pkg: ClientPackage, isDiamond: boolean, loadImageEagerly: boolean) => (
    <PackageCard key={pkg.id} pkg={pkg} isDiamond={isDiamond} isSelected={selectedId === pkg.id} loadImageEagerly={loadImageEagerly} defaultDiamondImage={defaultDiamondImage} onSelect={onSelect} />
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

          {/* Diamond Section */}
          {diamondPackages.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#C084FC] ${specialPackages.length > 0 ? "border-t border-[#2E1F45] pt-3.5" : ""}`}>
                <Zap className="h-4 w-4 text-[#C084FC] drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
                <span>Diamonds</span>
              </div>
              <div className="topup-package-grid">
                {diamondPackages.map((pkg, index) => renderPackageCard(pkg, true, index < 3 - eagerSpecialCount))}
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
