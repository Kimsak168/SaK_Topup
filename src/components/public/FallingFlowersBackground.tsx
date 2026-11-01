import type { CSSProperties } from "react";

function PumpkinSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Pumpkin Green Stem */}
      <path
        d="M15 5 C15 3 17 2 18 3 C17.5 5 16.5 6 16 7"
        stroke="#22C55E"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Pumpkin Outer Lobes */}
      <ellipse cx="16" cy="18" rx="12" ry="10" fill="#EA580C" />
      <ellipse cx="11.5" cy="18" rx="7.5" ry="9.5" fill="#F97316" />
      <ellipse cx="20.5" cy="18" rx="7.5" ry="9.5" fill="#F97316" />
      <ellipse cx="16" cy="18" rx="5" ry="9.8" fill="#FB923C" />
      {/* Carved Eyes */}
      <polygon points="12,14 14,17 10,17" fill="#18181B" />
      <polygon points="20,14 22,17 18,17" fill="#18181B" />
      {/* Carved Nose */}
      <polygon points="16,17 17,19 15,19" fill="#18181B" />
      {/* Carved Jagged Smile */}
      <path
        d="M10 21 Q16 26 22 21 C20.5 22.5 19 21.5 18 22.5 C17 21.5 15 22.5 14 21.5 C13 22.5 11.5 22 10 21 Z"
        fill="#18181B"
      />
    </svg>
  );
}

function GhostSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Floating Ghost Body */}
      <path
        d="M16 4 C10 4 7 9 7 15 C7 21 6 26 8 27 C9.5 27 10.5 25 12 25 C13.5 25 14.5 27 16 27 C17.5 27 18.5 25 20 25 C21.5 25 22.5 27 24 27 C26 26 25 21 25 15 C25 9 22 4 16 4 Z"
        fill="#F8FAFC"
        stroke="#E2E8F0"
        strokeWidth="0.8"
      />
      {/* Cute Dark Oval Eyes */}
      <ellipse cx="13" cy="13" rx="1.6" ry="2.2" fill="#0F172A" />
      <ellipse cx="19" cy="13" rx="1.6" ry="2.2" fill="#0F172A" />
      {/* Little Open Mouth */}
      <ellipse cx="16" cy="18" rx="1.4" ry="2" fill="#0F172A" />
      {/* Pink Blushing Cheeks */}
      <circle cx="10" cy="15" r="1.3" fill="#F43F5E" opacity="0.45" />
      <circle cx="22" cy="15" r="1.3" fill="#F43F5E" opacity="0.45" />
    </svg>
  );
}

function BatSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Spread Bat Wings & Ears */}
      <path
        d="M16 12 L17.5 8 L18.5 11 C20 9.5 23 8.5 28 10 C26.5 13.5 26 16.5 28 19.5 C24 18.5 21 20.5 19 22.5 C18 20 17 18.5 16 18.5 C15 18.5 14 20 13 22.5 C11 20.5 8 18.5 4 19.5 C6 16.5 5.5 13.5 4 10 C9 8.5 12 9.5 13.5 11 L14.5 8 Z"
        fill="#A855F7"
        stroke="#6B21A8"
        strokeWidth="0.75"
      />
      {/* Tiny Glowing Eyes */}
      <circle cx="15" cy="13" r="0.75" fill="#FACC15" />
      <circle cx="17" cy="13" r="0.75" fill="#FACC15" />
    </svg>
  );
}

function CandySvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Candy Wrapper Ends */}
      <polygon points="10,16 3,10 3,22" fill="#F97316" opacity="0.9" />
      <polygon points="22,16 29,10 29,22" fill="#F97316" opacity="0.9" />
      {/* Candy Core */}
      <circle cx="16" cy="16" r="6.8" fill="#9333EA" stroke="#7E22CE" strokeWidth="0.5" />
      {/* Festive Stripes */}
      <path d="M12 16 Q16 11 20 16" stroke="#FEF08A" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 19 Q16 16 19 19" stroke="#FB923C" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

interface HalloweenParticle {
  type: "pumpkin" | "ghost" | "bat" | "candy";
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

// Negative delays distribute particles naturally across the screen on load.
const HALLOWEEN_PARTICLES: HalloweenParticle[] = [
  { type: "pumpkin", left: "clamp(8px, 2.2vw, 28px)", size: 30, mobileSize: 20, duration: 11, delay: -2, drift: 20, rotation: 180, opacity: 0.62, visibility: "all" },
  { type: "ghost", left: "calc(100% - clamp(28px, 3vw, 48px))", size: 30, mobileSize: 20, duration: 12.5, delay: -5, drift: -22, rotation: -120, opacity: 0.65, visibility: "all" },
  { type: "bat", left: "16%", size: 26, mobileSize: 18, duration: 10, delay: -7.5, drift: 28, rotation: 140, opacity: 0.55, visibility: "all" },
  { type: "candy", left: "84%", size: 26, mobileSize: 18, duration: 13, delay: -3.5, drift: -20, rotation: -220, opacity: 0.58, visibility: "all" },
  { type: "pumpkin", left: "46%", size: 28, mobileSize: 19, duration: 14, delay: -9, drift: 24, rotation: 190, opacity: 0.58, visibility: "all" },
  { type: "ghost", left: "11%", size: 28, mobileSize: 19, duration: 12, delay: -6, drift: 18, rotation: 160, opacity: 0.62, visibility: "tablet" },
  { type: "bat", left: "89%", size: 25, mobileSize: 17, duration: 11.5, delay: -10, drift: -24, rotation: -160, opacity: 0.52, visibility: "tablet" },
  { type: "candy", left: "34%", size: 27, mobileSize: 18, duration: 13.5, delay: -4, drift: 26, rotation: -200, opacity: 0.55, visibility: "tablet" },
  { type: "pumpkin", left: "4%", size: 29, mobileSize: 20, duration: 10.5, delay: -8, drift: 16, rotation: 170, opacity: 0.6, visibility: "desktop" },
  { type: "ghost", left: "95%", size: 29, mobileSize: 20, duration: 11, delay: -1.5, drift: -16, rotation: 180, opacity: 0.64, visibility: "desktop" },
  { type: "bat", left: "64%", size: 26, mobileSize: 18, duration: 14.5, delay: -11, drift: 30, rotation: 220, opacity: 0.5, visibility: "desktop" },
  { type: "candy", left: "73%", size: 28, mobileSize: 19, duration: 12, delay: -6.5, drift: -24, rotation: -180, opacity: 0.56, visibility: "desktop" },
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
        ...(debug ? { outline: "2px dashed rgba(249, 115, 22, 0.35)", outlineOffset: "-2px" } : {}),
      }}
    >
      {HALLOWEEN_PARTICLES.map((particle, index) => {
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
          particle.type === "pumpkin"
            ? "drop-shadow-[0_2px_8px_rgba(249,115,22,0.45)]"
            : particle.type === "ghost"
              ? "drop-shadow-[0_2px_8px_rgba(248,250,252,0.55)]"
              : particle.type === "bat"
                ? "drop-shadow-[0_2px_8px_rgba(168,85,247,0.45)]"
                : "drop-shadow-[0_2px_8px_rgba(234,88,12,0.4)]";

        return (
          <span
            key={index}
            className={`dreamy-falling-flower romdul-falling-flower ${visibilityClass}`}
            style={style}
          >
            <span className={`block h-full w-full ${shadowClass}`}>
              {particle.type === "pumpkin" ? (
                <PumpkinSvg className="h-full w-full" />
              ) : particle.type === "ghost" ? (
                <GhostSvg className="h-full w-full" />
              ) : particle.type === "bat" ? (
                <BatSvg className="h-full w-full" />
              ) : (
                <CandySvg className="h-full w-full" />
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
