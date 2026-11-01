export function SpiderWebSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true">
      {/* Radiating lines from corner (0,0) */}
      <path d="M0 0 L40 0" strokeOpacity="0.4" />
      <path d="M0 0 L36 16" strokeOpacity="0.4" />
      <path d="M0 0 L28 28" strokeOpacity="0.45" />
      <path d="M0 0 L16 36" strokeOpacity="0.4" />
      <path d="M0 0 L0 40" strokeOpacity="0.4" />
      {/* Curved web arcs */}
      <path d="M12 0 Q10 5 8 8 Q5 10 0 12" strokeOpacity="0.55" />
      <path d="M22 0 Q19 10 16 16 Q10 19 0 22" strokeOpacity="0.55" />
      <path d="M32 0 Q28 15 22 22 Q15 28 0 32" strokeOpacity="0.5" />
    </svg>
  );
}

export const HALLOWEEN_STICKERS = [
  { icon: "🎃", label: "Spooky" },
  { icon: "👻", label: "Boo!" },
  { icon: "🦇", label: "Night" },
  { icon: "🍬", label: "Treat" },
];

export function getHalloweenSticker(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return HALLOWEEN_STICKERS[Math.abs(hash) % HALLOWEEN_STICKERS.length];
}

