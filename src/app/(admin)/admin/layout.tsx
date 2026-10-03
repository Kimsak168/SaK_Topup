import { ReactNode } from "react";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";

export const metadata = {
  title: "Admin HQ — SakSuuu Game Top-Up",
  description:
    "Official Administrator Dashboard for game catalogue synchronization, supplier routing, orders, and pricing.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme dark min-h-screen w-full bg-[#070814]">
      <AdminDashboardShell>{children}</AdminDashboardShell>
    </div>
  );
}
