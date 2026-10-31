import { ReactNode } from "react";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import "./admin-dashboard.css";

export const metadata = {
  title: "Admin HQ — Asura Store",
  description:
    "Official Administrator Dashboard for game catalogue synchronization, supplier routing, orders, and pricing.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme min-h-screen w-full bg-[#FFF8FC] text-[#3B2433]">
      <AdminDashboardShell>{children}</AdminDashboardShell>
    </div>
  );
}
