import { CustomerNavbar } from "@/components/public/CustomerNavbar";
import { CustomerFooter } from "@/components/public/CustomerFooter";
import Image from "next/image";

export default function PublicCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-theme relative isolate min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Soft decorative background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div className="absolute -right-24 top-20 h-[32rem] w-[42rem] rotate-12 opacity-[0.045] blur-xl">
          <Image src="/images/hero-banner.jpg" alt="" fill sizes="672px" className="object-cover" />
        </div>
        <div className="absolute -left-24 bottom-0 h-[28rem] w-[28rem] -rotate-12 opacity-[0.04] blur-2xl">
          <Image src="/images/freefire.jpg" alt="" fill sizes="448px" className="object-cover" />
        </div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-pink-200/25 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/4" />
        <div className="absolute top-[30%] left-0 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px] -translate-x-1/3" />
        <div className="absolute bottom-0 right-[20%] w-[400px] h-[400px] bg-blue-200/15 rounded-full blur-[100px] translate-y-1/4" />
        <div className="absolute top-[60%] left-[40%] w-[350px] h-[350px] bg-cyan-100/10 rounded-full blur-[80px]" />
      </div>

      {/* Customer Top Navigation */}
      <CustomerNavbar />

      {/* Main Public Content */}
      <main className="relative z-10 flex-1 w-full min-w-0 pt-36 sm:pt-32">{children}</main>

      {/* Customer Footer */}
      <CustomerFooter />
    </div>
  );
}
