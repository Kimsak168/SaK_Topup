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
  { title: "WORKSPACE", items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
  ] },
  { title: "CATALOGUE & SALES", items: [
    { href: "/admin/games", label: "Games Catalogue", icon: Gamepad2 },
    { href: "/admin/packages", label: "Packages & Pricing", icon: Package },
    { href: "/admin/orders", label: "Customer Orders", icon: ShoppingCart },
  ] },
  { title: "OPERATIONS", items: [
    { href: "/admin/payments", label: "Payment Gateways", icon: CreditCard },
    { href: "/admin/banners", label: "Promo Banners", icon: ImageIcon },
  ] },
  { title: "PLATFORM", items: [
    { href: "/admin/suppliers", label: "Suppliers", icon: Server },
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
    ) || { label: "Overview" };

  return (
    <div
      className={`admin-shell min-h-screen w-full font-sans transition-colors duration-150 ${
        isDarkMode
          ? "admin-shell-dark bg-[#080D18] text-[#F8FAFC]"
          : "admin-shell-light bg-slate-50 text-slate-800"
      }`}
    >
      <div inert={mobileOpen} className="flex h-dvh overflow-hidden">
        {/* ========================================================= */}
        {/* DESKTOP SIDEBAR */}
        {/* ========================================================= */}
        <aside
          className={`admin-sidebar hidden md:flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-150 z-30 select-none ${
            collapsed ? "w-[68px] is-collapsed" : "w-[248px]"
          } ${
            isDarkMode
              ? "bg-[#0C1322] border-[#243047]"
              : "bg-white border-slate-200 shadow-sm"
          }`}
        >
          {/* Brand Header */}
          <div className={`admin-sidebar-header shrink-0 flex items-center border-b border-[#243047] ${collapsed ? "flex-col gap-1.5 px-2 py-3.5" : "h-16 justify-between px-4"}`}>
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2.5 overflow-hidden group"
              aria-label="Admin Dashboard"
            >
              <Image
                src="/images/logo.png"
                alt="SakSuuu Admin Logo"
                width={34}
                height={34}
                priority
                className="h-8 w-8 shrink-0 object-contain"
              />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <strong className="block truncate text-[15px] font-bold tracking-tight text-[#F8FAFC]">SakSuuu</strong>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Admin HQ</p>
                </div>
              )}
            </Link>

            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className={`shrink-0 p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer ${
                isDarkMode ? "hover:bg-[#151F31]" : "hover:bg-slate-100"
              }`}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                {collapsed ? (
                  <div className="my-2 border-t border-[#243047]" aria-hidden="true" />
                ) : (
                  <p className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-[#64748B] uppercase select-none">
                    {group.title}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      data-tooltip={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={`relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-all duration-150 ${
                        collapsed ? "justify-center px-0" : ""
                      } ${
                        isActive
                          ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] font-semibold"
                          : "text-[#94A3B8] hover:bg-[#151F31] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#22C55E]"
                          aria-hidden="true"
                        />
                      )}
                      <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-[#22C55E]" : "text-[#94A3B8]"}`} strokeWidth={1.9} />
                      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className={`shrink-0 border-t border-[#243047] space-y-2 ${collapsed ? "p-2" : "p-3"}`}>
            {/* Compact Supplier APIs row */}
            <Link
              href="/admin/suppliers"
              className={`flex items-center gap-2.5 rounded-lg p-2 transition-colors duration-150 ${
                isDarkMode ? "bg-[#111A2B] hover:bg-[#151F31] border border-[#243047]" : "bg-slate-50 hover:bg-slate-100 border border-slate-200"
              }`}
              title={collapsed ? "Supplier APIs" : undefined}
              aria-label="View supplier connection status"
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  connectedSuppliers === 2
                    ? "bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                    : connectedSuppliers === 1
                    ? "bg-[#F59E0B]"
                    : "bg-[#64748B]"
                }`}
                aria-hidden="true"
              />
              {!collapsed && (
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] font-semibold text-[#F8FAFC]">Supplier APIs</div>
                  <div className="text-[10px] text-[#94A3B8] truncate">
                    {connectedSuppliers === 2 ? "Vizo & G2Bulk verified" : "Vizo & G2Bulk"}
                  </div>
                </div>
              )}
            </Link>

            {/* Admin Profile Row */}
            <div className={`flex items-center justify-between gap-2 rounded-lg p-1.5 ${collapsed ? "justify-center" : ""}`}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[#151F31] border border-[#243047] flex items-center justify-center text-[10px] font-bold text-[#22C55E] shrink-0">
                  AD
                </div>
                {!collapsed && (
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold text-[#F8FAFC]">Super Admin</p>
                    <p className="text-[10px] text-[#64748B]">HQ Control</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Sign out"
                aria-label="Sign out"
                type="button"
                className="h-7 w-7 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#151F31] flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* MAIN BODY AREA */}
        {/* ========================================================= */}
        <div className="min-w-0 flex-1 flex flex-col h-dvh overflow-hidden bg-[#080D18]">
          {/* Top Header */}
          <header
            className={`h-14 border-b px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-20 transition-colors ${
              isDarkMode
                ? "bg-[#0C1322] border-[#243047]"
                : "bg-white border-slate-200"
            }`}
          >
            {/* Left Header Title / Mobile trigger */}
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin navigation"
                aria-expanded={mobileOpen}
                aria-controls="admin-mobile-navigation"
                className={`md:hidden shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243047] bg-[#151F31] cursor-pointer`}
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="hidden sm:inline-block text-[#64748B] font-medium">Admin HQ</span>
                <span className="hidden sm:inline-block text-[#243047]">/</span>
                <span className="truncate font-semibold text-[#F8FAFC]">{currentNav.label}</span>
              </div>
            </div>

            {/* Right Header Status & Tools */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Supplier Status Button */}
              <Link
                href="/admin/suppliers"
                className="hidden sm:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connectedSuppliers === 2
                      ? "bg-[#22C55E]"
                      : connectedSuppliers === 1
                      ? "bg-[#F59E0B]"
                      : "bg-[#64748B]"
                  }`}
                />
                <span>Supplier Status</span>
              </Link>

              {/* View Public Storefront Button */}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open storefront in a new tab"
                className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <span className="hidden sm:inline">Storefront</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#64748B]" />
              </Link>

              {/* Dark / Light Mode Toggle */}
              <button
                onClick={toggleTheme}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {isDarkMode ? (
                  <Sun className="h-3.5 w-3.5 text-[#F59E0B]" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-slate-700" />
                )}
              </button>
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main ref={contentRef} id="main-content" tabIndex={-1} className="admin-content min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-7">
            <div className="min-w-0 max-w-[1400px] mx-auto space-y-6">{children}</div>
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
            className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          />

          {/* Drawer Panel */}
          <div
            ref={drawerRef}
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="admin-mobile-drawer relative w-[256px] max-w-[85vw] h-full min-h-0 flex flex-col border-r border-[#243047] z-50 bg-[#0C1322] text-[#F8FAFC] animate-in slide-in-from-left duration-150"
          >
            <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-[#243047]">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/logo.png"
                  alt="SakSuuu Admin Logo"
                  width={30}
                  height={30}
                  className="h-7 w-7 shrink-0 object-contain"
                />
                <div>
                  <strong className="block text-sm font-bold text-[#F8FAFC]">SakSuuu</strong>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Admin HQ</span>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151F31]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1">
                  <p className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-[#64748B] uppercase select-none">{group.title}</p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={`relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] font-semibold"
                            : "text-[#94A3B8] hover:bg-[#151F31] hover:text-[#F8FAFC]"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#22C55E]" aria-hidden="true" />
                        )}
                        <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-[#22C55E]" : "text-[#94A3B8]"}`} strokeWidth={1.9} />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="shrink-0 border-t border-[#243047] p-3 space-y-2">
              <Link
                href="/admin/suppliers"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-lg p-2 bg-[#111A2B] border border-[#243047]"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    connectedSuppliers === 2
                      ? "bg-[#22C55E]"
                      : connectedSuppliers === 1
                      ? "bg-[#F59E0B]"
                      : "bg-[#64748B]"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] font-semibold text-[#F8FAFC]">Supplier APIs</div>
                  <div className="text-[10px] text-[#94A3B8] truncate">
                    {connectedSuppliers === 2 ? "Vizo & G2Bulk verified" : "Vizo & G2Bulk"}
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2 p-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-[#151F31] border border-[#243047] flex items-center justify-center text-[10px] font-bold text-[#22C55E]">
                    AD
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold text-[#F8FAFC]">Super Admin</p>
                    <p className="text-[10px] text-[#64748B]">HQ Control</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="h-7 w-7 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#151F31] flex items-center justify-center"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

