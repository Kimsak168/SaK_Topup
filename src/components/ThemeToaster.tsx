"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

export function ThemeToaster() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return <Toaster position="top-right" richColors theme={isAdmin ? "dark" : "light"} closeButton />;
}
