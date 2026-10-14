import { CustomerNavbar } from "@/components/public/CustomerNavbar";
import { CustomerFooter } from "@/components/public/CustomerFooter";
import { FallingFlowersBackground } from "@/components/public/FallingFlowersBackground";
import { Suspense } from "react";
import { getPublicLogoUrl } from "@/lib/services/publicSettingsService";

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
    <div className="public-theme relative min-h-screen flex flex-col bg-linear-to-b from-white via-[#F7FFF9] to-[#F0FDF4] text-[#172033] selection:bg-[#16A34A] selection:text-white">
      {/* Soft decorative background glows - Level 0 */}
      <div className="public-ambient pointer-events-none absolute inset-0 z-0" aria-hidden="true" />

      {/* Falling Romdul flowers layer - Level 1 (Above background, below content) */}
      <FallingFlowersBackground />

      {/* Website content wrapper - Level 10 (Above flowers) */}
      <div className="relative z-10 flex flex-col flex-1 w-full min-w-0">
        {/* Customer Top Navigation */}
        <Suspense fallback={<CustomerNavbar />}>
          <ConfiguredNavbar />
        </Suspense>

        {/* Main Public Content */}
        <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 w-full min-w-0 pt-[calc(4.75rem+env(safe-area-inset-top,0px))] sm:pt-[104px]">
          {children}
        </main>

        {/* Customer Footer */}
        <CustomerFooter />
      </div>
    </div>
  );
}
