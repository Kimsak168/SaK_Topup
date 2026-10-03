"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Gamepad2,
  Package,
  ShoppingCart,
  CreditCard,
  Image as ImageIcon,
  Server,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface AdminDashboardShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Overview",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    href: "/admin/games",
    label: "Games Catalogue",
    icon: Gamepad2,
    badge: null,
  },
  {
    href: "/admin/packages",
    label: "Packages & Pricing",
    icon: Package,
    badge: null,
  },
  {
    href: "/admin/orders",
    label: "Customer Orders",
    icon: ShoppingCart,
    badge: null,
  },
  {
    href: "/admin/payments",
    label: "Payment Gateways",
    icon: CreditCard,
    badge: null,
  },
  {
    href: "/admin/banners",
    label: "Promo Banners",
    icon: ImageIcon,
    badge: null,
  },
  {
    href: "/admin/suppliers",
    label: "Suppliers (Vizo / G2)",
    icon: Server,
    badge: "Live",
  },
  {
    href: "/admin/settings",
    label: "Website Settings",
    icon: Settings,
    badge: null,
  },
];

export function AdminDashboardShell({ children }: AdminDashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])'
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab" || !focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", closeOnDesktop);
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Load theme preference from localStorage if available
  useEffect(() => {
    const savedTheme = localStorage.getItem("saksuuu_admin_theme");
    if (savedTheme === "light") {
      setIsDarkMode(false);
    }
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("saksuuu_admin_theme", next ? "dark" : "light");
      return next;
    });
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      await fetch("/api/admin/auth/logout", { method: "POST" });
      toast.success("Logged out successfully");
      router.push("/admin/login");
      router.refresh();
    } catch {
      toast.error("Logout error");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // If on login page, render children cleanly without admin shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Find active nav title for top breadcrumb
  const currentNav =
    NAV_ITEMS.find((item) =>
      item.href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(item.href)
    ) || { label: "Admin Portal" };

  return (
    <div
      className={`min-h-screen w-full font-sans transition-colors duration-200 ${
        isDarkMode
          ? "bg-[#070814] text-slate-100"
          : "bg-slate-50 text-slate-800"
      }`}
    >
      <div inert={mobileOpen} className="flex h-dvh overflow-hidden">
        {/* ========================================================= */}
        {/* DESKTOP SIDEBAR */}
        {/* ========================================================= */}
        <aside
          className={`hidden md:flex shrink-0 flex-col border-r transition-all duration-300 z-30 select-none ${
            collapsed ? "w-20" : "w-64"
          } ${
            isDarkMode
              ? "bg-[#0a0c20]/95 border-white/10"
              : "bg-white border-slate-200 shadow-sm"
          }`}
        >
          {/* Brand Header */}
          <div className={`shrink-0 px-4 flex items-center border-b border-inherit ${collapsed ? "flex-col gap-2 py-3" : "h-16 justify-between"}`}>
            <Link
              href="/admin"
              className="flex items-center gap-2.5 overflow-hidden group"
              aria-label="Admin Dashboard"
            >
              <Image
                src="/images/logo.png"
                alt="SakSuuu Admin Logo"
                width={50}
                height={50}
                priority
                className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(0,217,255,0.25)] transition-transform group-hover:scale-105"
              />
              {!collapsed && (
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-pink-500/10 border border-pink-500/30 px-1.5 py-0.5 text-[10px] font-bold text-pink-400 uppercase tracking-wider">
                      Admin HQ
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    Control Center
                  </p>
                </div>
              )}
            </Link>

            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer ${
                isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100"
              }`}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/10 text-pink-400 border border-pink-500/30 shadow-[0_0_15px_rgba(255,46,147,0.15)]"
                      : isDarkMode
                      ? "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive
                        ? "text-pink-400"
                        : isDarkMode
                        ? "text-slate-400 group-hover:text-slate-200"
                        : "text-slate-500 group-hover:text-slate-800"
                    }`}
                  />
                  {!collapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                      {item.badge}
                    </span>
                  )}
                  {/* Collapsed dot indicator */}
                  {collapsed && isActive && (
                    <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-pink-500" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Bottom Sidebar Info Card */}
          <div className="p-3 border-t border-inherit space-y-2">
            {!collapsed && (
              <div
                className={`rounded-xl p-3 border text-xs space-y-1.5 ${
                  isDarkMode
                    ? "bg-[#070814]/80 border-white/5"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    API Suppliers
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Vizo & G2Bulk</span>
                  <span className="text-emerald-400 font-bold">Online</span>
                </div>
              </div>
            )}

            {/* Admin Profile & Logout Row */}
            <div className={`flex items-center justify-between gap-2 pt-1 ${collapsed ? "flex-col" : ""}`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                  AD
                </div>
                {!collapsed && (
                  <div className="truncate">
                    <p className="text-xs font-bold truncate">Super Admin</p>
                    <p className="text-[10px] text-slate-400">HQ Control</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Sign Out"
                aria-label="Sign out"
                className={`p-2 rounded-lg text-slate-400 hover:text-rose-400 transition-colors cursor-pointer ${
                  isDarkMode ? "hover:bg-rose-500/10" : "hover:bg-rose-50"
                }`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* MAIN BODY AREA */}
        {/* ========================================================= */}
        <div className="min-w-0 flex-1 flex flex-col h-dvh overflow-hidden">
          {/* Top Navbar */}
          <header
            className={`h-16 border-b px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-20 transition-colors ${
              isDarkMode
                ? "bg-[#090b1c]/90 border-white/10 backdrop-blur-xl"
                : "bg-white/90 border-slate-200 backdrop-blur-xl"
            }`}
          >
            {/* Left Header Title / Mobile trigger */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin navigation"
                aria-expanded={mobileOpen}
                aria-controls="admin-mobile-navigation"
                className={`md:hidden shrink-0 p-2.5 rounded-lg text-slate-400 hover:text-white cursor-pointer ${
                  isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100"
                }`}
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-bold tracking-tight">
                  {currentNav.label}
                </span>
                <span className="hidden lg:inline-block text-xs text-slate-500">
                  /
                </span>
                <span className="hidden lg:inline-block whitespace-nowrap text-xs text-pink-400 font-semibold">
                  SakSuuu HQ
                </span>
              </div>
            </div>

            {/* Right Header Status & Tools */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              {/* Live Supplier Badge */}
              <Link
                href="/admin/suppliers"
                className="hidden lg:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full font-semibold hover:bg-emerald-500/20 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Vizo & G2Bulk Live</span>
              </Link>

              {/* View Public Storefront Button */}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open storefront in a new tab"
                className={`inline-flex h-10 items-center gap-1.5 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold transition-colors ${
                  isDarkMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white"
                    : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                }`}
              >
                <span className="hidden sm:inline">Storefront</span>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </Link>

              {/* Dark / Light Mode Toggle */}
              <button
                onClick={toggleTheme}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                title={
                  isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"
                }
                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  isDarkMode
                    ? "border-white/10 bg-white/5 text-amber-400 hover:bg-white/10"
                    : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {isDarkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>

              {/* Mobile Logout shortcut */}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Logout"
                aria-label="Sign out"
                className={`md:hidden h-10 w-10 flex items-center justify-center rounded-lg border text-rose-400 cursor-pointer ${
                  isDarkMode
                    ? "border-white/10 bg-white/5"
                    : "border-slate-200 bg-slate-100"
                }`}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
            <div className="min-w-0 max-w-7xl mx-auto space-y-6">{children}</div>
          </main>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MOBILE DRAWER */}
      {/* ========================================================= */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
          />

          {/* Drawer Panel */}
          <div
            ref={drawerRef}
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className={`relative w-72 max-w-[80vw] h-full flex flex-col border-r z-50 animate-in slide-in-from-left duration-200 ${
              isDarkMode
                ? "bg-[#090b1c] border-white/10 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-inherit">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/logo.png"
                  alt="SakSuuu Admin Logo"
                  width={40}
                  height={40}
                  className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(0,217,255,0.25)]"
                />
                <span className="font-extrabold text-sm gradient-text-saksuuu">
                  Admin Portal
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="p-2.5 rounded-lg text-slate-400 hover:text-pink-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                        : isDarkMode
                        ? "text-slate-300 hover:bg-white/5"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-pink-400" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="p-4 border-t border-inherit space-y-3">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full py-2.5 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold text-xs flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
