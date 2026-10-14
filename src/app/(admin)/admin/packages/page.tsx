"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  RefreshCw,
  Search,
  Package,
  Lock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Upload,
  X,
  Trash2,
} from "lucide-react";

interface AdminPackage {
  id: string;
  gameSlug: string;
  gameCode: string;
  supplier: "vizo" | "g2bulk";
  supplierProductCode: string;
  name: string;
  buyingPrice: number | null; // Private supplier wholesale cost
  sellingPrice: number | null; // Customer price
  originalPrice: number | null;
  currency: string;
  badge: string;
  isActive: boolean;
  adminConfigured: boolean;
  customImage: string | null;
  sortOrder: number;
}

interface KPIStats {
  totalPkgs: number;
  configuredPkgs: number;
  unconfiguredPkgs: number;
  vizoPkgs: number;
  g2bulkPkgs: number;
}

interface AvailableGame {
  slug: string;
  code: string;
  name: string;
  supplier: string;
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIStats>({
    totalPkgs: 0,
    configuredPkgs: 0,
    unconfiguredPkgs: 0,
    vizoPkgs: 0,
    g2bulkPkgs: 0,
  });
  const [availableGames, setAvailableGames] = useState<AvailableGame[]>([]);

  // Filter state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [gameFilter, setGameFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [totalPages, setTotalPages] = useState(1);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOnlyActive, setSyncOnlyActive] = useState(true);

  // Editable row values map: packageId -> { sellingPrice, badge, isActive }
  const [editMap, setEditMap] = useState<
    Record<
      string,
      {
        sellingPrice: string;
        originalPrice: string;
        badge: string;
        isActive: boolean;
        customImage: string | null;
        isDirty: boolean;
      }
    >
  >({});

  const [savingId, setSavingId] = useState<string | null>(null);

  // Custom Image Upload Modal State
  const [imageModalPkg, setImageModalPkg] = useState<AdminPackage | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        search: debouncedSearch,
        game: gameFilter,
        supplier: supplierFilter,
        status: statusFilter,
        page: String(page),
        limit: pageSize,
      });

      const res = await fetch(`/api/admin/packages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPackages(data.packages);
          setTotalPages(data.pagination.totalPages || 1);
          setKpi(data.kpi);
          if (data.availableGames) {
            setAvailableGames(data.availableGames);
          }

          // Initialize editMap
          const initialMap: Record<
            string,
            {
              sellingPrice: string;
              originalPrice: string;
              badge: string;
              isActive: boolean;
              customImage: string | null;
              isDirty: boolean;
            }
          > = {};
          data.packages.forEach((p: AdminPackage) => {
            initialMap[p.id] = {
              sellingPrice: p.sellingPrice !== null ? String(p.sellingPrice) : "",
              originalPrice: p.originalPrice !== null ? String(p.originalPrice) : "",
              badge: p.badge || "",
              isActive: p.isActive,
              customImage: p.customImage || null,
              isDirty: false,
            };
          });
          setEditMap(initialMap);
        }
      } else {
        toast.error("Failed to load packages");
      }
    } catch {
      toast.error("Network error fetching packages");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, gameFilter, supplierFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    if (search === debouncedSearch) void fetchPackages();
  }, [search, debouncedSearch, fetchPackages]);

  // Sync packages from API
  const handleSyncPackages = async () => {
    try {
      setIsSyncing(true);
      toast.loading(
        `Syncing live packages from ${supplierFilter === "all" ? "Vizo and G2Bulk" : supplierFilter.toUpperCase()}...`,
        { id: "sync-packages" }
      );

      const res = await fetch("/api/admin/sync/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: supplierFilter !== "all" ? supplierFilter : undefined,
          gameCode: gameFilter !== "all" ? gameFilter : undefined,
          onlyActiveGames: syncOnlyActive,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const imported = data.stats?.totalImported || 0;
        const updated = data.stats?.totalUpdated || 0;
        toast.success(
          `Packages synced successfully! (${imported} new imported, ${updated} wholesale costs updated)`,
          { id: "sync-packages" }
        );
        await fetchPackages();
      } else {
        toast.error(data.error || "Failed to sync packages", { id: "sync-packages" });
      }
    } catch {
      toast.error("Package sync error", { id: "sync-packages" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle local edit changes
  const handleFieldChange = (
    id: string,
    field: "sellingPrice" | "originalPrice" | "badge" | "isActive",
    value: string | boolean
  ) => {
    setEditMap((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
        isDirty: true,
      },
    }));
  };

  // Save single package pricing and settings
  const handleSavePackage = async (pkg: AdminPackage) => {
    const row = editMap[pkg.id];
    if (!row) return;

    try {
      setSavingId(pkg.id);
      const res = await fetch("/api/admin/packages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : null,
          originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : null,
          badge: row.badge,
          isActive: row.isActive,
        }),
      });

      if (res.ok) {
        setEditMap((prev) => ({
          ...prev,
          [pkg.id]: { ...prev[pkg.id], isDirty: false },
        }));
        // Update local package object
        setPackages((prev) =>
          prev.map((p) =>
            p.id === pkg.id
              ? {
                  ...p,
                  sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : null,
                  originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : null,
                  badge: row.badge,
                  isActive: row.isActive,
                  adminConfigured: !!row.sellingPrice,
                }
              : p
          )
        );
        toast.success(`Saved pricing for ${pkg.name}`);
      } else {
        toast.error("Failed to save package");
      }
    } catch {
      toast.error("Network error saving package");
    } finally {
      setSavingId(null);
    }
  };

  // Open Image Modal
  const openImageModal = (pkg: AdminPackage) => {
    setImageModalPkg(pkg);
    setSelectedFile(null);
    setPreviewUrl(pkg.customImage || null);
    setUrlInput(pkg.customImage?.startsWith("http") ? pkg.customImage : "");
  };

  // Close Image Modal
  const closeImageModal = () => {
    setImageModalPkg(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUrlInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Handle Image File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        toast.error("Image file must be under 3 MB");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUrlInput("");
    }
  };

  // Submit Image Upload / Update
  const handleSaveImage = async () => {
    if (!imageModalPkg) return;

    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append("packageId", imageModalPkg.id);

      if (selectedFile) {
        formData.append("image", selectedFile);
      } else if (urlInput.trim()) {
        formData.append("customImage", urlInput.trim());
      } else if (!previewUrl) {
        // Clearing image
        formData.append("customImage", "");
      } else {
        closeImageModal();
        return;
      }

      const res = await fetch("/api/admin/packages/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const newImg = data.package?.customImage || null;
        setPackages((prev) =>
          prev.map((p) => (p.id === imageModalPkg.id ? { ...p, customImage: newImg } : p))
        );
        setEditMap((prev) => ({
          ...prev,
          [imageModalPkg.id]: {
            ...prev[imageModalPkg.id],
            customImage: newImg,
          },
        }));
        toast.success(`Updated custom image for ${imageModalPkg.name}`);
        closeImageModal();
      } else {
        toast.error(data.error || "Failed to update package image");
      }
    } catch {
      toast.error("Network error uploading image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Remove Custom Image
  const handleRemoveImage = async () => {
    if (!imageModalPkg) return;
    try {
      setIsUploadingImage(true);
      const res = await fetch("/api/admin/packages/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: imageModalPkg.id,
          customImage: "",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPackages((prev) =>
          prev.map((p) => (p.id === imageModalPkg.id ? { ...p, customImage: null } : p))
        );
        setEditMap((prev) => ({
          ...prev,
          [imageModalPkg.id]: {
            ...prev[imageModalPkg.id],
            customImage: null,
          },
        }));
        toast.success(`Removed custom image for ${imageModalPkg.name}`);
        closeImageModal();
      } else {
        toast.error(data.error || "Failed to remove image");
      }
    } catch {
      toast.error("Network error removing image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <div className="admin-page">
      {/* Top Header & Sync Action */}
      <div className="admin-page-heading">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-1">
            <Package className="h-3.5 w-3.5" />
            <span>Pricing &amp; Margins HQ</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Package Pricing &amp; Stock Availability
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            View supplier buying costs privately, set customer selling prices in USD, upload custom images, and toggle stock availability.
          </p>
        </div>

        {/* Sync Packages Button */}
        <div className="flex items-center gap-3">
          <label className="hidden sm:flex items-center gap-2 text-xs text-[#94A3B8] cursor-pointer">
            <input
              type="checkbox"
              checked={syncOnlyActive}
              onChange={(e) => setSyncOnlyActive(e.target.checked)}
              className="rounded border-[#243047] bg-[#151F31] text-[#22C55E] focus:ring-[#22C55E]"
            />
            <span>Active Games Only</span>
          </label>

          <button
            type="button"
            onClick={handleSyncPackages}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] px-4 py-2 text-xs sm:text-sm font-bold text-[#080D18] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing Packages..." : "Sync Packages from APIs"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl p-4 bg-[#111A2B] border border-[#243047] space-y-1">
          <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
            Total Synced Packages
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#F8FAFC]">{kpi.totalPkgs}</div>
          <span className="text-[10px] text-[#64748B]">From Vizo &amp; G2Bulk APIs</span>
        </div>

        <div className="rounded-xl p-4 bg-[#111A2B] border border-[#243047] space-y-1">
          <span className="text-[11px] font-semibold text-[#22C55E] uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Ready For Customers
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#22C55E]">{kpi.configuredPkgs}</div>
          <span className="text-[10px] text-[#64748B]">Customer selling price set</span>
        </div>

        <div className="rounded-xl p-4 bg-[#111A2B] border border-[#243047] space-y-1">
          <span className="text-[11px] font-semibold text-[#F59E0B] uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Needs Customer Price
          </span>
          <div className="text-2xl font-bold tracking-tight text-[#F59E0B]">{kpi.unconfiguredPkgs}</div>
          <span className="text-[10px] text-[#64748B]">Hidden from buyers until price is set</span>
        </div>

        <div className="rounded-xl p-4 bg-[#111A2B] border border-[#243047] space-y-1">
          <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
            Packages By Supplier
          </span>
          <div className="text-lg font-bold text-[#F8FAFC]">
            <span className="text-[#22C55E]">{kpi.vizoPkgs} Vizo</span> /{" "}
            <span className="text-[#F8FAFC]">{kpi.g2bulkPkgs} G2Bulk</span>
          </div>
          <span className="text-[10px] text-[#64748B]">Original supplier codes preserved</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111A2B] border border-[#243047]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] pointer-events-none" />
          <input
            type="text"
            placeholder="Search package name, code or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[#243047] bg-[#151F31] pl-10 pr-4 py-2 text-xs sm:text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by Game */}
          <select
            value={gameFilter}
            onChange={(e) => {
              setGameFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none max-w-[180px]"
          >
            <option value="all">All Games</option>
            {availableGames.map((g) => (
              <option key={g.code || g.slug} value={g.code || g.slug}>
                {g.name} ({g.supplier.toUpperCase()})
              </option>
            ))}
          </select>

          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
          >
            <option value="all">All Suppliers</option>
            <option value="vizo">Vizo (Free Fire)</option>
            <option value="g2bulk">G2Bulk</option>
          </select>

          {/* Price Configuration Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
          >
            <option value="all">All Packages</option>
            <option value="unconfigured">Needs Price Setup</option>
            <option value="configured">Price Configured</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {/* Page size limit */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
            title="Items per page"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="150">150 / page</option>
            <option value="200">200 / page</option>
          </select>
        </div>
      </div>

      {/* Packages Pricing Table */}
      <div className="rounded-xl border border-[#243047] bg-[#111A2B] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#22C55E]" />
            <p className="text-xs text-[#94A3B8]">Loading packages from MongoDB Atlas...</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <AlertCircle className="h-8 w-8 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-white">No packages found matching your filters</p>
            <p className="text-xs text-slate-500">
              Click &quot;Sync Packages from APIs&quot; above to import live products.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243047] bg-[#151F31] text-[#94A3B8] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3.5">Image</th>
                  <th className="py-2.5 px-3.5">Package</th>
                  <th className="py-2.5 px-3.5">Game / Supplier</th>
                  <th className="py-2.5 px-3.5">Product Code</th>
                  <th className="py-2.5 px-3.5">
                    <span className="flex items-center gap-1 text-[#F8FAFC]">
                      <Lock className="h-3 w-3 text-[#22C55E]" /> Wholesale Cost (Private)
                    </span>
                  </th>
                  <th className="py-2.5 px-3.5">Customer Selling Price ($)</th>
                  <th className="py-2.5 px-3.5">Profit Margin</th>
                  <th className="py-2.5 px-3.5">Badge</th>
                  <th className="py-2.5 px-3.5">Available</th>
                  <th className="py-2.5 px-3.5 text-right">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {packages.map((pkg) => {
                  const row = editMap[pkg.id] || {
                    sellingPrice: pkg.sellingPrice !== null ? String(pkg.sellingPrice) : "",
                    originalPrice: pkg.originalPrice !== null ? String(pkg.originalPrice) : "",
                    badge: pkg.badge || "",
                    isActive: pkg.isActive,
                    customImage: pkg.customImage || null,
                    isDirty: false,
                  };

                  const sellNum = parseFloat(row.sellingPrice);
                  const costNum = pkg.buyingPrice;
                  let marginPercent: number | null = null;
                  let profitAmount: number | null = null;

                  if (costNum && !isNaN(sellNum) && sellNum > costNum) {
                    profitAmount = Math.round((sellNum - costNum) * 100) / 100;
                    marginPercent = Math.round(((sellNum - costNum) / costNum) * 1000) / 10;
                  }

                  return (
                    <tr key={pkg.id} className="hover:bg-[#151F31]/50 transition-colors">
                      {/* Image Thumbnail & Upload Button */}
                      <td className="py-2.5 px-3.5">
                        <button
                          type="button"
                          onClick={() => openImageModal(pkg)}
                          className="group relative flex items-center justify-center h-8 w-8 rounded-lg border border-[#243047] bg-[#151F31] hover:border-[#22C55E]/50 overflow-hidden cursor-pointer transition-all"
                          title={pkg.customImage ? "Click to change custom image" : "Click to upload custom image"}
                        >
                          {pkg.customImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pkg.customImage}
                              alt={pkg.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-[#64748B] group-hover:text-[#22C55E] transition-colors" />
                          )}
                        </button>
                      </td>

                      {/* Package Name */}
                      <td className="py-2.5 px-3.5 font-semibold text-[#F8FAFC]">
                        <div className="max-w-[180px] truncate">{pkg.name}</div>
                      </td>

                      {/* Game / Supplier */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-[#94A3B8]">
                          {pkg.gameSlug.toUpperCase()}
                        </div>
                        <span
                          className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            pkg.supplier === "vizo"
                              ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] border border-[rgba(34,197,94,0.3)]"
                              : "bg-[#151F31] text-[#94A3B8] border border-[#243047]"
                          }`}
                        >
                          {pkg.supplier}
                        </span>
                      </td>

                      {/* Product Code */}
                      <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#64748B]">
                        {pkg.supplierProductCode}
                      </td>

                      {/* Wholesale Cost (Private to Admin) */}
                      <td className="py-2.5 px-3.5">
                        {pkg.buyingPrice !== null ? (
                          <span className="font-mono font-semibold text-[#F8FAFC] bg-[#151F31] px-2 py-0.5 rounded border border-[#243047]">
                            ${pkg.buyingPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[#64748B] text-[10px]">Unlisted</span>
                        )}
                      </td>

                      {/* Editable Selling Price Input */}
                      <td className="py-2.5 px-3.5">
                        <div className="relative w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Set price"
                            value={row.sellingPrice}
                            onChange={(e) => handleFieldChange(pkg.id, "sellingPrice", e.target.value)}
                            className={`w-full rounded-lg border pl-6 pr-2 py-1.5 font-mono text-xs font-bold text-[#F8FAFC] focus:outline-none transition-all ${
                              row.isDirty
                                ? "border-[#22C55E] bg-[rgba(34,197,94,0.10)]"
                                : row.sellingPrice
                                ? "border-[#243047] bg-[#151F31]"
                                : "border-amber-500/40 bg-amber-500/5 text-amber-200 placeholder-amber-400/60"
                            }`}
                          />
                        </div>
                      </td>

                      {/* Profit Margin Preview */}
                      <td className="py-2.5 px-3.5">
                        {marginPercent !== null && profitAmount !== null ? (
                          <div className="text-[11px] font-semibold text-[#22C55E] flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>+{marginPercent}%</span>
                            <span className="text-[9px] text-[#64748B] font-mono">
                              (+${profitAmount.toFixed(2)})
                            </span>
                          </div>
                        ) : !row.sellingPrice ? (
                          <span className="text-[10px] text-[#F59E0B] font-semibold">Price Unset</span>
                        ) : (
                          <span className="text-[10px] text-[#64748B] font-mono">No Margin</span>
                        )}
                      </td>

                      {/* Badge Input */}
                      <td className="py-2.5 px-3.5">
                        <input
                          type="text"
                          placeholder="e.g. POPULAR"
                          value={row.badge}
                          onChange={(e) => handleFieldChange(pkg.id, "badge", e.target.value)}
                          className="w-24 rounded-lg border border-[#243047] bg-[#151F31] px-2 py-1 text-[10px] uppercase font-bold text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
                        />
                      </td>

                      {/* Active Toggle Switch */}
                      <td className="py-2.5 px-3.5">
                        <button
                          type="button"
                          onClick={() => handleFieldChange(pkg.id, "isActive", !row.isActive)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                            row.isActive
                              ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] border border-[rgba(34,197,94,0.28)]"
                              : "bg-[#151F31] text-[#64748B] border border-[#243047]"
                          }`}
                        >
                          {row.isActive ? "Available" : "Disabled"}
                        </button>
                      </td>

                      {/* Save Button */}
                      <td className="py-2.5 px-3.5 text-right">
                        <button
                          type="button"
                          disabled={savingId === pkg.id || !row.isDirty}
                          onClick={() => handleSavePackage(pkg)}
                          className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            row.isDirty
                              ? "bg-[#22C55E] hover:bg-[#16A34A] text-[#080D18] shadow-md"
                              : "bg-[#151F31] text-[#64748B] hover:text-[#F8FAFC] disabled:opacity-30"
                          }`}
                          title="Save price change"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 text-xs text-slate-400">
          <div>
            Page <span className="font-bold text-white">{page}</span> of{" "}
            <span className="font-bold text-white">{totalPages}</span> (Showing up to {pageSize} items/page)
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

      {/* Custom Image Upload Modal */}
      {imageModalPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Custom package image" className="relative w-full max-w-md p-6 space-y-5 rounded-xl bg-[#111A2B] border border-[#243047] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#243047]">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-[#22C55E]" />
                <h3 className="text-base font-bold text-[#F8FAFC]">Custom Package Image</h3>
              </div>
              <button
                type="button"
                onClick={closeImageModal}
                className="p-1 rounded-lg hover:bg-[#151F31] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Package details */}
            <div className="text-xs text-[#94A3B8]">
              Editing image for:{" "}
              <span className="font-bold text-[#F8FAFC]">{imageModalPkg.name}</span>{" "}
              <span className="font-mono text-[#22C55E]">({imageModalPkg.supplierProductCode})</span>
            </div>

            {/* Image Preview */}
            <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-[#243047] bg-[#151F31]">
              {previewUrl ? (
                <div className="relative h-28 w-28 rounded-lg overflow-hidden border border-[#243047] shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Package Preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-28 w-28 rounded-lg border border-dashed border-[#243047] text-[#64748B] text-center p-2">
                  <ImageIcon className="h-8 w-8 mb-1" />
                  <span className="text-[10px]">No Custom Image</span>
                </div>
              )}
            </div>

            {/* Upload File Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Upload New File (PNG, JPG, WebP)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="w-full text-xs text-[#94A3B8] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#151F31] file:text-[#22C55E] file:border file:border-[#243047] hover:file:bg-[#111A2B] cursor-pointer"
              />
            </div>

            {/* Or Enter Image URL */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Or External Image URL
              </label>
              <input
                type="url"
                placeholder="https://example.com/package-icon.png"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (e.target.value) {
                    setPreviewUrl(e.target.value);
                    setSelectedFile(null);
                  }
                }}
                className="w-full rounded-lg border border-[#243047] bg-[#151F31] px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none font-mono"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#243047]">
              {imageModalPkg.customImage ? (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={isUploadingImage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#EF4444] bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove Image</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeImageModal}
                  disabled={isUploadingImage}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] bg-[#151F31] hover:bg-[#111A2B] border border-[#243047] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveImage}
                  disabled={isUploadingImage || (!selectedFile && !urlInput.trim() && !previewUrl)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#080D18] bg-[#22C55E] hover:bg-[#16A34A] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Save Image</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
