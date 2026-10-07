import Image from "next/image";
import Link from "next/link";
import { QrCode, CreditCard } from "lucide-react";

const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT || "https://t.me/saksuuu_support";

export function CustomerFooter() {
  return (
    <footer className="relative z-10 w-full bg-white overflow-hidden border-t border-pink-100/90">
      {/* Background Ambient Glow Accents */}
      <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full bg-pink-100/30 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-72 h-72 rounded-full bg-pink-100/20 blur-2xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-7 sm:pt-12 pb-6">
        {/* Responsive 3-Section Grid: Desktop (3 cols), Tablet (2 cols), Mobile (1 col) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 items-start">
          
          {/* Section 1: Branding (Left) */}
          <div className="flex flex-col items-start space-y-3.5">
            <Link
              href="/"
              className="inline-flex items-center gap-3 group focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              <Image
                src="/images/logo.png"
                alt="SakSuuu Logo"
                width={55}
                height={55}
                className="h-[55px] w-[55px] object-contain drop-shadow-[0_0_14px_rgba(0,217,255,0.35)] group-hover:scale-105 transition-transform duration-300"
              />
              <div className="flex flex-col">
                <span className="text-xl sm:text-2xl font-black tracking-wide bg-gradient-to-r from-blue-600 via-brand-blue to-purple-600 bg-clip-text text-transparent">
                  SakSuuu
                </span>
                <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                  Game Top-Up Store
                </span>
              </div>
            </Link>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm">
              Instant, secure game recharges with automated delivery 24/7. Top up diamonds, passes, and UC at competitive rates.
            </p>
          </div>

          {/* Section 2: Quick Links & Payment Methods (Middle) */}
          <div className="flex flex-col space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-foreground mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
                Quick Links
              </h3>
              <ul className="space-y-2 text-sm font-medium">
                <li>
                  <Link
                    href="/"
                    className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-flex items-center transition-all duration-200"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    href="/games"
                    className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-flex items-center transition-all duration-200"
                  >
                    Games
                  </Link>
                </li>
              </ul>
            </div>

            {/* Small Payment-Method Section */}
            <div className="pt-3 border-t border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Payment Methods
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  title="KHQR Universal Pay"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-medium text-secondary-foreground hover:border-pink-300 transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5 text-primary" />
                  <span>KHQR</span>
                </div>
                <div
                  title="ABA Mobile Pay"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-medium text-secondary-foreground hover:border-blue-300 transition-colors"
                >
                  <CreditCard className="h-3.5 w-3.5 text-brand-blue" />
                  <span>ABA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Support (Right) */}
          <div className="flex flex-col space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Support
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm">
              Have questions or need assistance with your order? Our support team is ready to help on Telegram.
            </p>
            <div className="pt-1">
              <Link
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact support on Telegram"
                className="public-button public-button-blue group inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl text-primary-foreground font-semibold text-xs sm:text-sm shadow-md shadow-blue-200/40 hover:shadow-soft hover:shadow-blue-300/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 border border-blue-400/30 focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                {/* Official Telegram Icon */}
                <svg
                  className="h-4.5 w-4.5 transition-transform duration-300 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
                <span>Contact on Telegram</span>
              </Link>
            </div>
          </div>

        </div>

        {/* Thin Gradient Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-pink-300/30 via-purple-300/20 to-transparent mt-10 sm:mt-12 mb-6" />

        {/* Copyright Section */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground tracking-wide font-normal">
            © 2026 SakSuuu. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
