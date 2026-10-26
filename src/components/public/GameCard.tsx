"use client";

import { memo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ClientGame } from "@/types/game";

interface GameCardProps {
  game: ClientGame;
}

const FALLBACK_IMAGE = "/images/freefire.jpg";
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

export const GameCard = memo(function GameCard({ game }: GameCardProps) {
  const href = game.path || `/games/${game.supplier}/${game.code || game.slug}`;
  const imageSource = getImageSource(game.image);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgSrc = failedImage === imageSource || failedImageSources.has(imageSource)
    ? FALLBACK_IMAGE
    : imageSource;

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`Top up ${game.name}`}
      title={game.name}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        toast.success("Game selected", { id: "game-selection", description: game.name });
      }}
      onKeyDown={(event) => {
        if (event.key === " " && !event.repeat) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      className="game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:-translate-y-[2px] motion-reduce:transition-none sm:rounded-[16px]"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#F1F5F9]">
        {/* Shimmer skeleton while image loads */}
        {!isLoaded && (
          <div className="absolute inset-0 z-0 animate-pulse bg-gradient-to-tr from-slate-100 via-emerald-50/40 to-slate-100" />
        )}
        <Image
          src={imgSrc}
          alt={game.name}
          fill
          sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 20vw, 280px"
          loading="lazy"
          className={`game-card-image relative z-10 object-cover object-center transition-[scale,opacity] duration-300 ease-out motion-safe:pointer-fine:group-hover:scale-[1.02] motion-reduce:transition-none ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setIsLoaded(true);
            if (imgSrc === FALLBACK_IMAGE) return;
            failedImageSources.add(imageSource);
            setFailedImage(imageSource);
          }}
        />
      </div>

      <div className="game-card-title flex h-12 min-w-0 shrink-0 items-center justify-center bg-white px-2 py-1.5 sm:h-14 sm:px-3">
        <h3 className="line-clamp-2 w-full min-w-0 text-center text-[12px] leading-4 font-semibold wrap-anywhere text-[#172033] sm:text-[14px] sm:leading-5">
          {game.name}
        </h3>
      </div>
    </Link>
  );
});
