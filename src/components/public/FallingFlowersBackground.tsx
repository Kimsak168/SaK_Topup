import type { CSSProperties } from "react";

// Khmer Water Festival (ពិធីបុណ្យអុំទូក) Floating Particles
function LotusFlowerSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Lotus Lily Pad Base */}
      <ellipse cx="16" cy="24" rx="13" ry="4.5" fill="#15803D" opacity="0.8" />
      <ellipse cx="16" cy="23.5" rx="10" ry="3.5" fill="#22C55E" opacity="0.9" />

      {/* Outer Lotus Petals */}
      <path d="M16 23 C9 21 6 15 10 11 C12 16 14 20 16 23 Z" fill="#F472B6" />
      <path d="M16 23 C23 21 26 15 22 11 C20 16 18 20 16 23 Z" fill="#F472B6" />

      {/* Mid Petals */}
      <path d="M16 23 C11 18 9 11 13 7 C14.5 13 15.5 18 16 23 Z" fill="#FB7185" />
      <path d="M16 23 C21 18 23 11 19 7 C17.5 13 16.5 18 16 23 Z" fill="#FB7185" />

      {/* Center Golden/Blush Petal & Core */}
      <path d="M16 23 C14 17 14 7 16 4 C18 7 18 17 16 23 Z" fill="#FFF1F2" />
      <circle cx="16" cy="15" r="2.2" fill="#FACC15" />
    </svg>
  );
}

function FloatingLanternSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Floating Prateep (Illuminated Boat Base) */}
      <path
        d="M4 22 C9 26 23 26 28 22 C24 24 8 24 4 22 Z"
        fill="#0284C7"
        opacity="0.85"
      />
      <path
        d="M6 21 C10 24 22 24 26 21 L23 24 L9 24 Z"
        fill="#F59E0B"
      />

      {/* Ornate Lantern Core */}
      <rect x="11" y="12" width="10" height="9" rx="2" fill="#FEF08A" stroke="#F59E0B" strokeWidth="1" />
      {/* Candle Flame Glow */}
      <circle cx="16" cy="9" r="4.5" fill="#F59E0B" opacity="0.35" />
      <path
        d="M16 4 C14.5 7 14.5 9 16 11 C17.5 9 17.5 7 16 4 Z"
        fill="#EF4444"
      />
      <circle cx="16" cy="9" r="1.5" fill="#FEF08A" />

      {/* Incense sticks */}
      <line x1="14" y1="12" x2="13" y2="7" stroke="#EA580C" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="18" y1="12" x2="19" y2="7" stroke="#EA580C" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

function DragonBoatSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Touk Ngor Racing Boat Hull */}
      <path
        d="M2 18 C8 15 24 15 30 14 C27 20 5 21 2 18 Z"
        fill="#EA580C"
      />
      <path
        d="M4 17.5 C10 16 23 16 28 15"
        stroke="#FDE047"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Dragon Head Prow (Ornate Golden Front) */}
      <path
        d="M29 14 C31 11 31 8 29 6 C28 8 27 11 28 14 Z"
        fill="#F59E0B"
      />
      <circle cx="29" cy="8" r="0.8" fill="#EF4444" />

      {/* Rower Paddles in sync */}
      <line x1="10" y1="18" x2="8" y2="23" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="15" y1="18" x2="13" y2="23" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="20" y1="18" x2="18" y2="23" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function FullMoonSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Full Moon Glow */}
      <circle cx="16" cy="16" r="13" fill="#FACC15" opacity="0.25" />
      <circle cx="16" cy="16" r="10" fill="#FEF08A" stroke="#FDE047" strokeWidth="0.8" />
      {/* Craters / Traditional Moon Pattern */}
      <circle cx="13" cy="14" r="2.2" fill="#FDE047" opacity="0.6" />
      <circle cx="18" cy="13" r="1.5" fill="#FDE047" opacity="0.5" />
      <circle cx="16" cy="19" r="1.8" fill="#FDE047" opacity="0.55" />
      {/* Sparkles */}
      <path d="M7 8 L8 7 L7 6 L6 7 Z" fill="#FFFFFF" />
      <path d="M25 24 L26 23 L25 22 L24 23 Z" fill="#FFFFFF" />
    </svg>
  );
}

interface WaterFestivalParticle {
  type: "lotus" | "lantern" | "boat" | "moon";
  left: string;
  size: number;
  mobileSize: number;
  duration: number;
  delay: number;
  drift: number;
  rotation: number;
  opacity: number;
  visibility: "all" | "tablet" | "desktop";
}

// Negative delays distribute floating Water Festival particles naturally across the screen on load.
const WATER_FESTIVAL_PARTICLES: WaterFestivalParticle[] = [
  { type: "lotus", left: "clamp(8px, 2.2vw, 28px)", size: 30, mobileSize: 20, duration: 11, delay: -2, drift: 20, rotation: 160, opacity: 0.65, visibility: "all" },
  { type: "lantern", left: "calc(100% - clamp(28px, 3vw, 48px))", size: 30, mobileSize: 20, duration: 12.5, delay: -5, drift: -22, rotation: -90, opacity: 0.68, visibility: "all" },
  { type: "boat", left: "16%", size: 28, mobileSize: 19, duration: 10, delay: -7.5, drift: 28, rotation: 120, opacity: 0.6, visibility: "all" },
  { type: "moon", left: "84%", size: 26, mobileSize: 18, duration: 13, delay: -3.5, drift: -20, rotation: -180, opacity: 0.62, visibility: "all" },
  { type: "lotus", left: "46%", size: 28, mobileSize: 19, duration: 14, delay: -9, drift: 24, rotation: 180, opacity: 0.62, visibility: "all" },
  { type: "lantern", left: "11%", size: 28, mobileSize: 19, duration: 12, delay: -6, drift: 18, rotation: 140, opacity: 0.66, visibility: "tablet" },
  { type: "boat", left: "89%", size: 26, mobileSize: 18, duration: 11.5, delay: -10, drift: -24, rotation: -140, opacity: 0.58, visibility: "tablet" },
  { type: "moon", left: "34%", size: 27, mobileSize: 18, duration: 13.5, delay: -4, drift: 26, rotation: -160, opacity: 0.6, visibility: "tablet" },
  { type: "lotus", left: "4%", size: 29, mobileSize: 20, duration: 10.5, delay: -8, drift: 16, rotation: 150, opacity: 0.64, visibility: "desktop" },
  { type: "lantern", left: "95%", size: 29, mobileSize: 20, duration: 11, delay: -1.5, drift: -16, rotation: 160, opacity: 0.68, visibility: "desktop" },
  { type: "boat", left: "64%", size: 27, mobileSize: 18, duration: 14.5, delay: -11, drift: 30, rotation: 190, opacity: 0.55, visibility: "desktop" },
  { type: "moon", left: "73%", size: 28, mobileSize: 19, duration: 12, delay: -6.5, drift: -24, rotation: -150, opacity: 0.6, visibility: "desktop" },
];

type ParticleStyle = CSSProperties & {
  [property: `--flower-${string}`]: string | number;
};

export function FallingFlowersBackground({ debug = false }: { debug?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="falling-flowers-background fixed inset-0 pointer-events-none overflow-hidden z-[1] select-none"
      style={{
        zIndex: 1,
        ...(debug ? { outline: "2px dashed rgba(2, 132, 199, 0.35)", outlineOffset: "-2px" } : {}),
      }}
    >
      {WATER_FESTIVAL_PARTICLES.map((particle, index) => {
        const style: ParticleStyle = {
          left: particle.left,
          "--flower-size": `${particle.size}px`,
          "--flower-mobile-size": `${particle.mobileSize}px`,
          "--flower-dur": `${particle.duration}s`,
          "--flower-delay": `${particle.delay}s`,
          "--flower-drift": `${particle.drift}px`,
          "--flower-rot": `${particle.rotation}deg`,
          "--flower-op": particle.opacity,
        };

        const visibilityClass =
          particle.visibility === "desktop"
            ? "hidden lg:block"
            : particle.visibility === "tablet"
              ? "hidden md:block"
              : "block";

        const shadowClass =
          particle.type === "lotus"
            ? "drop-shadow-[0_2px_8px_rgba(244,114,182,0.55)]"
            : particle.type === "lantern"
              ? "drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]"
              : particle.type === "boat"
                ? "drop-shadow-[0_2px_8px_rgba(2,132,199,0.5)]"
                : "drop-shadow-[0_2px_10px_rgba(254,240,138,0.65)]";

        return (
          <span
            key={index}
            className={`dreamy-falling-flower romdul-falling-flower ${visibilityClass}`}
            style={style}
          >
            <span className={`block h-full w-full ${shadowClass}`}>
              {particle.type === "lotus" ? (
                <LotusFlowerSvg className="h-full w-full" />
              ) : particle.type === "lantern" ? (
                <FloatingLanternSvg className="h-full w-full" />
              ) : particle.type === "boat" ? (
                <DragonBoatSvg className="h-full w-full" />
              ) : (
                <FullMoonSvg className="h-full w-full" />
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Re-exports for backwards compatibility
export { FallingFlowersBackground as RomdulFlowers };
export { FallingFlowersBackground as HalloweenBackground };
export { FallingFlowersBackground as WaterFestivalBackground };
