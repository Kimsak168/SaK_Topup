"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  RefreshCw,
  Search,
  CheckCircle2,
  Eye,
  EyeOff,
  Edit2,
  Package,
  Layers,
  ExternalLink,
  Check,
  X,
  AlertTriangle,
  Gamepad2,
  Ellipsis,
} from "lucide-react";

interface AdminGame {
  id: string;
  slug: string;
  name: string;
  supplier: "vizo" | "g2bulk";
  supplierGameCode: string;
  category: string;
  image: string;
  customImage: string | null;
  description: string;
  isActive: boolean;
  isPopular: boolean;
  isTrending: boolean;
  badge: string;
  sortOrder: number;
  requiresServer: boolean;
}

interface KPIStats {
  totalAll: number;
  activeCount: number;
  disabledCount: number;
  vizoCount: number;
  g2bulkCount: number;
}

interface SyncSummary {
  vizo: { imported: number; updated: number; skipped: number; failed: number; total: number; errors: string[] };
  g2bulk: { imported: number; updated: number; skipped: number; failed: number; total: number; errors: string[] };
  totalImported: number;
  totalUpdated: number;
  totalSkipped: number;
  totalFailed: number;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIStats>({
    totalAll: 0,
    activeCount: 0,
    disabledCount: 0,
    vizoCount: 0,
    g2bulkCount: 0,
  });

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Edit Modal State
  const [editingGame, setEditingGame] = useState<AdminGame | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    customImage: "",
    description: "",
    badge: "",
    sortOrder: 0,
    isActive: true,
  });
  const [isSavingGame, setIsSavingGame] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ game: AdminGame; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!actionMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenu(null);
    };
    const closeOnScroll = () => setActionMenu(null);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [actionMenu]);

  const toggleActionMenu = (event: React.MouseEvent<HTMLButtonElement>, game: AdminGame) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setActionMenu((current) => current?.game.id === game.id ? null : {
      game,
      top: bounds.bottom + 190 < window.innerHeight ? bounds.bottom + 6 : Math.max(8, bounds.top - 190),
      left: Math.max(8, Math.min(bounds.right - 208, window.innerWidth - 216)),
    });
  };

  // Fetch games from API
  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        search: debouncedSearch,
        supplier: supplierFilter,
        status: statusFilter,
        page: String(page),
        limit: "25",
      });

      const res = await fetch(`/api/admin/games?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGames(data.games);
          setTotalPages(data.pagination.totalPages || 1);
          setKpi(data.kpi);
        }
      } else {
        toast.error("Failed to load games catalogue");
      }
    } catch {
      toast.error("Network error fetching games");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, supplierFilter, statusFilter, page]);

  useEffect(() => {
    if (search === debouncedSearch) void fetchGames();
  }, [search, debouncedSearch, fetchGames]);

  // Sync games handler
  const handleSyncGames = async () => {
    try {
      setIsSyncing(true);
      toast.loading("Fetching real games catalogue from Vizo and G2Bulk APIs...", { id: "sync-games" });
      const res = await fetch("/api/admin/sync/games", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setSyncSummary(data.stats);
        setShowSyncModal(true);
        toast.success("Game catalogue synchronized successfully!", { id: "sync-games" });
        await fetchGames();
      } else {
        toast.error(data.error || "Failed to synchronize games", { id: "sync-games" });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync error", { id: "sync-games" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle active state (controls customer website visibility)
  const handleToggleActive = async (game: AdminGame) => {
    const nextState = !game.isActive;
    try {
      const res = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          isActive: nextState,
        }),
      });

      if (res.ok) {
        setGames((prev) =>
          prev.map((g) => (g.id === game.id ? { ...g, isActive: nextState } : g))
        );
        setKpi((prev) => ({
          ...prev,
          activeCount: nextState ? prev.activeCount + 1 : prev.activeCount - 1,
          disabledCount: nextState ? prev.disabledCount - 1 : prev.disabledCount + 1,
        }));
        toast.success(
          `${game.name} is now ${nextState ? "ENABLED on customer website" : "DISABLED from website"}`
        );
      } else {
        toast.error("Could not update game visibility");
      }
    } catch {
      toast.error("Network error toggling game status");
    }
  };

  // Open Edit Modal
  const openEditModal = (game: AdminGame) => {
    setEditingGame(game);
    setEditForm({
      name: game.name,
      customImage: game.customImage || "",
      description: game.description,
      badge: game.badge || "",
      sortOrder: game.sortOrder || 0,
      isActive: game.isActive,
    });
  };

  // Save Edit Form
  const handleSaveEdit = async () => {
    if (!editingGame) return;
    try {
      setIsSavingGame(true);
      const res = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: editingGame.id,
          name: editForm.name,
          customImage: editForm.customImage,
          description: editForm.description,
          badge: editForm.badge,
          sortOrder: Number(editForm.sortOrder),
          isActive: editForm.isActive,
        }),
      });

      if (res.ok) {
        toast.success("Game settings saved successfully!");
        setEditingGame(null);
        await fetchGames();
      } else {
        toast.error("Failed to save game settings");
      }
    } catch {
      toast.error("Network error saving game");
    } finally {
      setIsSavingGame(false);
    }
  };

  // Sync packages for this specific game
  const handleSyncGamePackages = async (game: AdminGame) => {
    try {
      toast.loading(`Syncing live packages for ${game.name}...`, { id: `sync-pkg-${game.id}` });
      const res = await fetch("/api/admin/sync/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameCode: game.supplierGameCode,
          supplier: game.supplier,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const count =
          (data.stats?.vizo?.imported || 0) +
          (data.stats?.vizo?.updated || 0) +
          (data.stats?.g2bulk?.imported || 0) +
          (data.stats?.g2bulk?.updated || 0);
        toast.success(`Successfully synchronized ${count} packages for ${game.name}!`, {
          id: `sync-pkg-${game.id}`,
        });
      } else {
        toast.error(data.error || "Package sync failed", { id: `sync-pkg-${game.id}` });
      }
    } catch {
      toast.error("Package sync error", { id: `sync-pkg-${game.id}` });
    }
  };

  return (
    <div className="admin-page">
      {/* Top Header & Sync Games Action */}
      <div className="admin-page-heading">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-400 mb-1">
            <Layers className="h-3.5 w-3.5" />
            <span>Catalogue Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Game Management & Supplier Sync
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Import real games from Vizo and G2Bulk APIs, configure website visibility, and manage thumbnails.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/games/mlbb-test"
            className="inline-flex items-center gap-2 rounded-xl border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 px-4 py-2.5 text-xs sm:text-sm font-bold text-pink-300 transition-all shadow-[0_0_15px_rgba(255,46,147,0.15)]"
          >
            <Gamepad2 className="h-4 w-4 text-pink-400" />
            <span>MLBB Cambodian Verification</span>
          </Link>

          <button
            type="button"
            onClick={handleSyncGames}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_25px_rgba(255,46,147,0.3)] hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing from APIs..." : "Sync Games from APIs"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl p-4 bg-[#0d0f22] border border-white/5 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Catalogue
          </span>
          <div className="text-2xl font-black text-white">{kpi.totalAll}</div>
          <span className="text-[10px] text-slate-500">Real supplier games</span>
        </div>

        <div className="rounded-2xl p-4 bg-[#0d0f22] border border-emerald-500/20 space-y-1">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Eye className="h-3 w-3" /> Live on Store
          </span>
          <div className="text-2xl font-black text-emerald-400">{kpi.activeCount}</div>
          <span className="text-[10px] text-slate-500">Customer visible</span>
        </div>

        <div className="rounded-2xl p-4 bg-[#0d0f22] border border-white/5 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <EyeOff className="h-3 w-3" /> Hidden / Disabled
          </span>
          <div className="text-2xl font-black text-slate-300">{kpi.disabledCount}</div>
          <span className="text-[10px] text-slate-500">Not shown on store</span>
        </div>

        <div className="rounded-2xl p-4 bg-[#0d0f22] border border-pink-500/20 space-y-1">
          <span className="text-[11px] font-semibold text-pink-400 uppercase tracking-wider">
            Vizo (Free Fire)
          </span>
          <div className="text-2xl font-black text-pink-400">{kpi.vizoCount}</div>
          <span className="text-[10px] text-slate-500">Exclusively Vizo</span>
        </div>

        <div className="rounded-2xl p-4 bg-[#0d0f22] border border-purple-500/20 space-y-1">
          <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
            G2Bulk Games
          </span>
          <div className="text-2xl font-black text-purple-400">{kpi.g2bulkCount}</div>
          <span className="text-[10px] text-slate-500">PUBG, MLBB, etc.</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0c0e24] border border-white/10">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search game name, code or slug..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-white/10 bg-[#090b1c] pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-xs font-semibold text-slate-300 focus:border-pink-500 focus:outline-none"
          >
            <option value="all">All Suppliers</option>
            <option value="vizo">Vizo (Free Fire)</option>
            <option value="g2bulk">G2Bulk</option>
          </select>

          {/* Visibility Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-xs font-semibold text-slate-300 focus:border-pink-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Live on Website Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* Games Table */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e24] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-pink-400" />
            <p className="text-xs">Loading game records from MongoDB Atlas...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-white">No games found matching your filters</p>
            <p className="text-xs text-slate-500">
              Try adjusting your search or click &quot;Sync Games from APIs&quot; above to import.
            </p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-[#090b1c] text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Supplier Code</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Storefront Visibility</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {games.map((game) => (
                  <tr key={game.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Game Name & Image */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-[#090b1c]">
                          <Image
                            src={game.customImage || game.image || "/images/hero-banner.jpg"}
                            alt={game.name}
                            fill
                            className="object-cover"
                            onError={(e) => {
                              // Fallback on image error
                              (e.target as HTMLImageElement).src = "/images/freefire.jpg";
                            }}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{game.name}</span>
                            {game.badge && (
                              <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[9px] font-extrabold text-pink-300 uppercase">
                                {game.badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            /{game.supplier}/{game.supplierGameCode}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Supplier */}
                    <td className="py-3 px-4">
                      {game.supplier === "vizo" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 border border-pink-500/30 px-2.5 py-0.5 text-[10px] font-bold text-pink-400">
                          ⚡ VIZO API
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">
                          🚀 G2BULK API
                        </span>
                      )}
                    </td>

                    {/* Supplier Game Code */}
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {game.supplierGameCode}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-slate-400">
                      {game.category}
                    </td>

                    {/* Storefront Active Toggle */}
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(game)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          game.isActive
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border border-white/10 hover:bg-slate-700"
                        }`}
                      >
                        {game.isActive ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>Enabled (Visible)</span>
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3" />
                            <span>Disabled (Hidden)</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button type="button" onClick={(event) => toggleActionMenu(event, game)}
                        aria-label={`Actions for ${game.name}`} aria-expanded={actionMenu?.game.id === game.id}
                        title="More actions" className="admin-table-action cursor-pointer">
                        <Ellipsis className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 text-xs text-slate-400">
          <div>
            Page <span className="font-bold text-white">{page}</span> of{" "}
            <span className="font-bold text-white">{totalPages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {actionMenu && createPortal(<>
        <div className="fixed inset-0 z-[60]" onMouseDown={() => setActionMenu(null)} aria-hidden="true" />
        <div role="group" aria-label={`Actions for ${actionMenu.game.name}`} className="admin-action-menu fixed z-[70]"
          style={{ top: actionMenu.top, left: actionMenu.left }}>
          <button type="button" onClick={() => { void handleSyncGamePackages(actionMenu.game); setActionMenu(null); }}>
            <RefreshCw /> Sync packages
          </button>
          <Link href={`/admin/packages?game=${encodeURIComponent(actionMenu.game.supplierGameCode)}`} onClick={() => setActionMenu(null)}>
            <Package /> View packages & pricing
          </Link>
          <button type="button" onClick={() => { openEditModal(actionMenu.game); setActionMenu(null); }}>
            <Edit2 /> Edit game details
          </button>
          {actionMenu.game.isActive && <Link href={`/games/${actionMenu.game.supplier}/${actionMenu.game.supplierGameCode}`}
            target="_blank" onClick={() => setActionMenu(null)}><ExternalLink /> Open customer page</Link>}
        </div>
      </>, document.querySelector(".admin-shell") ?? document.body)}

      {/* Sync Summary Modal */}
      {showSyncModal && syncSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="API synchronization report" className="admin-modal-panel relative w-full max-w-lg p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-pink-400 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span>API Synchronization Report</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Real catalogue endpoints were queried. Administrator settings and custom configurations were safely preserved.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <div className="font-bold text-pink-400">Vizo (Free Fire)</div>
                <div className="text-slate-300">Imported: {syncSummary.vizo.imported}</div>
                <div className="text-slate-300">Updated: {syncSummary.vizo.updated}</div>
                <div className="text-slate-400">Total Vizo: {syncSummary.vizo.total}</div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <div className="font-bold text-purple-400">G2Bulk Catalogue</div>
                <div className="text-slate-300">Imported: {syncSummary.g2bulk.imported}</div>
                <div className="text-slate-300">Updated: {syncSummary.g2bulk.updated}</div>
                <div className="text-slate-400">Total G2Bulk: {syncSummary.g2bulk.total}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
              <span>Total Imported &amp; Updated:</span>
              <span className="font-extrabold text-sm">
                {syncSummary.totalImported + syncSummary.totalUpdated} Games
              </span>
            </div>

            {syncSummary.vizo.errors.length > 0 && (
              <div className="text-[11px] text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                {syncSummary.vizo.errors.join(", ")}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSyncModal(false)}
              className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition-colors"
            >
              Done &amp; View Games
            </button>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {editingGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Edit game" className="admin-modal-panel relative w-full max-w-md p-6 sm:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-pink-400" />
                <span>Edit {editingGame.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingGame(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Display Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Custom Thumbnail Image URL (Overrides Supplier)
                </label>
                <input
                  type="text"
                  placeholder="https://... or /images/..."
                  value={editForm.customImage}
                  onChange={(e) => setEditForm({ ...editForm, customImage: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Promotional Badge</label>
                  <input
                    type="text"
                    placeholder="HOT DEAL / POPULAR"
                    value={editForm.badge}
                    onChange={(e) => setEditForm({ ...editForm, badge: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Sort Order (Lower = 1st)</label>
                  <input
                    type="number"
                    value={editForm.sortOrder}
                    onChange={(e) => setEditForm({ ...editForm, sortOrder: parseInt(e.target.value, 10) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-[#090b1c] px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-white/10">
                <span className="text-slate-300 font-semibold">Storefront Visibility</span>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    editForm.isActive
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border border-white/10"
                  }`}
                >
                  {editForm.isActive ? "Visible" : "Hidden"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingGame(null)}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingGame}
                onClick={handleSaveEdit}
                className="flex-1 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md disabled:opacity-50"
              >
                {isSavingGame ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
