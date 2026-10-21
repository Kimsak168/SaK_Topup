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
    closeButton: "focus-visible:ring-2 focus-visible:ring-[#C084FC]/40",
  },
};

const publicToastIcons = {
  success: <CircleCheck className="size-4 text-[#22C55E]" />,
  error: <CircleX className="size-4 text-[#EF4444]" />,
  info: <Info className="size-4 text-[#C084FC]" />,
  warning: <TriangleAlert className="size-4 text-[#F59E0B]" />,
  loading: <LoaderCircle className="size-4 animate-spin text-[#C084FC] motion-reduce:animate-none" />,
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
      closeButton={isAdmin}
      duration={3000}
      offset={{ top: 80, right: 16 }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top, 0px) + 76px)",
        right: 16,
      }}
      toastOptions={isAdmin ? undefined : publicToastOptions}
      icons={isAdmin ? undefined : publicToastIcons}
    />
  );
}
