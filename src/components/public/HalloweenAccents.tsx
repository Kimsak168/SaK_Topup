// Khmer Water Festival (ពិធីបុណ្យអុំទូក - Bon Om Touk) Decorative Accents
export function WaterFestivalCornerSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true">
      {/* Radiating water ripple rays from corner (0,0) */}
      <path d="M0 0 L44 0" strokeOpacity="0.45" />
      <path d="M0 0 L40 16" strokeOpacity="0.4" />
      <path d="M0 0 L31 31" strokeOpacity="0.5" />
      <path d="M0 0 L16 40" strokeOpacity="0.4" />
      <path d="M0 0 L0 44" strokeOpacity="0.45" />

      {/* Concentric water ripple waves */}
      <path d="M12 0 Q10 6 7 7 Q6 10 0 12" strokeOpacity="0.6" />
      <path d="M22 0 Q18 11 14 14 Q11 18 0 22" strokeOpacity="0.65" />
      <path d="M34 0 Q28 17 21 21 Q17 28 0 34" strokeOpacity="0.55" />

      {/* Traditional Khmer lotus petal ornament curves */}
      <path d="M8 2 C12 6 12 10 6 12" strokeOpacity="0.5" />
      <path d="M16 4 C22 10 20 16 10 18" strokeOpacity="0.5" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}

// Backward-compatibility alias so existing components render the Water Festival corner ripple seamlessly
export const SpiderWebSvg = WaterFestivalCornerSvg;

export const WATER_FESTIVAL_STICKERS = [
  { icon: "🚣‍♂️", label: "អុំទូក" },
  { icon: "🪷", label: "បុណ្យអុំទូក" },
  { icon: "🏮", label: "ប្រទីប" },
  { icon: "🌕", label: "សំពះព្រះខែ" },
  { icon: "🌊", label: "Water Fest" },
];

export const HALLOWEEN_STICKERS = WATER_FESTIVAL_STICKERS;

export function getWaterFestivalSticker(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return WATER_FESTIVAL_STICKERS[Math.abs(hash) % WATER_FESTIVAL_STICKERS.length];
}

export const getHalloweenSticker = getWaterFestivalSticker;
