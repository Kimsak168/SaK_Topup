"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Trophy, Gift, Copy, Check, ArrowRight, X, RotateCcw } from "lucide-react";
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
  const effectiveSize = wheelSize || (isCompact ? 240 : 320);

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
    const radius = size / 2 - (isSmall ? 8 : 12);
    const numSlices = LUCKY_PRIZES.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    ctx.clearRect(0, 0, size, size);

    // 1. Draw slices
    LUCKY_PRIZES.forEach((slice, i) => {
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();

      // Alternate subtle gradient per slice
      const grad = ctx.createRadialGradient(center, center, radius * 0.15, center, center, radius);
      grad.addColorStop(0, slice.color);
      grad.addColorStop(1, i % 2 === 0 ? "rgba(10, 15, 30, 0.95)" : "rgba(18, 12, 38, 0.92)");
      ctx.fillStyle = grad;
      ctx.fill();

      // Border between slices
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = isSmall ? 1 : 1.5;
      ctx.stroke();

      // 2. Draw Slice Icon & Text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + sliceAngle / 2);

      // Icon
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = isSmall ? "bold 13px sans-serif" : "bold 16px sans-serif";
      ctx.fillText(slice.icon, radius - (isSmall ? 10 : 16), 0);

      // Label text
      ctx.font = isSmall ? "bold 8.5px system-ui, -apple-system, sans-serif" : "bold 11px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(slice.name, radius - (isSmall ? 28 : 40), 0);

      ctx.restore();
    });

    // 3. Draw outer decorative border ring with lights
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = isSmall ? 3.5 : 5;
    ctx.stroke();

    // Small golden light bulbs around outer rim
    const numBulbs = 24;
    for (let b = 0; b < numBulbs; b++) {
      const bAngle = (b * (2 * Math.PI)) / numBulbs;
      const bx = center + (radius + (isSmall ? 2.5 : 4)) * Math.cos(bAngle);
      const by = center + (radius + (isSmall ? 2.5 : 4)) * Math.sin(bAngle);

      ctx.beginPath();
      ctx.arc(bx, by, isSmall ? 1.6 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = b % 2 === 0 ? "#FDE047" : "#38BDF8";
      ctx.shadowColor = b % 2 === 0 ? "#F59E0B" : "#0284C7";
      ctx.shadowBlur = isSmall ? 3 : 6;
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
      className={`lucky-draw-panel relative w-full mx-auto rounded-3xl border border-sky-400/40 bg-[#0B0F19]/95 backdrop-blur-xl text-center shadow-2xl shadow-sky-950/50 overflow-hidden ${
        isSmall ? "max-w-[340px] p-4" : "max-w-lg p-5 sm:p-7"
      }`}
    >
      {/* Background ambient neon glows */}
      <div className="pointer-events-none absolute -top-16 -left-16 size-48 rounded-full bg-pink-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full bg-sky-500/20 blur-3xl" />

      {/* Confetti overlay canvas */}
      <canvas
        ref={confettiCanvasRef}
        className="pointer-events-none fixed inset-0 z-50 size-full"
      />

      {/* Header */}
      <div className={`relative z-10 flex items-center justify-between border-b border-white/10 ${
        isSmall ? "pb-2.5 mb-1" : "pb-3 mb-2"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`flex items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-pink-500 text-white shadow-md shadow-pink-500/30 ${
            isSmall ? "size-7" : "size-8"
          }`}>
            <Trophy className={isSmall ? "size-3.5" : "size-4"} />
          </span>
          <div className="text-left">
            <h3 className={`font-black tracking-tight text-white flex items-center gap-1.5 ${
              isSmall ? "text-sm" : "text-base sm:text-lg"
            }`}>
              <span>{title || (orderNumber ? "Order Lucky Draw Reward" : "Daily Free Lucky Spin")}</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                100% WIN
              </span>
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-400">
              {orderNumber ? (
                <>Order: <span className="font-mono text-sky-300 font-bold">{orderNumber}</span></>
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
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close lucky draw"
          >
            <X className="size-4 sm:size-5" />
          </button>
        )}
      </div>

      {/* Wheel Area */}
      <div className={`relative flex flex-col items-center justify-center ${isSmall ? "my-2" : "my-4"}`}>
        {/* Top Pointer Indicator */}
        <div className={`relative z-20 flex flex-col items-center ${isSmall ? "-mb-3" : "-mb-4"}`}>
          <div
            className={`w-0 h-0 border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-[0_4px_10px_rgba(245,158,11,0.8)] filter ${
              isSmall
                ? "border-l-[9px] border-r-[9px] border-t-[16px]"
                : "border-l-[12px] border-r-[12px] border-t-[20px]"
            }`}
          />
        </div>

        {/* Rotating Wheel Wrapper */}
        <div
          className={`relative rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-sky-400 shadow-[0_0_35px_rgba(56,189,248,0.35)] ${
            isSmall ? "size-[230px] p-1" : "size-[300px] sm:size-[320px] p-1.5"
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

          {/* Golden Center Hub / Spin Button */}
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || alreadySpun || eligible === false}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-full border-2 border-amber-300 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black uppercase tracking-wider shadow-lg shadow-amber-950/60 flex flex-col items-center justify-center transition-all ${
              isSmall ? "size-14 text-[11px]" : "size-16 sm:size-18 text-xs sm:text-sm"
            } ${
              spinning
                ? "scale-95 opacity-80 cursor-not-allowed"
                : alreadySpun
                ? "bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed"
                : "hover:scale-105 active:scale-95 hover:shadow-amber-400/50 cursor-pointer animate-pulse"
            }`}
          >
            {spinning ? (
              <RotateCcw className={`${isSmall ? "size-4" : "size-5"} animate-spin`} />
            ) : alreadySpun ? (
              <span className="text-[10px] leading-tight">DONE</span>
            ) : (
              <>
                <span className="leading-none">SPIN</span>
                <span className="text-[7.5px] font-extrabold text-amber-950/80">NOW</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Prize Result Banner or Status Note */}
      {prizeResult ? (
        <div className={`lucky-draw-result relative z-10 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-950/40 via-sky-950/40 to-emerald-950/40 text-center animate-in fade-in zoom-in-95 ${
          isSmall ? "mt-2.5 p-3 space-y-1.5" : "mt-4 p-4 space-y-2"
        }`}>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
            <Sparkles className="size-3.5" />
            <span>You Won: {prizeResult.label}</span>
          </div>

          {prizeResult.description && (
            <p className="text-[11px] text-slate-300 max-w-sm mx-auto">
              {prizeResult.description}
            </p>
          )}

          {prizeResult.code && (
            <div className="pt-1 flex items-center justify-center gap-2">
              <span className="font-mono text-xs font-black px-2.5 py-1 rounded-xl bg-black/60 border border-amber-400/50 text-amber-300 tracking-wider">
                {prizeResult.code}
              </span>
              <button
                type="button"
                onClick={() => copyCode(prizeResult.code!)}
                className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
        </div>
      ) : alreadySpun ? (
        <div className="relative z-10 mt-2 text-xs text-slate-400">
          {orderNumber
            ? "This order has already redeemed its Lucky Spin."
            : "You used today's free spin! Come back tomorrow or top up to spin again."}
        </div>
      ) : statusChecked && eligible === false ? (
        <div className="relative z-10 mt-2 text-xs text-amber-400 font-semibold">
          {orderNumber
            ? "Complete payment first to unlock your free Lucky Spin!"
            : "Free spin unavailable right now."}
        </div>
      ) : (
        <div className="relative z-10 mt-2 text-xs text-slate-300 flex items-center justify-center gap-1.5">
          <Gift className="size-3.5 text-pink-400" />
          <span>Click <strong>SPIN NOW</strong> to claim your guaranteed reward!</span>
        </div>
      )}
    </div>
  );
}
