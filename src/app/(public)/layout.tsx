import { CustomerNavbar } from "@/components/public/CustomerNavbar";
import { CustomerFooter } from "@/components/public/CustomerFooter";
import { FallingFlowersBackground } from "@/components/public/FallingFlowersBackground";
import { Suspense } from "react";
import { getPublicLogoUrl } from "@/lib/services/publicSettingsService";
import "./storefront.css";

async function ConfiguredNavbar() {
  let logoUrl: string | undefined;
  try {
    logoUrl = (await getPublicLogoUrl()) || undefined;
  } catch {
    // Keep the existing branded navbar available during a database outage.
  }
  return <CustomerNavbar logoUrl={logoUrl} />;
}


export default function PublicCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-theme relative min-h-screen flex flex-col bg-black text-[#F8F5FF] selection:bg-[#7C3AED] selection:text-white">
      <div className="public-ambient pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <FallingFlowersBackground />

      <div className="relative z-10 flex flex-col flex-1 w-full min-w-0">
        {/* Customer Top Navigation */}
        <Suspense fallback={<CustomerNavbar />}>
          <ConfiguredNavbar />
        </Suspense>

        {/* Main Public Content */}
        <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 w-full min-w-0 pt-[calc(60px+env(safe-area-inset-top,0px))] md:pt-[calc(72px+env(safe-area-inset-top,0px))]">
          {children}
        </main>

        {/* Customer Footer */}
        <CustomerFooter />
      </div>
    </div>
  );
}
