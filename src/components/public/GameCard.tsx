"use client";

import { memo, useState } from "react";
import { StorefrontLink } from "./StorefrontLink";
import Image from "next/image";
import { toast } from "sonner";
import { ClientGame } from "@/types/game";

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
      className={`game-card group relative flex aspect-square w-full min-w-0 flex-col overflow-hidden rounded-[14px] p-[2px] bg-rose-500/10 outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:shadow-[0_8px_24px_-4px_rgba(244,63,94,0.35)] motion-reduce:transition-none sm:rounded-[16px] ${isSelected ? "game-card-selected" : ""}`}
    >
      {/* Subtle base border ring */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] border border-rose-500/20"
      />

      {/* Running Light Border Beam (ភ្លើងរត់) */}
      <span
        aria-hidden="true"
        className="card-running-light-beam pointer-events-none absolute -inset-[150%] m-auto aspect-square z-0"
      />

      {/* Inner Card Container */}
      <div className="game-card-inner relative z-10 flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-slate-900 sm:rounded-[14px]">
        <div className="relative h-full w-full overflow-hidden bg-slate-900">
          {!isLoaded && (
            <div className="absolute inset-0 z-0 animate-pulse bg-gradient-to-tr from-slate-800 via-slate-700 to-slate-800" />
          )}
          <Image
            src={imgSrc}
            alt={game.name}
            fill
            sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 17vw, 240px"
            quality={80}
            loading="lazy"
            className="game-card-image relative z-10 object-cover object-center transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(true);
              if (imgSrc === FALLBACK_IMAGE) return;
              failedImageSources.add(imageSource);
              setFailedImage(imageSource);
            }}
          />

          {/* Floating Dark Gradient + Frosted Glass Blur Overlay for Game Title */}
          <div className={`game-card-title game-card-overlay-title pointer-events-none absolute inset-x-0 bottom-0 z-20 flex min-h-[36px] min-[380px]:min-h-[40px] sm:min-h-[46px] ${isComingSoon ? "flex-col gap-0.5" : "flex-col"} items-center justify-end px-1.5 pt-6 pb-1.5 min-[380px]:px-2 min-[380px]:pb-2 sm:px-2.5 sm:pb-2.5`}>
            <h3 className="line-clamp-2 w-full min-w-0 text-center text-[10.5px] leading-[13px] min-[380px]:text-[11.5px] min-[380px]:leading-[14.5px] sm:text-[13px] sm:leading-[16.5px] font-bold tracking-[-0.01em] wrap-anywhere text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {game.name}
            </h3>
            {isComingSoon && (
              <span className="text-[8px] min-[380px]:text-[9px] font-extrabold uppercase tracking-wider text-rose-400 drop-shadow-sm leading-none">
                Coming Soon
              </span>
            )}
          </div>
        </div>
      </div>
    </StorefrontLink>
  );
});
