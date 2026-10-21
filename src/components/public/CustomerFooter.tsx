import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SOCIAL_URLS } from "@/lib/socialLinks";

const socialLinks = [
  {
    label: "Facebook",
    href: SOCIAL_URLS.facebook,
    color: "#1877F2",
    path: "M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z",
  },
  {
    label: "TikTok",
    href: SOCIAL_URLS.tiktok,
    color: "#111827",
    path: "M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2H12.3v13.967a2.955 2.955 0 0 1-2.95 2.658 2.953 2.953 0 0 1-2.955-2.95 2.953 2.953 0 0 1 2.955-2.95c.305 0 .6.048.879.135V9.286a6.46 6.46 0 0 0-.879-.06 6.45 6.45 0 0 0-6.45 6.45 6.45 6.45 0 0 0 6.45 6.45 6.45 6.45 0 0 0 6.45-6.45V8.54a8.27 8.27 0 0 0 4.834 1.55V6.638c-.35 0-.7-.035-1.045-.104Z",
  },
  {
    label: "Telegram",
    href: SOCIAL_URLS.telegram,
    color: "#229ED9",
    path: "M9.78 15.43 9.4 20.8c.54 0 .78-.23 1.06-.51l2.55-2.44 5.29 3.87c.97.54 1.67.26 1.91-.9L23.67 4c.35-1.44-.55-2.09-1.48-1.67L1.84 10.18c-1.39.56-1.38 1.33-.25 1.67l5.22 1.63L18.9 5.86c.57-.35 1.09-.16.66.23Z",
  },
].filter(({ href }) => {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
});

export function CustomerFooter() {
  return (
    <footer className="storefront-footer relative z-10">
      <div className="storefront-container">
        <div className="storefront-footer-grid">
          <div className="storefront-footer-brand">
            <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg">
              <Image src="/images/logo.png" alt="" width={40} height={40} className="size-10 object-contain" />
              <div>
                <span className="block text-lg font-bold tracking-tight text-[#172033]">SakSuuu</span>
                <span className="block text-[11px] text-[#64748B]">Your game top-up store</span>
              </div>
            </Link>
            <p className="storefront-footer-copy mt-3 max-w-sm">
              Less time waiting, more time playing. Top up diamonds, passes and UC with secure checkout and direct delivery.
            </p>
          </div>

          <div>
            <h2 className="storefront-footer-title storefront-footer-explore-title">Explore SakSuuu</h2>
            <ul className="space-y-0.5">
              <li><Link href="/" className="storefront-footer-link">Home</Link></li>
              <li><Link href="/games" className="storefront-footer-link">Browse games</Link></li>
              <li><Link href="/orders" className="storefront-footer-link">Track your order</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="storefront-footer-title storefront-footer-explore-title">Need a hand?</h2>
            <p className="storefront-footer-copy">Our support team is here for your top-up questions.</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {socialLinks.map(({ label, href, color, path }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit us on ${label} (opens in a new tab)`}
                    className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-[#F0FDF4]"
                    style={{ color }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                      <path d={path} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="storefront-footer-bottom">
          <p>&copy; 2026 SakSuuu. All rights reserved.</p>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck aria-hidden="true" size={14} className="text-[#22C55E]" />
            Secure payments
            <Image src="/images/aba-logo.png" alt="ABA Pay" width={24} height={24} className="size-6 rounded-md" loading="lazy" />
            <span className="font-semibold text-[#172033]">KHQR</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
