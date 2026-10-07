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

const NAV_GROUPS = [
  { title: "Workspace", items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
  ] },
  { title: "Catalogue & Sales", items: [
    { href: "/admin/games", label: "Games Catalogue", icon: Gamepad2 },
    { href: "/admin/packages", label: "Packages & Pricing", icon: Package },
    { href: "/admin/orders", label: "Customer Orders", icon: ShoppingCart },
  ] },
  { title: "Operations", items: [
    { href: "/admin/payments", label: "Payment Gateways", icon: CreditCard },
    { href: "/admin/banners", label: "Promo Banners", icon: ImageIcon },
  ] },
  { title: "Platform", items: [
    { href: "/admin/suppliers", label: "Suppliers (Vizo / G2)", icon: Server },
    { href: "/admin/settings", label: "Website Settings", icon: Settings },
  ] },
];
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const SUPPLIER_STATUS_EVENT = "saksuuu:supplier-status";

function getVerifiedSupplierCount() {
  try {
    const saved = sessionStorage.getItem("saksuuu_supplier_check");
    if (!saved) return 0;
    const check = JSON.parse(saved) as { timestamp?: string; vizo?: { status?: string }; g2bulk?: { status?: string } };
    const checkedAt = Date.parse(check.timestamp || "");
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 10 * 60_000) return 0;
    return Number(check.vizo?.status === "connected") + Number(check.g2bulk?.status === "connected");
  } catch {
    return 0;
  }
}

export function AdminDashboardShell({ children }: AdminDashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [connectedSuppliers, setConnectedSuppliers] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);

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
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // Load theme preference from localStorage if available
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("saksuuu_admin_theme");
      if (savedTheme === "light") setIsDarkMode(false);
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, []);

  useEffect(() => {
    const update = () => setConnectedSuppliers(getVerifiedSupplierCount());
    update();
    window.addEventListener(SUPPLIER_STATUS_EVENT, update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener(SUPPLIER_STATUS_EVENT, update);
      window.removeEventListener("focus", update);
    };
  }, [pathname]);

  useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1100px)");
    const collapseForTablet = () => {
      if (tablet.matches) setCollapsed(true);
    };
    collapseForTablet();
    tablet.addEventListener("change", collapseForTablet);
    return () => tablet.removeEventListener("change", collapseForTablet);
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try { localStorage.setItem("saksuuu_admin_theme", next ? "dark" : "light"); } catch { /* Keep the current session usable. */ }
      return next;
    });
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      await fetch("/api/admin/auth/logout", { method: "POST" });
      sessionStorage.removeItem("saksuuu_supplier_check");
      setConnectedSuppliers(0);
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
      className={`admin-shell min-h-screen w-full font-sans transition-colors duration-200 ${
        isDarkMode
          ? "admin-shell-dark bg-[#0a0d17] text-slate-100"
          : "admin-shell-light bg-slate-50 text-slate-800"
      }`}
    >
      <div inert={mobileOpen} className="flex h-dvh overflow-hidden">
        {/* ========================================================= */}
        {/* DESKTOP SIDEBAR */}
        {/* ========================================================= */}
        <aside
          className={`admin-sidebar hidden md:flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-200 z-30 select-none ${
            collapsed ? "w-[72px] is-collapsed" : "w-[272px]"
          } ${
            isDarkMode
              ? "bg-[#0a0c20]/95 border-white/10"
              : "bg-white border-slate-200 shadow-sm"
          }`}
        >
          {/* Brand Header */}
          <div className={`admin-sidebar-header shrink-0 flex items-center border-b border-inherit ${collapsed ? "flex-col gap-1.5 px-2 py-3" : "h-[68px] justify-between px-4"}`}>
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2.5 overflow-hidden group"
              aria-label="Admin Dashboard"
            >
              <Image
                src="/images/logo.png"
                alt="SakSuuu Admin Logo"
                width={40}
                height={40}
                priority
                className="h-9 w-9 shrink-0 object-contain"
              />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <strong className="block truncate text-[15px] font-extrabold tracking-tight">SakSuuu</strong>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-400">Admin HQ</p>
                </div>
              )}
            </Link>

            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className={`admin-icon-button shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer ${
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

          <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="admin-nav-group">
                {collapsed ? <div className="admin-nav-divider" aria-hidden="true" /> :
                  <p className="admin-nav-heading">{group.title}</p>}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                  return <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    data-tooltip={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`admin-nav-link relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-[13px] font-medium ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                    {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                  </Link>;
                })}
              </div>
            ))}
          </nav>

          <div className={`admin-sidebar-footer shrink-0 border-t border-inherit ${collapsed ? "px-2 py-3" : "p-3"}`}>
            <Link href="/admin/suppliers" className="admin-supplier-status" title={collapsed ? "Supplier APIs" : undefined} aria-label="View supplier connection status">
              <span className="admin-supplier-status-icon"><Server size={17} strokeWidth={1.9} /></span>
              {!collapsed && <span className="min-w-0 flex-1">
                <strong>Supplier APIs</strong>
                <small>{connectedSuppliers === 2 ? "Vizo & G2Bulk connected" : connectedSuppliers === 1 ? "1 of 2 connected" : "Verify connections"}</small>
              </span>}
              <span className={`admin-supplier-dot ${connectedSuppliers === 2 ? "is-connected" : connectedSuppliers === 1 ? "is-partial" : ""}`} aria-hidden="true" />
            </Link>

            <div className={`admin-profile ${collapsed ? "is-collapsed" : ""}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="admin-avatar">AD</div>
                {!collapsed && <div className="min-w-0">
                  <p className="truncate text-xs font-bold">Super Admin</p>
                  <p className="text-[11px] text-slate-400">HQ Control</p>
                </div>}
              </div>
              <button onClick={handleLogout} disabled={isLoggingOut} title="Sign out" aria-label="Sign out" className="admin-icon-button" type="button">
                <LogOut className="h-[18px] w-[18px]" />
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
                <span className="hidden sm:inline-block whitespace-nowrap text-xs text-slate-400 font-medium">Admin HQ</span>
                <span className="hidden sm:inline-block text-xs text-slate-500">/</span>
                <span className="truncate text-sm font-semibold tracking-tight">{currentNav.label}</span>
              </div>
            </div>

            {/* Right Header Status & Tools */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              {/* Connection status is verified on the overview and suppliers pages. */}
              <Link
                href="/admin/suppliers"
                className={`hidden lg:flex items-center gap-1.5 text-xs border px-2.5 py-1.5 rounded-full font-semibold transition-colors ${
                  isDarkMode
                    ? "text-slate-300 bg-white/5 border-white/10 hover:bg-white/10"
                    : "text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Supplier status</span>
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

            </div>
          </header>

          {/* Main Scrollable Content */}
          <main ref={contentRef} id="main-content" tabIndex={-1} className="admin-content min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
            <div className="min-w-0 max-w-[1440px] mx-auto space-y-6">{children}</div>
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
            className={`admin-mobile-drawer relative w-[272px] max-w-[85vw] h-full min-h-0 flex flex-col border-r z-50 animate-in slide-in-from-left duration-200 ${
              isDarkMode
                ? "bg-[#090b1c] border-white/10 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="h-[68px] shrink-0 px-4 flex items-center justify-between border-b border-inherit">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/logo.png"
                  alt="SakSuuu Admin Logo"
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <div><strong className="block text-[15px] font-extrabold">SakSuuu</strong><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-pink-400">Admin HQ</span></div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="p-2.5 rounded-lg text-slate-400 hover:text-pink-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {NAV_GROUPS.map((group) => <div key={group.title} className="admin-nav-group">
                <p className="admin-nav-heading">{group.title}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className="admin-nav-link relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-[13px] font-medium">
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>;
                })}
              </div>)}
            </nav>

            <div className="admin-sidebar-footer shrink-0 border-t border-inherit p-3">
              <Link href="/admin/suppliers" onClick={() => setMobileOpen(false)} className="admin-supplier-status">
                <span className="admin-supplier-status-icon"><Server size={17} strokeWidth={1.9} /></span>
                <span className="min-w-0 flex-1"><strong>Supplier APIs</strong>
                  <small>{connectedSuppliers === 2 ? "Vizo & G2Bulk connected" : connectedSuppliers === 1 ? "1 of 2 connected" : "Verify connections"}</small></span>
                <span className={`admin-supplier-dot ${connectedSuppliers === 2 ? "is-connected" : connectedSuppliers === 1 ? "is-partial" : ""}`} aria-hidden="true" />
              </Link>
              <div className="admin-profile">
                <div className="flex min-w-0 items-center gap-2.5"><div className="admin-avatar">AD</div>
                  <div className="min-w-0"><p className="truncate text-xs font-bold">Super Admin</p><p className="text-[11px] text-slate-400">HQ Control</p></div>
                </div>
                <button type="button" onClick={handleLogout} disabled={isLoggingOut} aria-label="Sign out" title="Sign out" className="admin-icon-button">
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
