import { CustomerNavbar } from "@/components/public/CustomerNavbar";
import { CustomerFooter } from "@/components/public/CustomerFooter";
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
    <div className="public-theme relative isolate min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Soft decorative background glows */}
      <div className="public-ambient" aria-hidden="true" />

      {/* Customer Top Navigation */}
      <Suspense fallback={<CustomerNavbar />}>
        <ConfiguredNavbar />
      </Suspense>

      {/* Main Public Content */}
      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 w-full min-w-0 pt-[calc(4.75rem+env(safe-area-inset-top,0px))] sm:pt-32">{children}</main>

      {/* Customer Footer */}
      <CustomerFooter />
    </div>
  );
}
