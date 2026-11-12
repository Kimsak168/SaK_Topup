import { CustomerNavbar } from "@/components/public/CustomerNavbar";
import { CustomerFooter } from "@/components/public/CustomerFooter";
import { FallingFlowersBackground } from "@/components/public/FallingFlowersBackground";
import { TelegramSupportWidget } from "@/components/public/TelegramSupportWidget";
import { LuckyDrawModal } from "@/components/public/LuckyDrawModal";
import { getPublicLogoUrl } from "@/lib/services/publicSettingsService";
import "./storefront.css";

export default async function PublicCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoUrl = await getPublicLogoUrl().catch(() => undefined);

  return (
    <div className="public-theme relative min-h-screen flex flex-col bg-black text-[#F8F5FF] selection:bg-[#7C3AED] selection:text-white">
      <div className="public-ambient pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <FallingFlowersBackground />

      <div className="relative z-10 flex flex-col flex-1 w-full min-w-0">
        {/* Customer Top Navigation */}
        <CustomerNavbar logoUrl={logoUrl} />

        {/* Main Public Content */}
        <main id="main-content" tabIndex={-1} className="relative z-20 flex-1 w-full min-w-0 pt-[calc(60px+env(safe-area-inset-top,0px))] md:pt-[calc(72px+env(safe-area-inset-top,0px))]">
          {children}
          <TelegramSupportWidget />
          <LuckyDrawModal />
        </main>

        {/* Customer Footer */}
        <CustomerFooter />
      </div>
    </div>
  );
}
