"use client";

import { memo, useState } from "react";
import { StorefrontLink } from "./StorefrontLink";
import Image from "next/image";
import { toast } from "sonner";
import { ClientGame } from "@/types/game";
import { SpiderWebSvg, getHalloweenSticker } from "./HalloweenAccents";

interface GameCardProps {
  game: ClientGame;
  onSelect?: (game: ClientGame) => void;
  isSelected?: boolean;
}

const FALLBACK_IMAGE = "/images/freefire.webp";
const failedImageSources = new Set<string>();

function getImageSource(image: string): string {
  const source = image?.trim();
  if (!source) return FALLBACK_IMAGE;
  if (source.startsWith("/") && !source.startsWith("//")) return source;

  try {
    const url = new URL(source);
    if (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) {
      return source;
    }
  } catch {
    // Missing or malformed artwork uses the existing local fallback.
  }
  return FALLBACK_IMAGE;
}

export const GameCard = memo(function GameCard({ game, onSelect, isSelected = false }: GameCardProps) {
  const href = game.path || `/games/${game.supplier}/${game.code || game.slug}`;
  const imageSource = getImageSource(game.image);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgSrc = failedImage === imageSource || failedImageSources.has(imageSource)
    ? FALLBACK_IMAGE
    : imageSource;
  const sticker = getHalloweenSticker(game.id || game.slug || game.name);
  const isComingSoon = game.badge?.trim().toUpperCase().replace(/[\s-]+/g, "_") === "COMING_SOON";

  return (
    <StorefrontLink
      href={href}
      aria-label={isComingSoon ? `${game.name} (Coming Soon)` : `Top up ${game.name}`}
      title={isComingSoon ? `${game.name} — Coming Soon` : game.name}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (isComingSoon) {
          event.preventDefault();
          toast.info(`${game.name} — Coming Soon`, {
            id: "game-selection",
            description: "Not available for purchase yet.",
          });
          return;
        }
        if (onSelect) {
          event.preventDefault();
          onSelect(game);
        }
        toast.success("Game selected", { id: "game-selection", description: game.name });
      }}
      onKeyDown={(event) => {
        if (event.key === " " && !event.repeat) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      aria-current={onSelect && isSelected ? "true" : undefined}
      className={`game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-[#FDF2F8] outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:shadow-[0_8px_22px_-4px_rgba(249,115,22,0.3)] motion-reduce:transition-none sm:rounded-[16px] ${isSelected ? "game-card-selected" : ""}`}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#F1F5F9]">
        {/* Water Festival corner ripple */}
        <SpiderWebSvg className="pointer-events-none absolute -top-0.5 -left-0.5 size-7 sm:size-9 text-white/60 z-20 drop-shadow-sm transition-opacity duration-300 group-hover:text-sky-200/90" />

        {isComingSoon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex items-center rounded-full bg-[#B54779] px-2 py-0.5 border border-pink-200/75 shadow-md backdrop-blur-md text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-white"
          >
            Coming Soon
          </span>
        ) : (
          /* Water Festival festive badge sticker */
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 border border-sky-400/40 shadow-md shadow-sky-950/30 backdrop-blur-md transition-all duration-200 group-hover:scale-105 group-hover:border-sky-300 group-hover:bg-black/85"
          >
            <span className="text-[11px] sm:text-xs leading-none select-none">{sticker.icon}</span>
            <span className="hidden min-[420px]:inline text-[9px] font-extrabold uppercase tracking-wider text-sky-200">
              {sticker.label}
            </span>
          </span>
        )}

        {!isLoaded && (
          <div className="absolute inset-0 z-0 animate-pulse bg-gradient-to-tr from-slate-100 via-emerald-50/40 to-slate-100" />
        )}
        <Image
          src={imgSrc}
          alt={game.name}
          fill
          sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 17vw, 240px"
          quality={100}
          loading="lazy"
          className="game-card-image relative z-10 object-cover object-center motion-reduce:transition-none"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setIsLoaded(true);
            if (imgSrc === FALLBACK_IMAGE) return;
            failedImageSources.add(imageSource);
            setFailedImage(imageSource);
          }}
        />
      </div>

      <div className={`game-card-title flex h-12 min-w-0 shrink-0 ${isComingSoon ? "flex-col gap-0.5" : ""} items-center justify-center bg-[#FDF2F8] px-2 py-1.5 sm:h-14 sm:px-3`}>
        <h3 className="line-clamp-2 w-full min-w-0 text-center text-[12px] leading-4 font-semibold wrap-anywhere text-[#172033] sm:text-[14px] sm:leading-5">
          {game.name}
        </h3>
        {isComingSoon && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B54779] leading-none">
            Coming Soon
          </span>
        )}
      </div>
    </StorefrontLink>
  );
});
