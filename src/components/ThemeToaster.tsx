"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster, type ToasterProps } from "sonner";

const publicToastOptions: NonNullable<ToasterProps["toastOptions"]> = {
  style: {
    background: "var(--card)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
    borderRadius: 12,
    boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
    fontFamily: "var(--font-sans)",
  },
  classNames: {
    title: "font-semibold!",
    description: "line-clamp-2 wrap-anywhere text-xs! leading-5! text-[var(--muted-foreground)]!",
    content: "min-w-0",
    closeButton: "focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40",
  },
};

const publicToastIcons = {
  success: <CircleCheck className="size-4 text-[#22C55E]" />,
  error: <CircleX className="size-4 text-[#EF4444]" />,
  info: <Info className="size-4 text-[#2563EB]" />,
  warning: <TriangleAlert className="size-4 text-[#F59E0B]" />,
  loading: <LoaderCircle className="size-4 animate-spin text-[#06B6D4] motion-reduce:animate-none" />,
};

export function ThemeToaster() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <Toaster
      position="top-right"
      richColors
      theme={isAdmin || resolvedTheme === "dark" ? "dark" : "light"}
      closeButton
      duration={isAdmin ? undefined : 3000}
      offset={isAdmin ? undefined : { top: 100, right: 24 }}
      mobileOffset={isAdmin ? undefined : {
        top: "calc(env(safe-area-inset-top, 0px) + 80px)",
        left: 12,
        right: 12,
      }}
      toastOptions={isAdmin ? undefined : publicToastOptions}
      icons={isAdmin ? undefined : publicToastIcons}
    />
  );
}
