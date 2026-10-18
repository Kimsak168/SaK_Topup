"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Image as ImageIcon, Plus, Edit2, Trash2, RefreshCw, Check, X, Upload } from "lucide-react";

interface BannerItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  targetUrl: string;
  ctaText: string;
  accentColor: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = {
  title: "",
  subtitle: "",
  badge: "",
  imageUrl: "",
  targetUrl: "",
  ctaText: "",
  accentColor: "green",
  sortOrder: 0,
  isActive: true,
};

const inputClass = "w-full rounded-lg border border-[#243047] bg-[#0C1322] px-3 py-2 text-sm text-[#F8FAFC] placeholder:text-[#64748B] outline-none transition-colors focus:border-[#22C55E] focus:ring-1 focus:ring-[#22C55E]/20";

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/admin/banners", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load banners.");
      setBanners(data.banners);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "Could not load banners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBanners();
  }, [fetchBanners]);

  useEffect(() => {
    if (!showModal) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openEditor = (banner?: BannerItem) => {
    setEditingBanner(banner ?? null);
    setForm(banner ? { ...banner } : { ...emptyForm, sortOrder: banners.length + 1 });
    setImageFile(null);
    setPreviewUrl("");
    setShowModal(true);
  };

  const closeEditor = () => {
    if (isSaving) return;
    setShowModal(false);
    setImageFile(null);
    setPreviewUrl("");
  };

  const selectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Choose a PNG, JPG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      toast.error("Choose an image up to 25 MB.");
      event.target.value = "";
      return;
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const saveBanner = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || (!imageFile && !editingBanner?.imageUrl)) {
      toast.error("Add a banner title and image.");
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl = form.imageUrl || editingBanner?.imageUrl || "";

      // If a large image (> 4.5MB) is selected, upload directly to Vercel Blob to bypass function limits
      if (imageFile && imageFile.size > 4.5 * 1024 * 1024) {
        toast.info("Uploading large banner directly to Vercel Blob...");
        const { uploadAdminImage } = await import("@/lib/clientBlobUpload");
        const blobResult = await uploadAdminImage(imageFile, "banners", editingBanner?.imageUrl);
        finalImageUrl = blobResult.url;
      }

      const payload = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key !== "imageUrl") payload.set(key, String(value));
      }
      if (finalImageUrl) payload.set("imageUrl", finalImageUrl);
      if (editingBanner) payload.set("bannerId", editingBanner.id);
      // If smaller than 4.5MB and not directly uploaded, send to server
      if (imageFile && imageFile.size <= 4.5 * 1024 * 1024) {
        payload.set("image", imageFile);
      }

      const response = await fetch("/api/admin/banners", {
        method: editingBanner ? "PATCH" : "POST",
        body: payload,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save banner.");
      toast.success(editingBanner ? "Banner updated with Vercel Blob" : "Banner uploaded to Vercel Blob");
      setShowModal(false);
      setImageFile(null);
      setPreviewUrl("");
      void fetchBanners();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save banner. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBanner = async (banner: BannerItem) => {
    if (!confirm(`Delete "${banner.title}"?`)) return;
    setBusyId(banner.id);
    try {
      const response = await fetch(`/api/admin/banners?bannerId=${banner.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not delete banner.");
      setBanners((previous) => previous.filter((item) => item.id !== banner.id));
      toast.success("Banner deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete banner.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleBanner = async (banner: BannerItem) => {
    setBusyId(banner.id);
    try {
      const response = await fetch("/api/admin/banners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerId: banner.id, isActive: !banner.isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update banner.");
      setBanners((previous) => previous.map((item) => item.id === banner.id ? { ...item, isActive: !item.isActive } : item));
      toast.success(banner.isActive ? "Banner hidden" : "Banner is live");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update banner.");
    } finally {
      setBusyId(null);
    }
  };

  const currentImage = previewUrl || form.imageUrl;

  return (
    <div className="admin-page animate-in fade-in duration-300">
      <div className="admin-page-heading">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-[#F8FAFC]">Promotional Banners</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]">
              {banners.filter((b) => b.isActive).length} / 4 Slots Active
            </span>
          </div>
          <p className="text-xs text-[#94A3B8]">Upload, replace, and order up to 4 homepage promotional banner slots stored in Vercel Blob.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchBanners()} disabled={loading} aria-label="Refresh banners" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#243047] bg-[#111A2B] text-[#94A3B8] transition hover:bg-[#151F31] hover:text-[#F8FAFC] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => openEditor()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#22C55E] px-3.5 text-xs font-semibold text-slate-950 transition hover:bg-[#16A34A]">
            <Plus className="h-4 w-4" /> Add banner slot
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-xs text-[#94A3B8]" role="status">
          <RefreshCw className="h-5 w-5 animate-spin text-[#22C55E]" /> Loading banners…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[#243047] bg-[#111A2B] px-6 py-12 text-center">
          <p className="text-xs text-rose-400">Banners could not be loaded.</p>
          <button onClick={() => void fetchBanners()} className="mt-4 rounded-lg border border-[#243047] bg-[#151F31] px-3.5 py-1.5 text-xs text-[#F8FAFC] hover:bg-[#243047]">Try again</button>
        </div>
      ) : banners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#243047] bg-[#111A2B] px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#151F31] text-[#94A3B8]"><ImageIcon className="h-5 w-5" /></div>
          <p className="text-sm font-semibold text-[#F8FAFC]">No promotional banners configured</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#64748B]">Upload your artwork to populate the four homepage banner slots with Vercel Blob.</p>
          <button onClick={() => openEditor()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#22C55E] px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[#16A34A]"><Upload className="h-3.5 w-3.5" /> Upload first banner</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {banners.map((banner, index) => {
            const isBlob = banner.imageUrl.includes(".blob.vercel-storage.com");
            return (
              <article key={banner.id} className="min-w-0 overflow-hidden rounded-xl border border-[#243047] bg-[#111A2B]">
                <div className="relative aspect-video overflow-hidden border-b border-[#243047]" style={{ aspectRatio: "16 / 9" }}>
                  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
                    <Image
                      src={banner.imageUrl}
                      alt=""
                      fill
                      unoptimized
                      aria-hidden="true"
                      className="object-cover scale-125 blur-2xl opacity-60"
                    />
                    <Image
                      src={banner.imageUrl}
                      alt=""
                      fill
                      unoptimized
                      aria-hidden="true"
                      className="object-cover scale-110 blur-xl opacity-50 brightness-95"
                    />
                  </div>
                  <Image
                    src={banner.imageUrl}
                    alt={banner.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 90vw"
                    className="relative z-10 object-contain object-center"
                  />
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-[#F8FAFC]">{banner.title}</h2>
                        {isBlob && (
                          <span className="shrink-0 rounded border border-[#22C55E]/30 bg-[#22C55E]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#22C55E]">
                            Vercel Blob
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#64748B]">{banner.targetUrl || "No destination link"}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-[#243047] bg-[#151F31] px-2 py-0.5 text-[11px] font-semibold text-[#94A3B8]">
                      Slot #{banner.sortOrder || index + 1}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-[#243047]/60 pt-3">
                    <button onClick={() => void toggleBanner(banner)} disabled={busyId === banner.id} aria-pressed={banner.isActive} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition disabled:opacity-50 ${banner.isActive ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20" : "border-[#243047] bg-[#151F31] text-[#64748B] hover:text-[#F8FAFC]"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${banner.isActive ? "bg-[#22C55E]" : "bg-[#64748B]"}`} />{banner.isActive ? "Live on Homepage" : "Hidden"}
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditor(banner)} disabled={busyId === banner.id} aria-label={`Edit ${banner.title}`} title="Replace image or edit slot" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#243047] text-[#94A3B8] transition hover:bg-[#151F31] hover:text-[#F8FAFC] disabled:opacity-50"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => void deleteBanner(banner)} disabled={busyId === banner.id} aria-label={`Delete ${banner.title}`} title="Delete banner & remove blob" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#243047] text-[#64748B] transition hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showModal && (
        <dialog ref={dialogRef} aria-labelledby="banner-dialog-title" onCancel={(event) => { event.preventDefault(); closeEditor(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-[#243047] bg-[#111A2B] p-0 text-[#F8FAFC] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[#243047] px-5 py-3.5">
            <h2 id="banner-dialog-title" className="text-sm font-bold text-[#F8FAFC]">{editingBanner ? "Edit banner" : "Add banner"}</h2>
            <button onClick={closeEditor} disabled={isSaving} aria-label="Close banner editor" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#151F31] hover:text-[#F8FAFC] disabled:opacity-50"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={saveBanner} className="space-y-4 p-5">
            <fieldset disabled={isSaving} className="space-y-4 disabled:opacity-70">
              <div className="space-y-1.5">
                <label htmlFor="banner-title" className="text-xs font-semibold text-[#94A3B8]">Banner title</label>
                <input id="banner-title" type="text" autoFocus required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Give your banner a name" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="banner-image" className="text-xs font-semibold text-[#94A3B8]">Banner image</label>
                {currentImage && (
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-[#243047]" style={{ aspectRatio: "16 / 9" }}>
                    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
                      <Image
                        src={currentImage}
                        alt=""
                        fill
                        unoptimized
                        aria-hidden="true"
                        className="object-cover scale-125 blur-2xl opacity-60"
                      />
                      <Image
                        src={currentImage}
                        alt=""
                        fill
                        unoptimized
                        aria-hidden="true"
                        className="object-cover scale-110 blur-xl opacity-50 brightness-95"
                      />
                    </div>
                    <Image
                      src={currentImage}
                      alt="Banner preview"
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 90vw"
                      className="relative z-10 object-contain object-center"
                    />
                  </div>
                )}
                <div className="rounded-lg border border-dashed border-[#243047] bg-[#0C1322]/50 p-3.5">
                  <input id="banner-image" type="file" accept="image/png,image/jpeg,image/webp" required={!editingBanner && !imageFile} onChange={selectImage} aria-describedby="banner-image-help" className="w-full min-w-0 text-xs text-[#94A3B8] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#22C55E]/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#22C55E] hover:file:bg-[#22C55E]/20" />
                  <div id="banner-image-help" className="mt-2.5 space-y-1.5 rounded-lg border border-[#243047] bg-[#0C1322]/80 p-3">
                    <p className="text-xs font-semibold text-[#22C55E]">
                      Recommended banner ratio: 16:9
                    </p>
                    <p className="text-[11px] font-semibold text-[#F8FAFC]">
                      Best sizes:
                    </p>
                    <ul className="space-y-0.5 font-mono text-[11px] text-[#94A3B8]">
                      <li>1920 × 1080</li>
                      <li>1600 × 900</li>
                      <li>1280 × 720</li>
                    </ul>
                    <p className="text-[11px] text-[#64748B] pt-0.5">
                      All image ratios are accepted. Non-16:9 images display seamlessly with matching ambient background.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="banner-link" className="text-xs font-semibold text-[#94A3B8]">Destination link <span className="font-normal text-[#64748B]">(optional)</span></label>
                <input id="banner-link" type="text" maxLength={2048} value={form.targetUrl} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} placeholder="/games or https://…" className={inputClass} />
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-32 space-y-1.5">
                  <label htmlFor="banner-order" className="text-xs font-semibold text-[#94A3B8]">Slot Position (1 - 4)</label>
                  <input id="banner-order" type="number" min="1" max="4" step="1" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 1 })} className={inputClass} />
                </div>
                <label htmlFor="banner-active" className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium text-[#F8FAFC]">
                  <input id="banner-active" type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 rounded border-[#243047] bg-[#0C1322] accent-[#22C55E]" /> Show on homepage
                </label>
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-[#243047] pt-4">
              <button type="button" onClick={closeEditor} disabled={isSaving} className="rounded-lg border border-[#243047] bg-transparent px-3.5 py-2 text-xs font-medium text-[#94A3B8] transition hover:bg-[#151F31] hover:text-[#F8FAFC] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[#16A34A] disabled:opacity-50">
                {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{isSaving ? "Saving…" : editingBanner ? "Save changes" : "Upload banner"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
