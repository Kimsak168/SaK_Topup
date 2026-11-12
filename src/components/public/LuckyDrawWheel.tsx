"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Trophy, Gift, Copy, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { LUCKY_PRIZES, LuckyPrize } from "@/types/luckyDraw";

interface LuckyDrawWheelProps {
  orderNumber?: string;
  onWin?: (prize: { label: string; code?: string; points?: number }) => void;
  isOpen?: boolean;
  onClose?: () => void;
  autoOpenIfEligible?: boolean;
  title?: string;
  wheelSize?: number;
  isCompact?: boolean;
}

// Synthesize a quick mechanical tick using Web Audio API
function playTickSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Ignore audio permission restrictions
  }
}

// Synthesize victory fanfare
function playWinSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.3);
    });
  } catch {
    // Ignore audio restrictions
  }
}

// Canvas-based celebratory confetti particles
function triggerConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#FF249C", "#25F4EE", "#F59E0B", "#10B981", "#8B5CF6", "#FFFFFF"];
  const particles = Array.from({ length: 90 }).map(() => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 16,
    vy: (Math.random() - 0.7) * 18,
    size: Math.random() * 8 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    vRotation: (Math.random() - 0.5) * 12,
    alpha: 1,
  }));

  let animId = 0;
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;

    particles.forEach((p) => {
      if (p.alpha <= 0.01) return;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravity
      p.rotation += p.vRotation;
      p.alpha *= 0.975;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (alive > 0) {
      animId = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  animId = requestAnimationFrame(render);
  return () => cancelAnimationFrame(animId);
}

export function LuckyDrawWheel({
  orderNumber,
  onWin,
  isOpen = true,
  onClose,
  title,
  wheelSize,
  isCompact,
}: LuckyDrawWheelProps) {
  const isSmall = Boolean(isCompact || (wheelSize && wheelSize < 280));
  const effectiveSize = wheelSize || (isCompact ? 256 : 336);

  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);
  const [prizeResult, setPrizeResult] = useState<{
    label: string;
    description?: string;
    icon?: string;
    code?: string;
    points?: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioTickIntervalRef = useRef<number | null>(null);

  // Check order eligibility or daily free spin on mount
  useEffect(() => {
    let active = true;

    if (orderNumber) {
      fetch(`/api/lucky-draw/status?orderNumber=${encodeURIComponent(orderNumber)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data.success) {
            setEligible(data.eligible);
            setAlreadySpun(data.hasSpun);
            if (data.hasSpun && data.prize) {
              setPrizeResult(data.prize);
            }
          } else {
            setEligible(false);
          }
          setStatusChecked(true);
        })
        .catch(() => {
          if (active) {
            setEligible(false);
            setStatusChecked(true);
          }
        });
    } else {
      // Free Daily Spin mode for visitors
      try {
        const today = new Date().toDateString();
        const lastSpun = localStorage.getItem("asura_last_free_spin");
        if (lastSpun === today) {
          setAlreadySpun(true);
          setEligible(false);
          const savedPrize = localStorage.getItem("asura_free_spin_prize");
          if (savedPrize) {
            setPrizeResult(JSON.parse(savedPrize));
          }
        } else {
          setAlreadySpun(false);
          setEligible(true);
        }
      } catch {
        setEligible(true);
      }
      setStatusChecked(true);
    }

    return () => {
      active = false;
    };
  }, [orderNumber]);

  // Draw the lucky wheel on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = effectiveSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const padding = isSmall ? 13 : 16;
    const radius = size / 2 - padding;
    const hubRadius = isSmall ? 26 : 34;
    const hubSafeRadius = hubRadius + (isSmall ? 8 : 11);
    const numSlices = LUCKY_PRIZES.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    ctx.clearRect(0, 0, size, size);

    // 0. Outer bezel ring behind slices
    const bezelRadius = radius + (isSmall ? 4 : 5.5);
    const bezelGrad = ctx.createLinearGradient(0, 0, size, size);
    bezelGrad.addColorStop(0, "#F9A8D4");
    bezelGrad.addColorStop(0.5, "#FDE68A");
    bezelGrad.addColorStop(1, "#EC4899");
    ctx.beginPath();
    ctx.arc(center, center, bezelRadius, 0, 2 * Math.PI);
    ctx.fillStyle = bezelGrad;
    ctx.fill();

    // 1. Draw jewel-toned slices
    LUCKY_PRIZES.forEach((slice, i) => {
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();

      // Crisp rich radial gradient: deeper jewel center -> luminous vivid hue toward outer rim
      const grad = ctx.createRadialGradient(center, center, hubRadius * 0.6, center, center, radius);
      grad.addColorStop(0, i % 2 === 0 ? "#3B1D4A" : "#2D183B");
      grad.addColorStop(0.45, slice.color);
      grad.addColorStop(1, slice.color);
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle glossy highlight on outer band
      const gloss = ctx.createRadialGradient(center, center, radius * 0.55, center, center, radius);
      gloss.addColorStop(0, "rgba(255, 255, 255, 0)");
      gloss.addColorStop(1, "rgba(255, 255, 255, 0.14)");
      ctx.fillStyle = gloss;
      ctx.fill();

      // Clean divider line between slices
      ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
      ctx.lineWidth = isSmall ? 1.2 : 1.6;
      ctx.stroke();

      // 2. Draw Slice Icon & Fitted Label Text (never overlapping the center hub)
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + sliceAngle / 2);

      // Icon near outer rim
      const iconX = radius - (isSmall ? 14 : 18);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = isSmall ? "14px sans-serif" : "17px sans-serif";
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 3;
      ctx.fillText(slice.icon, iconX, 0);

      // Label text safely bounded between icon and center hub
      const textRightX = iconX - (isSmall ? 12 : 16);
      const maxTextWidth = Math.max(36, textRightX - hubSafeRadius);
      let fontSize = isSmall ? 9.5 : 11.5;
      while (fontSize > 7) {
        ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
        if (ctx.measureText(slice.name).width <= maxTextWidth) break;
        fontSize -= 0.5;
      }
      ctx.textAlign = "right";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(24, 10, 32, 0.72)";
      ctx.shadowBlur = 3;
      ctx.fillText(slice.name, textRightX, 0.5, maxTextWidth);

      ctx.restore();
    });

    // 3. Crisp inner rim border & soft white pearl studs along bezel
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = isSmall ? 2 : 2.5;
    ctx.stroke();

    const numBulbs = 24;
    for (let b = 0; b < numBulbs; b++) {
      const bAngle = (b * (2 * Math.PI)) / numBulbs;
      const bulbRadius = radius + (isSmall ? 4.5 : 6);
      const bx = center + bulbRadius * Math.cos(bAngle);
      const by = center + bulbRadius * Math.sin(bAngle);

      ctx.beginPath();
      ctx.arc(bx, by, isSmall ? 1.8 : 2.6, 0, 2 * Math.PI);
      ctx.fillStyle = b % 2 === 0 ? "#FFFFFF" : "#FFFBEB";
      ctx.shadowColor = b % 2 === 0 ? "#F472B6" : "#F59E0B";
      ctx.shadowBlur = isSmall ? 3 : 5;
      ctx.fill();
    }
  }, [effectiveSize, isSmall]);

  // Handle spin action
  const handleSpin = useCallback(async () => {
    if (spinning || alreadySpun || eligible === false) return;
    setSpinning(true);

    try {
      // Periodic ticking sound during acceleration
      let tickCount = 0;
      const tickTimer = window.setInterval(() => {
        playTickSound();
        tickCount++;
        if (tickCount > 25) clearInterval(tickTimer);
      }, 140);
      audioTickIntervalRef.current = tickTimer;

      const endpoint = orderNumber ? "/api/lucky-draw/spin" : "/api/lucky-draw/free-spin";
      const payload = orderNumber
        ? { orderNumber }
        : { identifier: typeof window !== "undefined" ? localStorage.getItem("asura_client_id") || "guest" : "guest" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error("Lucky Spin Error", { description: data.error || "Unable to spin right now." });
        setSpinning(false);
        if (audioTickIntervalRef.current) clearInterval(audioTickIntervalRef.current);
        return;
      }

      const targetIndex = Number(data.sliceIndex ?? 0);
      const sliceDeg = 360 / LUCKY_PRIZES.length; // 45 deg
      // Top pointer is at 270 deg. Center of slice i is (i * 45 + 22.5).
      // Angle to place slice center at top pointer:
      const sliceCenter = targetIndex * sliceDeg + sliceDeg / 2;
      const targetDegree = 270 - sliceCenter;
      const fullRotations = 360 * 5; // 5 full exciting spins
      const finalRotation = fullRotations + targetDegree;

      setRotation(finalRotation);

      // Wait for spin animation to finish (4.2 seconds)
      setTimeout(() => {
        if (audioTickIntervalRef.current) clearInterval(audioTickIntervalRef.current);
        setSpinning(false);
        setAlreadySpun(true);
        setPrizeResult(data.prize);
        playWinSound();

        // Remember free spin in localStorage
        if (!orderNumber) {
          try {
            localStorage.setItem("asura_last_free_spin", new Date().toDateString());
            localStorage.setItem("asura_free_spin_prize", JSON.stringify(data.prize));
          } catch {
            // ignore
          }
        }

        if (confettiCanvasRef.current) {
          triggerConfetti(confettiCanvasRef.current);
        }

        toast.success("Congratulations!", {
          id: "lucky-draw-win",
          description: `You won ${data.prize.label}!`,
        });

        if (onWin) {
          onWin({
            label: data.prize.label,
            code: data.prize.code,
            points: data.customerPoints,
          });
        }
      }, 4200);
    } catch {
      toast.error("Network error executing spin.");
      setSpinning(false);
      if (audioTickIntervalRef.current) clearInterval(audioTickIntervalRef.current);
    }
  }, [orderNumber, spinning, alreadySpun, eligible, onWin]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Voucher Code Copied!", { description: code });
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`lucky-draw-panel relative w-full mx-auto rounded-[26px] border border-[#F0C6DA] bg-gradient-to-b from-white via-[#FFF8FB] to-[#FCEEF5] text-center shadow-[0_24px_60px_-15px_rgba(157,23,77,0.28)] overflow-hidden ${
        isSmall ? "max-w-[356px] p-4" : "max-w-lg p-5 sm:p-7"
      }`}
    >
      {/* Soft Sakura ambient glows */}
      <div className="pointer-events-none absolute -top-20 -right-16 size-48 rounded-full bg-pink-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 size-48 rounded-full bg-rose-300/20 blur-3xl" />

      {/* Confetti overlay canvas */}
      <canvas
        ref={confettiCanvasRef}
        className="pointer-events-none fixed inset-0 z-50 size-full"
      />

      {/* Header */}
      <div className={`relative z-10 flex items-center justify-between border-b border-[#F0C6DA]/70 ${
        isSmall ? "pb-3 mb-1.5" : "pb-3.5 mb-2"
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#F43F5E] via-[#EC4899] to-[#BE185D] text-white shadow-md shadow-pink-500/25 shrink-0 ${
            isSmall ? "size-8" : "size-9"
          }`}>
            <Trophy className={isSmall ? "size-4" : "size-[18px]"} />
          </span>
          <div className="text-left min-w-0">
            <h3 className={`font-extrabold tracking-tight text-[#332733] flex items-center gap-1.5 flex-wrap ${
              isSmall ? "text-[15px]" : "text-base sm:text-lg"
            }`}>
              <span className="truncate">{title || (orderNumber ? "Order Lucky Draw Reward" : "Daily Free Lucky Spin")}</span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#BE185D] border border-[#F9A8D4]/70 shrink-0">
                100% WIN
              </span>
            </h3>
            <p className="text-[11px] text-[#705B68] mt-0.5">
              {orderNumber ? (
                <>Order: <span className="font-mono text-[#BE185D] font-bold">{orderNumber}</span></>
              ) : (
                <span>🎁 1 Free Spin Daily · Win Points &amp; Coupons</span>
              )}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-xl border border-[#F0C6DA] bg-[#FCF0F5] text-[#705B68] hover:bg-[#F7DFEA] hover:text-[#BE185D] transition-colors cursor-pointer shrink-0"
            aria-label="Close lucky draw"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Wheel Area */}
      <div className={`relative flex flex-col items-center justify-center ${isSmall ? "my-2.5" : "my-4"}`}>
        {/* Top Teardrop Pointer Pin */}
        <div className={`relative z-20 flex flex-col items-center ${isSmall ? "-mb-3.5" : "-mb-4"}`}>
          <svg
            width={isSmall ? 26 : 32}
            height={isSmall ? 28 : 34}
            viewBox="0 0 32 34"
            className="drop-shadow-[0_4px_8px_rgba(190,24,93,0.45)]"
            aria-hidden="true"
          >
            <path
              d="M16 33C16 33 4 19.5 4 12C4 5.37 9.37 0 16 0C22.63 0 28 5.37 28 12C28 19.5 16 33 16 33Z"
              fill="#BE185D"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            <circle cx="16" cy="12" r="4.5" fill="#FFFBEB" />
          </svg>
        </div>

        {/* Rotating Wheel Wrapper */}
        <div
          className={`relative rounded-full p-0.5 shadow-[0_14px_34px_-8px_rgba(190,24,93,0.32)] ring-4 ring-[#F9A8D4]/35 ${
            isSmall ? "size-[260px]" : "size-[312px] sm:size-[340px]"
          }`}
        >
          <div
            className="relative size-full rounded-full overflow-hidden"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.15, 0.9, 0.2, 1)" : "none",
            }}
          >
            <canvas ref={canvasRef} className="size-full" />
          </div>

          {/* Rose-Gold Center Hub / Spin Button */}
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || alreadySpun || eligible === false}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-full border-[3px] border-white font-black uppercase tracking-wider shadow-[0_6px_18px_rgba(51,39,51,0.38)] flex flex-col items-center justify-center transition-all ${
              isSmall ? "size-[52px] text-[10px]" : "size-[68px] text-xs"
            } ${
              spinning
                ? "bg-gradient-to-b from-[#EC4899] to-[#BE185D] text-white scale-95 opacity-90 cursor-not-allowed"
                : alreadySpun
                ? "bg-gradient-to-b from-[#4B394B] to-[#332733] text-white/95 cursor-not-allowed"
                : "bg-gradient-to-b from-[#F472B6] via-[#DB2777] to-[#9D174D] text-white hover:scale-105 active:scale-95 cursor-pointer ring-4 ring-pink-300/40"
            }`}
          >
            {spinning ? (
              <RotateCcw className={`${isSmall ? "size-4" : "size-5"} animate-spin`} />
            ) : alreadySpun ? (
              <span className="text-[10px] font-extrabold tracking-wide leading-tight">DONE</span>
            ) : (
              <>
                <span className="leading-none">SPIN</span>
                <span className="text-[7.5px] font-bold text-pink-100 mt-0.5">NOW</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Prize Result Banner or Status Note */}
      {prizeResult ? (
        <div className={`lucky-draw-result relative z-10 rounded-2xl border border-[#E4C6D4] bg-white/95 text-center shadow-[0_6px_20px_-6px_rgba(190,24,93,0.16)] animate-in fade-in zoom-in-95 ${
          isSmall ? "mt-2 p-3.5 space-y-2" : "mt-4 p-4 space-y-2.5"
        }`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold">
            <Sparkles className="size-3.5 text-emerald-600" />
            <span>You Won: {prizeResult.label}</span>
          </div>

          {prizeResult.description && (
            <p className="text-[11.5px] font-medium text-[#5C4754] max-w-sm mx-auto leading-relaxed">
              {prizeResult.description}
            </p>
          )}

          {prizeResult.code && (
            <div className="pt-0.5 flex items-center justify-center gap-2">
              <span className="font-mono text-xs font-black px-3 py-1.5 rounded-xl bg-[#FFF5FA] border border-dashed border-[#DB2777]/50 text-[#9D174D] tracking-wider select-all">
                {prizeResult.code}
              </span>
              <button
                type="button"
                onClick={() => copyCode(prizeResult.code!)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#BE185D] hover:from-[#BE185D] hover:to-[#9D174D] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-pink-500/25 transition-all cursor-pointer active:scale-95"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
        </div>
      ) : alreadySpun ? (
        <div className="relative z-10 mt-2 text-xs font-medium text-[#705B68]">
          {orderNumber
            ? "This order has already redeemed its Lucky Spin."
            : "You used today's free spin! Come back tomorrow or top up to spin again."}
        </div>
      ) : statusChecked && eligible === false ? (
        <div className="relative z-10 mt-2 text-xs text-[#BE185D] font-semibold">
          {orderNumber
            ? "Complete payment first to unlock your free Lucky Spin!"
            : "Free spin unavailable right now."}
        </div>
      ) : (
        <div className="relative z-10 mt-2 text-xs text-[#5C4754] flex items-center justify-center gap-1.5">
          <Gift className="size-3.5 text-[#DB2777]" />
          <span>Tap <strong>SPIN NOW</strong> to claim your guaranteed reward!</span>
        </div>
      )}
    </div>
  );
}
