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
  CircleDollarSign,
  CalendarDays,
  Image as ImageIcon,
  Server,
  Share2,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  ExternalLink,
  Search,
  ArrowUpRight,
} from "lucide-react";

interface AdminDashboardShellProps {
  children: React.ReactNode;
}

export interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge: {
    inactive: string;
    active: string;
    indicator: string;
  };
}

const NAV_GROUPS: { title: string; items: NavItemConfig[] }[] = [
  {
    title: "WORKSPACE",
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: LayoutDashboard,
        badge: {
          inactive: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-200/70 dark:border-indigo-500/25",
          active: "bg-indigo-600 text-white shadow-xs shadow-indigo-600/30",
          indicator: "bg-indigo-500",
        },
      },
    ],
  },
  {
    title: "CATALOGUE & SALES",
    items: [
      {
        href: "/admin/games",
        label: "Games Catalogue",
        icon: Gamepad2,
        badge: {
          inactive: "bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-200/70 dark:border-violet-500/25",
          active: "bg-violet-600 text-white shadow-xs shadow-violet-600/30",
          indicator: "bg-violet-500",
        },
      },
      {
        href: "/admin/packages",
        label: "Packages & Pricing",
        icon: Package,
        badge: {
          inactive: "bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-200/70 dark:border-sky-500/25",
          active: "bg-sky-600 text-white shadow-xs shadow-sky-600/30",
          indicator: "bg-sky-500",
        },
      },
      {
        href: "/admin/smm-services",
        label: "Social Services",
        icon: Share2,
        badge: {
          inactive: "bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-200/70 dark:border-pink-500/25",
          active: "bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-xs shadow-pink-600/30",
          indicator: "bg-pink-500",
        },
      },
      {
        href: "/admin/orders",
        label: "Customer Orders",
        icon: ShoppingCart,
        badge: {
          inactive: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-500/25",
          active: "bg-emerald-600 text-white shadow-xs shadow-emerald-600/30",
          indicator: "bg-emerald-500",
        },
      },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      {
        href: "/admin/payments",
        label: "Payment Gateways",
        icon: CreditCard,
        badge: {
          inactive: "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-500/25",
          active: "bg-blue-600 text-white shadow-xs shadow-blue-600/30",
          indicator: "bg-blue-500",
        },
      },
      {
        href: "/admin/finance",
        label: "Finance & Reconciliation",
        icon: CircleDollarSign,
        badge: {
          inactive: "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-500/25",
          active: "bg-amber-600 text-white shadow-xs shadow-amber-600/30",
          indicator: "bg-amber-500",
        },
      },
      {
        href: "/admin/events",
        label: "Game Events",
        icon: CalendarDays,
        badge: {
          inactive: "bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200/70 dark:border-orange-500/25",
          active: "bg-orange-600 text-white shadow-xs shadow-orange-600/30",
          indicator: "bg-orange-500",
        },
      },
      {
        href: "/admin/banners",
        label: "Promo Banners",
        icon: ImageIcon,
        badge: {
          inactive: "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200/70 dark:border-fuchsia-500/25",
          active: "bg-fuchsia-600 text-white shadow-xs shadow-fuchsia-600/30",
          indicator: "bg-fuchsia-500",
        },
      },
    ],
  },
  {
    title: "PLATFORM",
    items: [
      {
        href: "/admin/suppliers",
        label: "Suppliers",
        icon: Server,
        badge: {
          inactive: "bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-200/70 dark:border-teal-500/25",
          active: "bg-teal-600 text-white shadow-xs shadow-teal-600/30",
          indicator: "bg-teal-500",
        },
      },
      {
        href: "/admin/settings",
        label: "Website Settings",
        icon: Settings,
        badge: {
          inactive: "bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-500/25",
          active: "bg-slate-600 text-white shadow-xs shadow-slate-600/30",
          indicator: "bg-slate-500",
        },
      },
    ],
  },
];
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const SUPPLIER_STATUS_EVENT = "saksuuu:supplier-status";

function getVerifiedSupplierCount() {
  try {
    const saved = sessionStorage.getItem("saksuuu_supplier_check");
    if (!saved) return 0;
    const check = JSON.parse(saved) as { timestamp?: string; webbuilder?: { status?: string } };
    const checkedAt = Date.parse(check.timestamp || "");
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 10 * 60_000) return 0;
    return Number(check.webbuilder?.status === "connected");
  } catch {
    return 0;
  }
}

export function AdminDashboardShell({ children }: AdminDashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [connectedSuppliers, setConnectedSuppliers] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const commandRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(previous => !previous);
        setCommandQuery("");
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    commandRef.current?.querySelector("input")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCommandOpen(false);
      if (event.key !== "Tab") return;
      const elements = commandRef.current?.querySelectorAll<HTMLElement>('input, a[href], button:not([disabled])');
      const first = elements?.[0];
      const last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previousFocus?.focus(); };
  }, [commandOpen]);

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
    setCommandOpen(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // Load theme preference from localStorage if available
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("saksuuu_admin_theme");
      if (savedTheme === "dark") setIsDarkMode(true);
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
      <div inert={mobileOpen || commandOpen} className="flex h-dvh overflow-hidden">
        {/* ========================================================= */}
        {/* DESKTOP SIDEBAR */}
        {/* ========================================================= */}
        <aside
          className={`admin-sidebar hidden md:flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-150 z-30 select-none ${
            collapsed ? "w-[76px] is-collapsed" : "w-[248px]"
          } ${
            isDarkMode
              ? "bg-[#0C1322] border-[#243047]"
              : "bg-white border-slate-200 shadow-sm"
          }`}
        >
          {/* Brand Header */}
          <div className={`admin-sidebar-header shrink-0 flex items-center border-b border-[#243047] ${collapsed ? "gap-1 px-1 h-[58px] justify-center" : "h-[58px] justify-between px-3.5"}`}>
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2.5 overflow-hidden group"
              aria-label="Admin Dashboard"
            >
              <Image
                src="/images/asura-store-logo.png"
                alt="Asura Store Admin Logo"
                width={30}
                height={30}
                preload
                className="h-7 w-7 shrink-0 object-contain"
              />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <strong className="block truncate text-sm font-bold tracking-tight text-[#F8FAFC]">Asura Store</strong>
                  <p className="text-[11px] font-medium text-[#64748B]">Store management</p>
                </div>
              )}
            </Link>

            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className={`shrink-0 p-1 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer ${
                isDarkMode ? "hover:bg-[#151F31]" : "hover:bg-slate-100"
              }`}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-0.5">
                {collapsed ? (
                  <div className="my-1.5 border-t border-[#243047]" aria-hidden="true" />
                ) : (
                  <p className="admin-nav-heading select-none">
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
                      className={`admin-nav-link group relative flex h-[40px] items-center gap-2.5 rounded-xl px-2.5 transition-all duration-150 ${
                        collapsed ? "justify-center px-0" : ""
                      } ${
                        isActive
                          ? "bg-[rgba(34,197,94,0.08)] text-[#22C55E] font-semibold"
                          : "text-[#94A3B8] hover:bg-[#151F31] hover:text-[#F8FAFC]"
                      }`}
                    >
                      <span
                        className={`admin-nav-icon flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg ${
                          isActive ? item.badge.active : item.badge.inactive
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className={`admin-sidebar-footer shrink-0 border-t border-[#243047] ${collapsed ? "p-2 space-y-2" : "px-3 py-2.5 space-y-2"}`}>
            {/* Compact Supplier APIs row */}
            <Link
              href="/admin/suppliers"
              className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-150 ${
                collapsed ? "justify-center px-0 py-2" : ""
              } ${
                isDarkMode ? "bg-[#111A2B] hover:bg-[#151F31] border border-[#243047]" : "bg-slate-50 hover:bg-slate-100 border border-slate-200"
              }`}
              title={collapsed ? "Supplier API: WebBuilder" : undefined}
              aria-label="View supplier connection status"
            >
              {!collapsed ? (
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] font-semibold text-[#F8FAFC]">Supplier API</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#94A3B8]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        connectedSuppliers >= 1
                          ? "bg-[#22C55E]"
                          : "bg-[#64748B]"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">WebBuilder</span>
                  </div>
                </div>
              ) : (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    connectedSuppliers >= 1
                      ? "bg-[#22C55E]"
                      : "bg-[#64748B]"
                  }`}
                  aria-hidden="true"
                />
              )}
            </Link>

            {/* Admin Profile Row */}
            <div className={`admin-sidebar-profile flex items-center justify-between gap-2 px-1 py-0.5 ${collapsed ? "flex-col justify-center gap-1.5" : ""}`}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[#151F31] border border-[#243047] flex items-center justify-center text-[10px] font-semibold text-[#94A3B8] shrink-0">
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
                className="h-7 w-7 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#151F31] flex items-center justify-center transition-colors cursor-pointer shrink-0"
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
            className={`h-[58px] border-b px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-20 transition-colors ${
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
                className={`md:hidden shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243047] bg-[#151F31] hover:bg-[#1C283F] cursor-pointer`}
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="min-w-0 leading-tight">
                <span className="admin-header-eyebrow hidden md:block text-[10px] font-semibold text-[#94A3B8]">Workspace / Administration</span>
                <span className="block truncate text-sm font-semibold text-[#F8FAFC]">{currentNav.label}</span>
              </div>
            </div>

            {/* Right Header Status & Tools */}
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => { setCommandQuery(""); setCommandOpen(true); }} aria-label="Find an admin page" aria-haspopup="dialog" className="admin-command-trigger">
                <Search className="h-4 w-4" /><span>Find a page…</span><kbd>Ctrl K</kbd>
              </button>
              {/* Supplier Status Button */}
              <Link
                href="/admin/suppliers"
                className="hidden sm:inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#1C283F] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connectedSuppliers >= 1
                      ? "bg-[#22C55E]"
                      : connectedSuppliers === 1
                      ? "bg-[#F59E0B]"
                      : "bg-[#64748B]"
                  }`}
                />
                <span>Supplier status</span>
              </Link>

              {/* View Public Storefront Button */}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open storefront in a new tab"
                className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#1C283F] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                <span className="hidden sm:inline">View store</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#64748B]" />
              </Link>

              {/* Dark / Light Mode Toggle */}
              <button
                onClick={toggleTheme}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#1C283F] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {isDarkMode ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-slate-700" />
                )}
              </button>
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main ref={contentRef} id="main-content" tabIndex={-1} className="admin-content min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6">
            <div className="admin-workspace min-w-0 max-w-[1600px] mx-auto">{children}</div>
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
            <div className="h-[58px] shrink-0 px-4 flex items-center justify-between border-b border-[#243047]">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/asura-store-logo.png"
                  alt="Asura Store Admin Logo"
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 object-contain"
                />
                <div>
                  <strong className="block text-sm font-bold text-[#F8FAFC]">Asura Store</strong>
                  <span className="text-[11px] font-medium text-[#64748B]">Admin workspace</span>
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

            <nav aria-label="Admin sections" className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <p className="admin-nav-heading select-none">{group.title}</p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={`admin-nav-link group relative flex h-[40px] items-center gap-2.5 rounded-xl px-2.5 transition-all duration-150 ${
                          isActive
                            ? "bg-[rgba(34,197,94,0.08)] text-[#22C55E] font-semibold"
                            : "text-[#94A3B8] hover:bg-[#151F31] hover:text-[#F8FAFC]"
                        }`}
                      >
                        {isActive && (
                          <span
                            className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${item.badge.indicator}`}
                            aria-hidden="true"
                          />
                        )}
                        <span
                        className={`admin-nav-icon flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg ${
                            isActive ? item.badge.active : item.badge.inactive
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                        </span>
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
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[#111A2B] border border-[#243047]"
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] font-semibold text-[#F8FAFC]">Supplier API</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#94A3B8]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        connectedSuppliers >= 1
                          ? "bg-[#22C55E]"
                          : "bg-[#64748B]"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">WebBuilder</span>
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-[#151F31] border border-[#243047] flex items-center justify-center text-[10px] font-semibold text-[#94A3B8]">
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
                  className="h-7 w-7 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#151F31] flex items-center justify-center shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {commandOpen && (
        <div className="admin-command-overlay" onClick={() => setCommandOpen(false)}>
          <div ref={commandRef} role="dialog" aria-modal="true" aria-label="Find an admin page" className="admin-command-dialog" onClick={event => event.stopPropagation()}>
            <div className="admin-command-input">
              <Search className="h-5 w-5" />
              <input aria-label="Search admin pages" placeholder="Where would you like to go?" value={commandQuery} onChange={event => setCommandQuery(event.target.value)} onKeyDown={event => {
                if (event.key === "ArrowDown") { event.preventDefault(); commandRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(); }
                if (event.key === "Enter") commandRef.current?.querySelector<HTMLAnchorElement>("a")?.click();
              }} />
              <button type="button" aria-label="Close page search" onClick={() => setCommandOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="admin-command-results">
              <p>Workspace pages</p>
              {NAV_ITEMS.filter(item => item.label.toLowerCase().includes(commandQuery.toLowerCase())).map(item => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} onClick={() => setCommandOpen(false)}><Icon className="h-4 w-4" /><span>{item.label}</span><ArrowUpRight className="h-3.5 w-3.5" /></Link>;
              })}
              {!NAV_ITEMS.some(item => item.label.toLowerCase().includes(commandQuery.toLowerCase())) && <div className="admin-command-empty">No matching pages. Try “orders” or “packages”.</div>}
            </div>
            <div className="admin-command-footer">Use Tab to move between pages <kbd>Esc to close</kbd></div>
          </div>
        </div>
      )}
    </div>
  );
}

