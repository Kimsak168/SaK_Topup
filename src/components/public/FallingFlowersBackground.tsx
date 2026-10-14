import type { CSSProperties } from "react";

// Soft 5-petal dreamy pastel blossom
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

// Romdul-inspired blossom with three outer and three inner petals.
function RomdulBlossomSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* 3 outer spreading petals */}
      <g fill="currentColor" stroke="#D97706" strokeWidth="0.65" strokeOpacity="0.45">
        <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        <g transform="rotate(120 16 16)">
          <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        </g>
        <g transform="rotate(240 16 16)">
          <path d="M16 16 C11.5 13.5 9 7.5 16 3 C23 7.5 20.5 13.5 16 16 Z" />
        </g>
      </g>
      {/* 3 inner arched petals - warm golden / cream accent */}
      <g fill="#FDE68A" opacity={0.92} transform="rotate(60 16 16)">
        <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        <g transform="rotate(120 16 16)">
          <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        </g>
        <g transform="rotate(240 16 16)">
          <path d="M16 16 C13.5 14.5 12 10.5 16 8 C20 10.5 18.5 14.5 16 16 Z" />
        </g>
      </g>
      {/* Golden core */}
      <circle cx="16" cy="16" r="2.2" fill="#F59E0B" opacity={0.95} />
      <circle cx="16" cy="16" r="1.1" fill="#D97706" />
    </svg>
  );
}

// Delicate single falling petal with subtle vein
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
  blur?: number;
  visibility: "all" | "tablet" | "desktop";
}

// 12 flowers distributed across the viewport (5 on mobile, 8 on tablet, 12 on desktop)
// Negative delays ensure flowers appear immediately distributed down the page on first paint
const FLOWER_PARTICLES: FlowerParticle[] = [
  // Mobile + Tablet + Desktop (5 flowers) — mobile count: 5 (range: 4–7)
  { type: "romdul", left: "clamp(6px, 1.8vw, 24px)", size: 28, mobileSize: 18, duration: 11, delay: -2, drift: 20, rotation: 220, opacity: 0.52, color: "#E5C368", visibility: "all" },
  { type: "blossom", left: "calc(100% - clamp(24px, 2.5vw, 42px))", size: 26, mobileSize: 18, duration: 12, delay: -5, drift: -18, rotation: -180, opacity: 0.50, color: "#F472B6", visibility: "all" },
  { type: "petal", left: "18%", size: 22, mobileSize: 15, duration: 10, delay: -7.5, drift: 28, rotation: 160, opacity: 0.44, color: "#F9A8D4", visibility: "all" },
  { type: "romdul", left: "82%", size: 27, mobileSize: 17, duration: 13, delay: -3.5, drift: -22, rotation: -240, opacity: 0.50, color: "#ECC772", visibility: "all" },
  { type: "blossom", left: "48%", size: 25, mobileSize: 16, duration: 14, delay: -9, drift: 24, rotation: 200, opacity: 0.46, color: "#F472B6", visibility: "all" },

  // Tablet + Desktop (3 flowers) — tablet count: 5 + 3 = 8 (range: 7–10)
  { type: "romdul", left: "10%", size: 26, mobileSize: 18, duration: 12.5, delay: -6, drift: 16, rotation: 250, opacity: 0.48, color: "#F1D082", visibility: "tablet" },
  { type: "petal", left: "91%", size: 22, mobileSize: 15, duration: 11.5, delay: -10, drift: -24, rotation: -190, opacity: 0.40, color: "#FBCFE8", visibility: "tablet" },
  { type: "blossom", left: "32%", size: 26, mobileSize: 17, duration: 13.5, delay: -4, drift: 26, rotation: -220, opacity: 0.48, color: "#F472B6", visibility: "tablet" },

  // Desktop only (4 flowers) — desktop count: 8 + 4 = 12 (range: 10–14)
  { type: "romdul", left: "3%", size: 28, mobileSize: 18, duration: 10.5, delay: -8, drift: 18, rotation: 180, opacity: 0.52, color: "#E5C368", visibility: "desktop" },
  { type: "blossom", left: "96%", size: 27, mobileSize: 18, duration: 11, delay: -1.5, drift: -15, rotation: 210, opacity: 0.50, color: "#F472B6", visibility: "desktop" },
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
      {FLOWER_PARTICLES.map((p, index) => {
        const style: FlowerStyle = {
          left: p.left,
          color: p.color,
          "--flower-size": `${p.size}px`,
          "--flower-mobile-size": `${p.mobileSize}px`,
          "--flower-dur": `${p.duration}s`,
          "--flower-delay": `${p.delay}s`,
          "--flower-drift": `${p.drift}px`,
          "--flower-rot": `${p.rotation}deg`,
          "--flower-op": p.opacity,
        };

        const visibilityClass =
          p.visibility === "desktop"
            ? "hidden lg:block"
            : p.visibility === "tablet"
              ? "hidden md:block"
              : "block";

        return (
          <span
            key={index}
            className={`dreamy-falling-flower romdul-falling-flower ${visibilityClass}`}
            style={style}
          >
            <span className="block h-full w-full drop-shadow-[0_1px_2px_rgba(236,22,140,0.18)]">
              {p.type === "blossom" ? (
                <PastelBlossomSvg className="w-full h-full" />
              ) : p.type === "romdul" ? (
                <RomdulBlossomSvg className="w-full h-full" />
              ) : (
                <PastelPetalSvg className="w-full h-full" />
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


