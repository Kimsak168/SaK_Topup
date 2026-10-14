import { ReactNode } from "react";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import "./admin-dashboard.css";

export const metadata = {
  title: "Admin HQ — SakSuuu Game Top-Up",
  description:
    "Official Administrator Dashboard for game catalogue synchronization, supplier routing, orders, and pricing.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme dark min-h-screen w-full bg-[#080D18] text-[#F8FAFC]">
      <AdminDashboardShell>{children}</AdminDashboardShell>
    </div>
  );
}
