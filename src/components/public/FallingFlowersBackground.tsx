import type { CSSProperties } from "react";

function PastelPetalSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2 C8 6.5 5.5 12 8 17 C10.5 22 15 21.5 17.5 17 C20 12 16.5 6.5 12 2 Z"
        fill="currentColor"
      />
      <path
        d="M12 5 C12 10 12.5 14 13 18"
        stroke="#B54779"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity={0.3}
      />
    </svg>
  );
}

interface FlowerParticle {
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

// A few small petals keep the background atmospheric without competing with content.
const FLOWER_PARTICLES: FlowerParticle[] = [
  { left: "12%", size: 14, mobileSize: 10, duration: 27, delay: -8, drift: 16, rotation: 160, opacity: 0.17, color: "#E9AFCB", visibility: "all" },
  { left: "76%", size: 15, mobileSize: 10, duration: 31, delay: -19, drift: -18, rotation: -190, opacity: 0.16, color: "#C9B9E7", visibility: "all" },
  { left: "43%", size: 13, mobileSize: 9, duration: 29, delay: -13, drift: 20, rotation: 210, opacity: 0.14, color: "#F0C2D9", visibility: "all" },
  { left: "91%", size: 16, mobileSize: 11, duration: 32, delay: -24, drift: -15, rotation: -230, opacity: 0.17, color: "#D2C5EB", visibility: "tablet" },
  { left: "27%", size: 14, mobileSize: 10, duration: 28, delay: -5, drift: 19, rotation: 190, opacity: 0.15, color: "#E9AFCB", visibility: "desktop" },
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
            <span className="block h-full w-full drop-shadow-[0_1px_2px_rgba(157,80,126,0.06)]">
              <PastelPetalSvg className="h-full w-full" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Re-export for backwards compatibility
export { FallingFlowersBackground as RomdulFlowers };
