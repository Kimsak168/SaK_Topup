import type { CSSProperties } from "react";

function PastelBlossomSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <g fill="currentColor" stroke="#DB2777" strokeWidth="0.55" strokeOpacity="0.4">
        <circle cx="16" cy="9.5" r="5.5" />
        <circle cx="22.2" cy="14" r="5.5" />
        <circle cx="19.8" cy="21.3" r="5.5" />
        <circle cx="12.2" cy="21.3" r="5.5" />
        <circle cx="9.8" cy="14" r="5.5" />
        <circle cx="16" cy="16" r="4.5" />
      </g>
      <circle cx="16" cy="16" r="2.8" fill="#FDE68A" opacity={0.95} />
      <circle cx="16" cy="16" r="1.4" fill="#F59E0B" />
    </svg>
  );
}

function RomdulBlossomSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <g fill="currentColor" stroke="#D97706" strokeWidth="0.65" strokeOpacity="0.45">
        <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        <g transform="rotate(120 16 16)">
          <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        </g>
        <g transform="rotate(240 16 16)">
          <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        </g>
      </g>
      <g fill="#FDE68A" opacity={0.92} transform="rotate(60 16 16)">
        <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        <g transform="rotate(120 16 16)">
          <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        </g>
        <g transform="rotate(240 16 16)">
          <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        </g>
      </g>
      <circle cx="16" cy="16" r="2.2" fill="#F59E0B" opacity={0.95} />
      <circle cx="16" cy="16" r="1.1" fill="#D97706" />
    </svg>
  );
}

function PastelPetalSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2 C8 6.5 5.5 12 8 17 C10.5 22 15 21.5 17.5 17 C20 12 16.5 6.5 12 2 Z"
        fill="currentColor"
      />
      <path
        d="M12 5 C12 10 12.5 14 13 18"
        stroke="#E11D48"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity={0.4}
      />
    </svg>
  );
}

interface FlowerParticle {
  type: "blossom" | "romdul" | "petal";
  left: string;
  size: number;
  mobileSize: number;
  duration: number;
  delay: number;
  drift: number;
  rotation: number;
  opacity: number;
  color: string;
  visibility: "all" | "tablet" | "desktop";
}

// Negative delays distribute the falling flowers across the screen immediately.
const FLOWER_PARTICLES: FlowerParticle[] = [
  { type: "romdul", left: "clamp(6px, 1.8vw, 24px)", size: 28, mobileSize: 18, duration: 11, delay: -2, drift: 20, rotation: 220, opacity: 0.52, color: "#E5C368", visibility: "all" },
  { type: "blossom", left: "calc(100% - clamp(24px, 2.5vw, 42px))", size: 26, mobileSize: 18, duration: 12, delay: -5, drift: -18, rotation: -180, opacity: 0.5, color: "#F472B6", visibility: "all" },
  { type: "petal", left: "18%", size: 22, mobileSize: 15, duration: 10, delay: -7.5, drift: 28, rotation: 160, opacity: 0.44, color: "#F9A8D4", visibility: "all" },
  { type: "romdul", left: "82%", size: 27, mobileSize: 17, duration: 13, delay: -3.5, drift: -22, rotation: -240, opacity: 0.5, color: "#ECC772", visibility: "all" },
  { type: "blossom", left: "48%", size: 25, mobileSize: 16, duration: 14, delay: -9, drift: 24, rotation: 200, opacity: 0.46, color: "#F472B6", visibility: "all" },
  { type: "romdul", left: "10%", size: 26, mobileSize: 18, duration: 12.5, delay: -6, drift: 16, rotation: 250, opacity: 0.48, color: "#F1D082", visibility: "tablet" },
  { type: "petal", left: "91%", size: 22, mobileSize: 15, duration: 11.5, delay: -10, drift: -24, rotation: -190, opacity: 0.4, color: "#FBCFE8", visibility: "tablet" },
  { type: "blossom", left: "32%", size: 26, mobileSize: 17, duration: 13.5, delay: -4, drift: 26, rotation: -220, opacity: 0.48, color: "#F472B6", visibility: "tablet" },
  { type: "romdul", left: "3%", size: 28, mobileSize: 18, duration: 10.5, delay: -8, drift: 18, rotation: 180, opacity: 0.52, color: "#E5C368", visibility: "desktop" },
  { type: "blossom", left: "96%", size: 27, mobileSize: 18, duration: 11, delay: -1.5, drift: -15, rotation: 210, opacity: 0.5, color: "#F472B6", visibility: "desktop" },
  { type: "petal", left: "63%", size: 20, mobileSize: 14, duration: 14.5, delay: -11, drift: 30, rotation: 260, opacity: 0.38, color: "#F9A8D4", visibility: "desktop" },
  { type: "romdul", left: "72%", size: 26, mobileSize: 17, duration: 12, delay: -6.5, drift: -26, rotation: -210, opacity: 0.48, color: "#ECC772", visibility: "desktop" },
];

type FlowerStyle = CSSProperties & {
  [property: `--flower-${string}`]: string | number;
};

// Static markup: CSS handles motion and breakpoints without client JavaScript.
export function FallingFlowersBackground({ debug = false }: { debug?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="falling-flowers-background fixed inset-0 pointer-events-none overflow-hidden z-[1] select-none"
      style={{
        zIndex: 1,
        ...(debug ? { outline: "2px dashed rgba(236, 22, 140, 0.35)", outlineOffset: "-2px" } : {}),
      }}
    >
      {FLOWER_PARTICLES.map((particle, index) => {
        const style: FlowerStyle = {
          left: particle.left,
          color: particle.color,
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

        return (
          <span
            key={index}
            className={`dreamy-falling-flower romdul-falling-flower ${visibilityClass}`}
            style={style}
          >
            <span className="block h-full w-full drop-shadow-[0_1px_3px_rgba(244,114,182,0.28)]">
              {particle.type === "blossom" ? (
                <PastelBlossomSvg className="h-full w-full" />
              ) : particle.type === "romdul" ? (
                <RomdulBlossomSvg className="h-full w-full" />
              ) : (
                <PastelPetalSvg className="h-full w-full" />
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Re-export for backwards compatibility
export { FallingFlowersBackground as RomdulFlowers };
