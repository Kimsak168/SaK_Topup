"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { PublicBanner } from "@/lib/services/bannerService";

interface PromotionalBannerProps {
  banners: PublicBanner[];
}

export function PromotionalBanner({ banners }: PromotionalBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  // Exactly four configurable banner slots from MongoDB / image storage
  const slides = banners.slice(0, 4);
  const activeIndex = slides.length ? currentIndex % slides.length : 0;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(media.matches);
    const syncVisibility = () => setIsVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const nextSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Automatically switch to next banner every 5 seconds, looping after the last banner
  useEffect(() => {
    if (slides.length <= 1 || isPaused || pauseRequested || hasFocus || reduceMotion || !isVisible) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [slides.length, isPaused, pauseRequested, hasFocus, reduceMotion, isVisible, nextSlide]);

  // Touch and swipe gestures for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      nextSlide();
    } else if (diff < -40) {
      prevSlide();
    }
    touchStartXRef.current = null;
  };

  if (!slides.length) {
    return (
      <div
        role="status"
        className="mx-auto w-[96%] sm:w-[94%] max-w-[1100px] rounded-xl border border-[#BBF7D0] bg-white px-6 py-10 text-center text-[#64748B] shadow-xs"
      >
        No promotional banners are available right now.
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Promotions"
      aria-roledescription="carousel"
      className="relative mx-auto w-[96%] sm:w-[94%] max-w-[1100px] space-y-2 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Centered 16:9 Responsive Single-Banner Frame (max-w: 1100px, 12-14px border radius) */}
      <div className="group relative overflow-hidden rounded-xl border border-[#BBF7D0] bg-white shadow-xs transition-colors hover:border-[#16A34A]">
        {/* Smooth Horizontal Sliding Track */}
        <div
          className="flex transition-transform duration-500 ease-in-out motion-reduce:transition-none"
          style={slides.length > 1 ? { transform: `translateX(-${activeIndex * 100}%)` } : undefined}
        >
          {slides.map((banner, index) => {
            const artwork = (
              <div
                className="relative w-full aspect-video overflow-hidden bg-white"
              >
                {!banner.imageUrl || failedImages[banner.imageUrl] ? (
                  <div role="status" className="flex h-full w-full items-center justify-center px-12 text-center text-sm text-[#64748B]">
                    {banner.title || `Promotional banner ${index + 1}`} image is temporarily unavailable.
                  </div>
                ) : (
                  <>
                    {/* Background Filler: Ambient blurred copy of the banner filling the entire 16:9 container — eliminates dark bars */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
                      <Image
                        src={banner.imageUrl}
                        alt=""
                        fill
                        aria-hidden="true"
                        priority={index === 0}
                        quality={70}
                        sizes="(max-width: 768px) 96vw, 1100px"
                        className="object-cover scale-105 blur-xl opacity-45"
                      />
                    </div>

                    {/* Foreground: 100% sharp, exact original colors, quality 95, no filters, no opacity */}
                    <Image
                      src={banner.imageUrl}
                      alt={banner.title || "SakSuuu Banner"}
                      fill
                      priority={index === 0}
                      quality={95}
                      sizes="(max-width: 768px) 96vw, 1100px"
                      className="relative z-10 object-contain object-center select-none"
                      onError={(event) => {
                        console.error("[PromotionalBanner] Image failed to load", {
                          originalUrl: banner.imageUrl,
                          requestedUrl: event.currentTarget.currentSrc,
                        });
                        setFailedImages((previous) => ({ ...previous, [banner.imageUrl]: true }));
                      }}
                    />
                  </>
                )}
              </div>
            );

            return (
              <div key={banner.id || index} className="w-full shrink-0" inert={index !== activeIndex} aria-hidden={index !== activeIndex}>
                {banner.targetUrl ? (
                  <Link
                    href={banner.targetUrl}
                    className="block outline-none focus:outline-none focus-visible:outline-none"
                  >
                    {artwork}
                  </Link>
                ) : (
                  artwork
                )}
              </div>
            );
          })}
        </div>

        {/* Left and Right Navigation Arrow Buttons (inside banner, reduced size) */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous banner"
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/90 hover:bg-white border border-[#BBF7D0] text-[#172033] hover:text-[#16A34A] transition-colors z-20 shadow-[0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur-xs cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/90 hover:bg-white border border-[#BBF7D0] text-[#172033] hover:text-[#16A34A] transition-colors z-20 shadow-[0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur-xs cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </>
        )}
      </div>

      {/* Navigation Dots Below the Banner (close below banner) */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-1 sm:mt-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to banner ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className="flex h-4 w-4 items-center justify-center rounded-full cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
            >
              <span
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === activeIndex ? "w-4 sm:w-5 bg-[#16A34A]" : "w-1.5 bg-[#BBF7D0] hover:bg-[#86EFAC]"
                }`}
              />
            </button>
          ))}
          {!reduceMotion && (
            <button
              type="button"
              onClick={() => setPauseRequested(!pauseRequested)}
              aria-label={pauseRequested ? "Play slideshow" : "Pause slideshow"}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[#64748B] hover:text-[#16A34A] active:text-[#22C55E] cursor-pointer outline-none focus:outline-none focus-visible:outline-none ml-0.5"
            >
              {pauseRequested ? (
                <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              ) : (
                <Pause className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
