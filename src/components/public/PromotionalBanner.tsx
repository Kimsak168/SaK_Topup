"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicBanner } from "@/lib/services/bannerService";

interface PromotionalBannerProps {
  banners: PublicBanner[];
}

export function PromotionalBanner({ banners }: PromotionalBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [is16x9Map, setIs16x9Map] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  // Exactly four configurable banner slots from MongoDB / image storage
  const slides = banners.slice(0, 4);
  const activeIndex = slides.length ? currentIndex % slides.length : 0;

  useEffect(() => {
    const syncVisibility = () => setIsVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
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
    if (slides.length <= 1 || !isVisible) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [slides.length, isVisible, nextSlide]);

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
        className="mx-auto w-full max-w-[1100px] rounded-[10px] md:rounded-[12px] border border-[#DCFCE7] px-6 py-8 text-center text-[#64748B] shadow-xs"
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
      className="relative mx-auto w-full max-w-[1100px] space-y-1.5 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Centered True 16:9 Frame (max-w: 1050px, 8-10px mobile / 10-12px desktop border radius, no solid gray bars) */}
      <div className="group relative overflow-hidden rounded-[10px] md:rounded-[12px] border border-[#DCFCE7] shadow-xs transition-colors hover:border-[#16A34A] bg-[#0A0E1A]">
        {/* Smooth horizontal slide transition */}
        <div
          className="flex transition-transform duration-[650ms] ease-in-out"
          style={slides.length > 1 ? { transform: `translateX(-${activeIndex * 100}%)` } : undefined}
        >
          {slides.map((banner, index) => {
            const isFirstSlide = index === 0;
            const isKnown16x9 = is16x9Map[banner.imageUrl] === true;
            const isLoaded = loadedImages[banner.imageUrl] === true;

            const artwork = (
              <div
                className="relative w-full aspect-video overflow-hidden bg-[#0A0E1A]"
                style={{ aspectRatio: "16 / 9" }}
              >
                {!banner.imageUrl || failedImages[banner.imageUrl] ? (
                  <div role="status" className="flex h-full w-full items-center justify-center px-12 text-center text-sm text-[#64748B]">
                    {banner.title || `Promotional banner ${index + 1}`} image is temporarily unavailable.
                  </div>
                ) : (
                  <>
                    {/* Subtle shimmer skeleton while image is loading */}
                    {!isLoaded && (
                      <div className="absolute inset-0 z-0 animate-pulse bg-gradient-to-tr from-[#0F172A] via-[#1E293B] to-[#0F172A]" />
                    )}

                    {/* Ambient blurred backdrop for non-16:9 artwork (using micro 120px thumb to prevent server lag) */}
                    {!isKnown16x9 && isLoaded && (
                      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none transition-opacity duration-500" aria-hidden="true">
                        <Image
                          src={banner.imageUrl}
                          alt=""
                          fill
                          aria-hidden="true"
                          quality={20}
                          sizes="120px"
                          className="object-cover scale-125 blur-2xl opacity-60"
                        />
                      </div>
                    )}

                    {/* Foreground Image: Smooth fade-in, quality 80 for optimal speed and crispness */}
                    <Image
                      src={banner.imageUrl}
                      alt={banner.title || "SakSuuu Banner"}
                      fill
                      quality={80}
                      priority={isFirstSlide}
                      sizes="(max-width: 639px) calc(100vw - 24px), (max-width: 1147px) calc(100vw - 48px), 1100px"
                      className={`relative z-10 object-contain object-center select-none transition-opacity duration-300 ease-out ${
                        isLoaded ? "opacity-100" : "opacity-0"
                      }`}
                      onLoad={(event) => {
                        setLoadedImages((prev) => ({ ...prev, [banner.imageUrl]: true }));
                        const img = event.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                          const ratio = img.naturalWidth / img.naturalHeight;
                          const isTrue169 = Math.abs(ratio - 16 / 9) < 0.03;
                          setIs16x9Map((previous) => ({
                            ...previous,
                            [banner.imageUrl]: isTrue169,
                          }));
                        }
                      }}
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
                    className="block focus-visible:outline-2 focus-visible:outline-[#16A34A] focus-visible:outline-offset-2"
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

        {/* Carousel Controls: Arrows (32px mobile, 38px desktop, white translucent bg, subtle shadow, dark green arrow) */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous banner"
              className="absolute left-2 md:left-2.5 top-1/2 -translate-y-1/2 flex h-9 w-9 md:h-[38px] md:w-[38px] items-center justify-center rounded-full bg-white/85 hover:bg-white text-[#16A34A] hover:text-[#22C55E] border border-white/80 shadow-[0_2px_6px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-all duration-200 z-20 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#16A34A] focus-visible:outline-offset-2"
            >
              <ChevronLeft className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={2.5} />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-2 md:right-2.5 top-1/2 -translate-y-1/2 flex h-9 w-9 md:h-[38px] md:w-[38px] items-center justify-center rounded-full bg-white/85 hover:bg-white text-[#16A34A] hover:text-[#22C55E] border border-white/80 shadow-[0_2px_6px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-all duration-200 z-20 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#16A34A] focus-visible:outline-offset-2"
            >
              <ChevronRight className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>

      {/* Navigation Dots Below the Banner (close below banner, compact spacing) */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-0.5 pt-0.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to banner ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className="flex h-7 w-7 items-center justify-center rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#16A34A] focus-visible:outline-offset-2"
            >
              <span
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? "w-5 md:w-6 bg-[#16A34A]"
                    : "w-1.5 bg-[#BBF7D0] hover:bg-[#4ADE80]"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
