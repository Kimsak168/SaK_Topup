"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  RefreshCw,
  Search,
  Package,
  Lock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Upload,
  X,
  Trash2,
  Layers,
  Globe,
  Zap,
  Undo2,
} from "lucide-react";

interface AdminPackage {
  id: string;
  gameSlug: string;
  gameCode: string;
  supplier: "webbuilder" | "g2bulk" | "vngzz2";
  supplierProductCode: string;
  name: string;
  buyingPrice: number | null; // Private supplier wholesale cost
  sellingPrice: number | null; // Customer price
  originalPrice: number | null;
  currency: string;
  badge: string;
  isActive: boolean;
  supplierAvailable: boolean;
  adminConfigured: boolean;
  customImage: string | null;
  sortOrder: number;
}

interface KPIStats {
  totalPkgs: number;
  configuredPkgs: number;
  unconfiguredPkgs: number;
  webbuilderPkgs: number;
  webbuilderConfiguredPkgs?: number;
  vngzz2Pkgs?: number;
  vngzz2ConfiguredPkgs?: number;
}

interface AvailableGame {
  slug: string;
  code: string;
  name: string;
  supplier: string;
}

interface BulkImageRow {
  file: File;
  packageId: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

function normalizeImageMatch(value: string): string {
  return value.toLowerCase().replace(/\.png$/i, "").replace(/[^a-z0-9]/g, "");
}

function PackagesManagerContent() {
  const searchParams = useSearchParams();
  const urlSupplier = searchParams.get("supplier");
  const urlGame = searchParams.get("game");

  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIStats>({
    totalPkgs: 0,
    configuredPkgs: 0,
    unconfiguredPkgs: 0,
    webbuilderPkgs: 0,
    webbuilderConfiguredPkgs: 0,
    vngzz2Pkgs: 0,
    vngzz2ConfiguredPkgs: 0,
  });
  const [availableGames, setAvailableGames] = useState<AvailableGame[]>([]);

  // Filter state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [supplierFilter, setSupplierFilter] = useState<string>(urlSupplier || "all");
  const [gameFilter, setGameFilter] = useState<string>(urlGame || "all");
  const [supplierAvailability, setSupplierAvailability] = useState("available");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [totalPages, setTotalPages] = useState(1);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOnlyActive, setSyncOnlyActive] = useState(true);

  // Editable row values map: packageId -> { sellingPrice, originalPrice, badge, isActive, customImage, isDirty }
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
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Custom Image Upload Modal State
  const [imageModalPkg, setImageModalPkg] = useState<AdminPackage | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBulkImageModalOpen, setIsBulkImageModalOpen] = useState(false);
  const [bulkImagePackages, setBulkImagePackages] = useState<AdminPackage[]>([]);
  const [bulkImageRows, setBulkImageRows] = useState<BulkImageRow[]>([]);
  const [isLoadingBulkPackages, setIsLoadingBulkPackages] = useState(false);
  const [isUploadingBulkImages, setIsUploadingBulkImages] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Filter games based on current supplier
  const filteredGames = useMemo(() => {
    if (supplierFilter === "all") return availableGames;
    return availableGames.filter((g) => g.supplier === supplierFilter);
  }, [availableGames, supplierFilter]);

  // Map game lookup for rapid title resolution
  const gameNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    availableGames.forEach((g) => {
      if (g.code) map.set(g.code.toLowerCase(), g.name);
      if (g.slug) map.set(g.slug.toLowerCase(), g.name);
    });
    return map;
  }, [availableGames]);

  // Dirty count
  const dirtyPackageIds = useMemo(() => {
    return Object.keys(editMap).filter((id) => editMap[id]?.isDirty);
  }, [editMap]);
  const dirtyCount = dirtyPackageIds.length;

  // Switch supplier handler (resets game filter and page for effortless switching)
  const handleSwitchSupplier = (newSupplier: string) => {
    setSupplierFilter(newSupplier);
    setGameFilter("all");
    setPage(1);
  };

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        search: debouncedSearch,
        game: gameFilter,
        supplier: supplierFilter,
        supplierAvailability,
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
  }, [debouncedSearch, gameFilter, supplierFilter, supplierAvailability, statusFilter, page, pageSize]);

  useEffect(() => {
    if (search === debouncedSearch) void fetchPackages();
  }, [search, debouncedSearch, fetchPackages]);

  // Sync packages from API
  const handleSyncPackages = async () => {
    try {
      setIsSyncing(true);
      const targetLabel =
        supplierFilter === "webbuilder"
          ? "WebBuilder"
          : supplierFilter === "vngzz2"
          ? "VNGZZ2"
          : "all configured suppliers";

      toast.loading(`Syncing packages from ${targetLabel}...`, { id: "sync-packages" });

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
          `Packages synced successfully! (${imported} imported, ${updated} wholesale costs updated)`,
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

  // Save all modified packages at once
  const handleSaveAllDirty = async () => {
    if (dirtyPackageIds.length === 0) return;

    try {
      setIsSavingAll(true);
      let successCount = 0;
      let failCount = 0;

      for (const id of dirtyPackageIds) {
        const row = editMap[id];
        if (!row) continue;

        try {
          const res = await fetch("/api/admin/packages", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: id,
              sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : null,
              originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : null,
              badge: row.badge,
              isActive: row.isActive,
            }),
          });

          if (res.ok) {
            successCount++;
            setEditMap((prev) => ({
              ...prev,
              [id]: { ...prev[id], isDirty: false },
            }));
            setPackages((prev) =>
              prev.map((p) =>
                p.id === id
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
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        toast.success(`Successfully saved all ${successCount} package changes!`);
      } else {
        toast.warning(`Saved ${successCount} packages; ${failCount} failed.`);
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  // Discard all unsaved modifications
  const handleDiscardChanges = () => {
    const resetMap: typeof editMap = {};
    packages.forEach((p) => {
      resetMap[p.id] = {
        sellingPrice: p.sellingPrice !== null ? String(p.sellingPrice) : "",
        originalPrice: p.originalPrice !== null ? String(p.originalPrice) : "",
        badge: p.badge || "",
        isActive: p.isActive,
        customImage: p.customImage || null,
        isDirty: false,
      };
    });
    setEditMap(resetMap);
    toast.info("Unsaved package price edits discarded");
  };

  // Open Image Modal
  useEffect(() => {
    if (!previewUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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

  // Save Custom Image
  const handleSaveImage = async () => {
    if (!imageModalPkg) return;

    try {
      setIsUploadingImage(true);

      if (selectedFile) {
        const formData = new FormData();
        formData.append("packageId", imageModalPkg.id);
        formData.append("image", selectedFile);

        const res = await fetch("/api/admin/packages/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setPackages((prev) =>
            prev.map((p) =>
              p.id === imageModalPkg.id ? { ...p, customImage: data.package.customImage } : p
            )
          );
          setEditMap((prev) => ({
            ...prev,
            [imageModalPkg.id]: {
              ...prev[imageModalPkg.id],
              customImage: data.package.customImage,
            },
          }));
          toast.success(`Updated custom image for ${imageModalPkg.name}`);
          closeImageModal();
        } else {
          toast.error(data.error || "Failed to upload image");
        }
      } else if (urlInput.trim()) {
        const res = await fetch("/api/admin/packages/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: imageModalPkg.id,
            imageUrl: urlInput.trim(),
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setPackages((prev) =>
            prev.map((p) =>
              p.id === imageModalPkg.id ? { ...p, customImage: data.package.customImage } : p
            )
          );
          setEditMap((prev) => ({
            ...prev,
            [imageModalPkg.id]: {
              ...prev[imageModalPkg.id],
              customImage: data.package.customImage,
            },
          }));
          toast.success(`Set custom image URL for ${imageModalPkg.name}`);
          closeImageModal();
        } else {
          toast.error(data.error || "Failed to set image URL");
        }
      }
    } catch {
      toast.error("Network error saving image");
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
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: imageModalPkg.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPackages((prev) =>
          prev.map((p) => (p.id === imageModalPkg.id ? { ...p, customImage: null } : p))
        );
        setEditMap((prev) => ({
          ...prev,
          [imageModalPkg.id]: { ...prev[imageModalPkg.id], customImage: null },
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

  const openBulkImageModal = async () => {
    setIsBulkImageModalOpen(true);
    setIsLoadingBulkPackages(true);
    setBulkImageRows([]);
    setBulkUploadProgress(0);

    try {
      const allPackages: AdminPackage[] = [];
      let totalPages = 1;

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const params = new URLSearchParams({
          search: "",
          game: "all",
          supplier: "all",
          supplierAvailability: "all",
          status: "all",
          page: String(pageNumber),
          limit: "250",
        });
        const response = await fetch(`/api/admin/packages?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.packages)) {
          throw new Error(data.error || "Could not load packages for bulk image upload.");
        }

        allPackages.push(...(data.packages as AdminPackage[]));
        totalPages = Math.max(1, Number(data.pagination?.totalPages) || 1);
      }

      setBulkImagePackages(allPackages);
      if (allPackages.length === 0) toast.error("No packages are available for image upload.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load packages for bulk image upload.");
      setIsBulkImageModalOpen(false);
    } finally {
      setIsLoadingBulkPackages(false);
    }
  };

  const closeBulkImageModal = () => {
    if (isUploadingBulkImages) return;
    setIsBulkImageModalOpen(false);
    setBulkImageRows([]);
    setBulkUploadProgress(0);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  const handleBulkPngSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;

    const pngFiles = selectedFiles.filter((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png"));
    const oversizedFiles = pngFiles.filter((file) => file.size > 3 * 1024 * 1024);
    const validFiles = pngFiles.filter((file) => file.size <= 3 * 1024 * 1024);
    if (pngFiles.length !== selectedFiles.length) toast.error("Only PNG files can be added.");
    if (oversizedFiles.length > 0) toast.error("Each PNG must be 3 MB or smaller.");
    if (validFiles.length === 0) return;

    const rows = validFiles.map((file): BulkImageRow => {
      const fileKey = normalizeImageMatch(file.name);
      const matches = bulkImagePackages.filter((pkg) =>
        [pkg.id, pkg.supplierProductCode, pkg.name].some((value) => normalizeImageMatch(value) === fileKey)
      );
      return {
        file,
        packageId: matches.length === 1 ? matches[0].id : "",
        status: "queued",
      };
    });
    setBulkImageRows(rows);
    setBulkUploadProgress(0);
  };

  const handleBulkImageUpload = async () => {
    const rowsToUpload = [...bulkImageRows];
    if (rowsToUpload.length === 0 || rowsToUpload.some((row) => !row.packageId)) {
      toast.error("Choose a package for every PNG before uploading.");
      return;
    }

    const targetIds = rowsToUpload.map((row) => row.packageId);
    if (new Set(targetIds).size !== targetIds.length) {
      toast.error("Each PNG must be assigned to a different package.");
      return;
    }

    setIsUploadingBulkImages(true);
    setBulkUploadProgress(0);
    let uploadedCount = 0;

    for (let index = 0; index < rowsToUpload.length; index++) {
      const row = rowsToUpload[index];
      setBulkUploadProgress(index + 1);
      setBulkImageRows((previous) =>
        previous.map((item, itemIndex) =>
          itemIndex === index ? { ...item, status: "uploading", error: undefined } : item
        )
      );

      try {
        const formData = new FormData();
        formData.append("packageId", row.packageId);
        formData.append("image", row.file);
        const response = await fetch("/api/admin/packages/upload", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok || !data.success || typeof data.package?.customImage !== "string") {
          throw new Error(data.error || `Upload failed for ${row.file.name}.`);
        }

        const customImage = data.package.customImage as string;
        setPackages((previous) =>
          previous.map((pkg) => (pkg.id === row.packageId ? { ...pkg, customImage } : pkg))
        );
        setEditMap((previous) => ({
          ...previous,
          [row.packageId]: { ...previous[row.packageId], customImage },
        }));
        setBulkImageRows((previous) =>
          previous.map((item, itemIndex) =>
            itemIndex === index ? { ...item, status: "done", error: undefined } : item
          )
        );
        uploadedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : `Upload failed for ${row.file.name}.`;
        setBulkImageRows((previous) =>
          previous.map((item, itemIndex) =>
            itemIndex === index ? { ...item, status: "error", error: message } : item
          )
        );
      }
    }

    const failedCount = rowsToUpload.length - uploadedCount;
    setIsUploadingBulkImages(false);
    await fetchPackages();
    if (failedCount > 0) {
      setBulkImageRows((previous) => previous.filter((row) => row.status !== "done"));
      toast.error(`${uploadedCount} PNG uploaded; ${failedCount} failed. You can retry the failed files.`);
    } else {
      toast.success(`Uploaded ${uploadedCount} package PNG${uploadedCount === 1 ? "" : "s"}.`);
      setIsBulkImageModalOpen(false);
      setBulkImageRows([]);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    }
  };

  const bulkTargetIds = bulkImageRows.map((row) => row.packageId).filter(Boolean);
  const hasDuplicateBulkTargets = new Set(bulkTargetIds).size !== bulkTargetIds.length;
  const canUploadBulkImages = bulkImageRows.length > 0 && bulkImageRows.every((row) => row.packageId) && !hasDuplicateBulkTargets;

  return (
    <div className="admin-page admin-packages-page">
      <div className="admin-page-heading admin-packages-heading">
        <div>
          <p className="admin-eyebrow">Catalogue management</p>
          <h1>Packages &amp; pricing</h1>
          <p className="admin-page-description">Manage your product images, selling prices, and supplier availability.</p>
        </div>
        <div className="admin-heading-actions">
          <button type="button" onClick={openBulkImageModal} disabled={isLoadingBulkPackages || isUploadingBulkImages} className="admin-button admin-button-secondary">
            <Upload className="h-4 w-4" /> Upload images
          </button>
          <label className="admin-sync-scope">
            <input type="checkbox" checked={syncOnlyActive} onChange={event => setSyncOnlyActive(event.target.checked)} />
            Active games only
          </label>
          <button type="button" onClick={handleSyncPackages} disabled={isSyncing} className="admin-button admin-button-primary">
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing packages…" : "Sync packages"}
          </button>
        </div>
      </div>

      <div className="admin-package-stats">
        {[
          { label: "WebBuilder", value: kpi.webbuilderPkgs, detail: `${(kpi.webbuilderConfiguredPkgs ?? 0).toLocaleString("en-US")} prices configured`, icon: Globe, tone: "sky", active: supplierFilter === "webbuilder", action: () => handleSwitchSupplier("webbuilder") },
          { label: "VNGZZ2", value: kpi.vngzz2Pkgs ?? 0, detail: `${(kpi.vngzz2ConfiguredPkgs ?? 0).toLocaleString("en-US")} prices configured`, icon: Zap, tone: "violet", active: supplierFilter === "vngzz2", action: () => handleSwitchSupplier("vngzz2") },
          { label: "Prices configured", value: kpi.configuredPkgs, detail: "Packages with a selling price", icon: CheckCircle2, tone: "green", active: statusFilter === "configured", action: () => { setStatusFilter(previous => previous === "configured" ? "all" : "configured"); setPage(1); } },
          { label: "Needs a price", value: kpi.unconfiguredPkgs, detail: "Review before making available", icon: AlertCircle, tone: "amber", active: statusFilter === "unconfigured", action: () => { setStatusFilter(previous => previous === "unconfigured" ? "all" : "unconfigured"); setPage(1); } },
        ].map(stat => {
          const Icon = stat.icon;
          return <button key={stat.label} type="button" onClick={stat.action} aria-pressed={stat.active} className="admin-package-stat" data-tone={stat.tone}>
            <div className="admin-package-stat-top"><span>{stat.label}</span><span className="admin-package-stat-icon"><Icon className="h-4 w-4" /></span></div>
            <strong>{stat.value.toLocaleString("en-US")}</strong>
            <small>{stat.detail}</small>
          </button>;
        })}
      </div>

      <section className="admin-catalogue-panel" aria-label="Package catalogue">
        <div className="admin-catalogue-heading">
          <div><h2>Package catalogue</h2><p>Browse suppliers and edit your product pricing.</p></div>
          <span className="admin-catalogue-count"><Package className="h-3.5 w-3.5" /> {kpi.totalPkgs.toLocaleString("en-US")} packages</span>
        </div>
        <div className="admin-supplier-tabs" role="group" aria-label="Filter packages by supplier">
          {[
            { id: "all", label: "All suppliers", count: kpi.totalPkgs, icon: Layers },
            { id: "webbuilder", label: "WebBuilder", count: kpi.webbuilderPkgs, icon: Globe },
            { id: "vngzz2", label: "VNGZZ2", count: kpi.vngzz2Pkgs ?? 0, icon: Zap },
            { id: "g2bulk", label: "G2Bulk", count: Math.max(0, kpi.totalPkgs - kpi.webbuilderPkgs - (kpi.vngzz2Pkgs ?? 0)), icon: Package },
          ].map(tab => {
            const Icon = tab.icon;
            return <button key={tab.id} type="button" onClick={() => handleSwitchSupplier(tab.id)} aria-pressed={supplierFilter === tab.id} className="admin-supplier-tab"><Icon className="h-4 w-4" /><span>{tab.label}</span><small>{tab.count.toLocaleString("en-US")}</small></button>;
          })}
        </div>

      {/* Floating / Sticky Unsaved Changes Bar */}
      {dirtyCount > 0 && (
        <div className="sticky top-4 z-40 flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/95 border-2 border-emerald-500 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <span className="text-xs sm:text-sm font-black text-white">
                You have <span className="text-emerald-300 font-mono font-black">{dirtyCount}</span> unsaved package pricing change{dirtyCount > 1 ? "s" : ""}
              </span>
              <span className="hidden sm:inline text-[11px] text-slate-300 ml-2">
                Save them all at once or individually.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardChanges}
              disabled={isSavingAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Discard</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAllDirty}
              disabled={isSavingAll}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all shadow-lg shadow-emerald-500/30 disabled:opacity-50 cursor-pointer"
            >
              <Save className={`h-3.5 w-3.5 ${isSavingAll ? "animate-spin" : ""}`} />
              <span>{isSavingAll ? "Saving Packages..." : `Save All Changes (${dirtyCount})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="admin-package-filters">
        <div className="admin-package-search relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] pointer-events-none" />
          <input
            type="text"
            aria-label="Search packages"
            placeholder="Search packages or product codes…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[#243047] bg-[#151F31] pl-10 pr-4 py-2 text-xs sm:text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
          />
        </div>

        <div className="admin-package-filter-controls">
          {/* Contextual Filter by Game (Only shows games belonging to current supplier) */}
          <select
            aria-label="Filter by game"
            value={gameFilter}
            onChange={(e) => {
              setGameFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none min-w-[180px] max-w-[240px]"
          >
            <option value="all">
              {supplierFilter === "webbuilder"
                ? `All WebBuilder Games (${filteredGames.length})`
                : supplierFilter === "vngzz2"
                ? `All VNGZZ2 Games (${filteredGames.length})`
                : `All Games (${availableGames.length})`}
            </option>

            {supplierFilter === "all" ? (
              <>
                <optgroup label="WebBuilder Wholesale Games">
                  {availableGames
                    .filter((g) => g.supplier === "webbuilder")
                    .map((g) => (
                      <option key={`wb:${g.code || g.slug}`} value={g.slug}>
                        {g.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="VNGZZ2 Catalog Games">
                  {availableGames
                    .filter((g) => g.supplier === "vngzz2")
                    .map((g) => (
                      <option key={`vng:${g.code || g.slug}`} value={g.slug}>
                        {g.name}
                      </option>
                    ))}
                </optgroup>
                {availableGames.filter((g) => g.supplier !== "webbuilder" && g.supplier !== "vngzz2").length > 0 && (
                  <optgroup label="🛡️ Other Suppliers">
                    {availableGames
                      .filter((g) => g.supplier !== "webbuilder" && g.supplier !== "vngzz2")
                      .map((g) => (
                        <option key={`oth:${g.code || g.slug}`} value={g.slug}>
                          {g.name} ({g.supplier.toUpperCase()})
                        </option>
                      ))}
                  </optgroup>
                )}
              </>
            ) : (
              filteredGames.map((g) => (
                <option key={`${g.supplier}:${g.code || g.slug}`} value={g.code || g.slug}>
                  {g.name}
                </option>
              ))
            )}
          </select>

          {/* Supplier Availability Filter */}
          <select
            aria-label="Filter by supplier availability"
            value={supplierAvailability}
            onChange={(e) => {
              setSupplierAvailability(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
          >
            <option value="available">Supplier available</option>
            <option value="unavailable">Supplier unavailable</option>
            <option value="all">All statuses</option>
          </select>

          {/* Price Configuration Filter */}
          <select
            aria-label="Filter by package status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#243047] bg-[#151F31] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] focus:border-[#22C55E] focus:outline-none"
          >
            <option value="all">All Package Statuses</option>
            <option value="unconfigured">Needs Price Setup</option>
            <option value="configured">Price Configured</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {/* Page size limit */}
          <select
            aria-label="Packages per page"
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
              Try switching supplier tabs or click &quot;Sync Packages&quot; above to import live products.
            </p>
          </div>
        ) : (
          <div className="admin-package-table-scroll overflow-auto" tabIndex={0} aria-label="Package pricing table">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243047] bg-[#151F31] text-[#94A3B8] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3.5">Image</th>
                  <th className="py-2.5 px-3.5">Package Name</th>
                  <th className="py-2.5 px-3.5">Game / Supplier</th>
                  <th className="py-2.5 px-3.5">
                    <span className="flex items-center gap-1 text-[#F8FAFC]">
                      <Lock className="h-3 w-3 text-[#22C55E]" /> Cost (private)
                    </span>
                  </th>
                  <th className="py-2.5 px-3.5">Selling price</th>
                  <th className="py-2.5 px-3.5">Margin</th>
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

                  if (costNum && !isNaN(sellNum)) {
                    profitAmount = Math.round((sellNum - costNum) * 100) / 100;
                    marginPercent = Math.round(((sellNum - costNum) / costNum) * 1000) / 10;
                  }

                  const gameName =
                    gameNameLookup.get(pkg.gameCode.toLowerCase()) ||
                    gameNameLookup.get(pkg.gameSlug.toLowerCase()) ||
                    pkg.gameSlug;

                  return (
                    <tr
                      key={pkg.id}
                      className={`hover:bg-[#151F31]/60 transition-colors ${
                        row.isDirty ? "bg-emerald-500/[0.04]" : ""
                      }`}
                    >
                      {/* Image Thumbnail & Upload Button */}
                      <td className="py-2.5 px-3.5">
                        <button
                          type="button"
                          onClick={() => openImageModal(pkg)}
                          className="group relative flex items-center justify-center h-8 w-8 rounded-lg border border-[#243047] bg-[#151F31] hover:border-[#22C55E]/50 overflow-hidden cursor-pointer transition-all"
                          aria-label={`Change image for ${pkg.name}`}
                          title={pkg.customImage ? "Click to change custom image" : "Click to upload custom image"}
                        >
                          {pkg.customImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pkg.customImage}
                              alt={pkg.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-[#64748B] group-hover:text-[#22C55E] transition-colors" />
                          )}
                        </button>
                      </td>

                      {/* Package Name */}
                      <td className="py-2.5 px-3.5 font-semibold text-[#F8FAFC]">
                        <div className="max-w-[200px] truncate" title={pkg.name}>
                          {pkg.name}
                        </div>
                        <div className="admin-product-code" title={pkg.supplierProductCode}>{pkg.supplierProductCode}</div>
                      </td>

                      {/* Game / Supplier */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-white text-xs truncate max-w-[170px]" title={gameName}>
                          {gameName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {pkg.supplier === "webbuilder" ? (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                              🌐 WebBuilder
                            </span>
                          ) : pkg.supplier === "vngzz2" ? (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-indigo-500/15 text-indigo-300 border border-indigo-500/40">
                              ⚡ VNGZZ2
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
                              {pkg.supplier || "G2Bulk"}
                            </span>
                          )}
                          {!pkg.supplierAvailable && (
                            <span className="inline-block rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                              Unavailable
                            </span>
                          )}
                        </div>
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
                            aria-label={`Selling price for ${pkg.name}`}
                            placeholder="Set price"
                            value={row.sellingPrice}
                            onChange={(e) => handleFieldChange(pkg.id, "sellingPrice", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleSavePackage(pkg);
                              }
                            }}
                            className={`w-full rounded-lg border pl-6 pr-2 py-1.5 font-mono text-xs font-bold text-[#F8FAFC] focus:outline-none transition-all ${
                              row.isDirty
                                ? "border-[#22C55E] bg-[rgba(34,197,94,0.12)] ring-1 ring-[#22C55E]"
                                : row.sellingPrice
                                ? "border-[#243047] bg-[#151F31] focus:border-[#22C55E]"
                                : "border-amber-500/50 bg-amber-500/10 text-amber-200 placeholder-amber-400/60"
                            }`}
                          />
                        </div>
                      </td>

                      {/* Profit Margin Preview */}
                      <td className="py-2.5 px-3.5">
                        {marginPercent !== null && profitAmount !== null ? (
                          <div
                            className={`text-[11px] font-semibold flex items-center gap-1 ${
                              profitAmount >= 0 ? "text-[#22C55E]" : "text-rose-400"
                            }`}
                          >
                            {profitAmount >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-rose-400" />
                            )}
                            <span>{profitAmount >= 0 ? `+${marginPercent}%` : `${marginPercent}%`}</span>
                            <span className="text-[9px] text-[#94A3B8] font-mono">
                              ({profitAmount >= 0 ? `+$${profitAmount.toFixed(2)}` : `-$${Math.abs(profitAmount).toFixed(2)}`})
                            </span>
                          </div>
                        ) : !row.sellingPrice ? (
                          <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Needs price
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#64748B] font-mono">Cost unknown</span>
                        )}
                      </td>

                      {/* Badge Input */}
                      <td className="py-2.5 px-3.5">
                        <input
                          type="text"
                          aria-label={`Badge for ${pkg.name}`}
                          placeholder="e.g. HOT DEAL"
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
                              ? "bg-[#22C55E] hover:bg-[#16A34A] text-[#080D18] shadow-md ring-2 ring-emerald-400"
                              : "bg-[#151F31] text-[#64748B] hover:text-[#F8FAFC] disabled:opacity-30"
                          }`}
                          aria-label={`Save ${pkg.name}`}
                          title={row.isDirty ? "Save price change (or press Enter)" : "Saved"}
                        >
                          {savingId === pkg.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
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

      {/* Bulk PNG Upload Modal */}
      </section>

      {isBulkImageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Bulk package PNG upload" className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-[#111A2B] border border-[#243047] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#243047]">
              <div>
                <div className="flex items-center gap-2 text-violet-300">
                  <Upload className="h-5 w-5" />
                  <h3 className="text-base font-bold text-[#F8FAFC]">Bulk Upload Package PNGs</h3>
                </div>
                <p className="mt-1 text-xs text-[#94A3B8]">Choose one PNG for each package. Matching filenames are assigned automatically; you can change each match.</p>
              </div>
              <button
                type="button"
                onClick={closeBulkImageModal}
                disabled={isUploadingBulkImages}
                className="p-1 rounded-lg hover:bg-[#151F31] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Close bulk image upload"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <label className="block rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-4 text-center cursor-pointer hover:bg-violet-500/10 transition-colors">
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept=".png,image/png"
                  multiple
                  disabled={isLoadingBulkPackages || isUploadingBulkImages}
                  onChange={handleBulkPngSelection}
                  className="sr-only"
                />
                <span className="text-sm font-bold text-violet-200">Select multiple PNG files</span>
                <span className="block mt-1 text-[11px] text-[#94A3B8]">Up to 3 MB each. Filenames matching a package name, product code, or ID will be preselected.</span>
              </label>

              {isLoadingBulkPackages ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#94A3B8]">
                  <RefreshCw className="h-4 w-4 animate-spin text-violet-300" />
                  Loading all packages...
                </div>
              ) : bulkImageRows.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>{bulkImageRows.length} PNG file{bulkImageRows.length === 1 ? "" : "s"} selected</span>
                    <span>{bulkImagePackages.length} packages available</span>
                  </div>
                  <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                    {bulkImageRows.map((row, index) => (
                      <div key={`${row.file.name}-${row.file.lastModified}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[#243047] bg-[#0D1422] p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#F8FAFC]" title={row.file.name}>{row.file.name}</p>
                          <p className="mt-1 text-[10px] text-[#64748B]">{(row.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          {row.error ? <p className="mt-1 text-[10px] text-red-300">{row.error}</p> : null}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <select
                            value={row.packageId}
                            disabled={isUploadingBulkImages || row.status === "done"}
                            onChange={(event) => setBulkImageRows((previous) => previous.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, packageId: event.target.value } : item
                            ))}
                            aria-label={`Package for ${row.file.name}`}
                            className="min-w-0 flex-1 rounded-lg border border-[#243047] bg-[#151F31] px-2.5 py-2 text-xs text-[#F8FAFC] focus:border-violet-400 focus:outline-none"
                          >
                            <option value="">Choose package...</option>
                            {bulkImagePackages.map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>
                                {pkg.gameSlug} · {pkg.name} · {pkg.supplierProductCode}
                              </option>
                            ))}
                          </select>
                          <span className={`w-16 shrink-0 text-right text-[10px] font-bold ${
                            row.status === "done" ? "text-emerald-300" : row.status === "error" ? "text-red-300" : row.status === "uploading" ? "text-violet-300" : "text-[#64748B]"
                          }`}>
                            {row.status === "done" ? "Uploaded" : row.status === "error" ? "Retry" : row.status === "uploading" ? "Uploading" : "Ready"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasDuplicateBulkTargets ? <p className="text-xs text-amber-300">Assign each PNG to a different package.</p> : null}
                  {bulkImageRows.some((row) => !row.packageId) ? <p className="text-xs text-amber-300">Choose a package for every PNG before uploading.</p> : null}
                </div>
              ) : (
                <p className="py-5 text-center text-xs text-[#64748B]">Selected PNGs will appear here for package matching.</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#243047] p-5">
              <button
                type="button"
                onClick={closeBulkImageModal}
                disabled={isUploadingBulkImages}
                className="rounded-lg border border-[#243047] bg-[#151F31] px-3.5 py-2 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkImageUpload}
                disabled={!canUploadBulkImages || isLoadingBulkPackages || isUploadingBulkImages}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploadingBulkImages ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{isUploadingBulkImages ? `Uploading ${bulkUploadProgress} of ${bulkImageRows.length}...` : `Upload ${bulkImageRows.length || ""} PNG${bulkImageRows.length === 1 ? "" : "s"}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

export default function AdminPackagesPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-page p-12 text-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#22C55E]" />
          <p className="text-xs text-[#94A3B8]">Loading package manager...</p>
        </div>
      }
    >
      <PackagesManagerContent />
    </Suspense>
  );
}
