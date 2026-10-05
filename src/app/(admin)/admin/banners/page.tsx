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
  accentColor: "pink",
  sortOrder: 0,
  isActive: true,
};

const inputClass = "w-full rounded-xl border border-white/10 bg-[#0b0d1c] px-3.5 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-pink-400/70 focus:ring-2 focus:ring-pink-400/10";

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
            <h1 className="text-2xl font-bold tracking-tight text-white">Promotional Banners</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-pink-500/30 bg-pink-500/10 text-pink-300">
              {banners.filter((b) => b.isActive).length} / 4 Slots Active
            </span>
          </div>
          <p className="text-sm text-slate-400">Upload, replace, and order up to 4 homepage promotional banner slots stored in Vercel Blob.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchBanners()} disabled={loading} aria-label="Refresh banners" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => openEditor()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-pink-500 px-4 text-sm font-semibold text-white transition hover:bg-pink-400">
            <Plus className="h-4 w-4" /> Add banner slot
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-slate-400" role="status">
          <RefreshCw className="h-5 w-5 animate-spin text-pink-400" /> Loading banners…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-white/10 bg-[#111326] px-6 py-16 text-center">
          <p className="text-sm text-slate-300">Banners could not be loaded.</p>
          <button onClick={() => void fetchBanners()} className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5">Try again</button>
        </div>
      ) : banners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#111326] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400"><ImageIcon className="h-6 w-6" /></div>
          <p className="text-sm font-semibold text-white">No promotional banners configured</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Upload your artwork to populate the four homepage banner slots with Vercel Blob.</p>
          <button onClick={() => openEditor()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-pink-400/20 bg-pink-400/10 px-4 py-2.5 text-sm font-semibold text-pink-300 transition hover:bg-pink-400/20"><Upload className="h-4 w-4" /> Upload first banner</button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {banners.map((banner, index) => {
            const isBlob = banner.imageUrl.includes(".blob.vercel-storage.com");
            return (
              <article key={banner.id} className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111326]">
                <div className="relative aspect-[2.5/1] border-b border-white/5 bg-[#080a15]">
                  <Image src={banner.imageUrl} alt={banner.title} fill unoptimized sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain" />
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-white">{banner.title}</h2>
                        {isBlob && (
                          <span className="shrink-0 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                            Vercel Blob
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{banner.targetUrl || "No destination link"}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-pink-500/20 bg-pink-500/10 px-2.5 py-1 text-[11px] font-bold text-pink-300">
                      Slot #{banner.sortOrder || index + 1}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => void toggleBanner(banner)} disabled={busyId === banner.id} aria-pressed={banner.isActive} className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition disabled:opacity-50 ${banner.isActive ? "border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-400 hover:bg-emerald-400/15" : "border-white/10 bg-white/5 text-slate-400 hover:text-white"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${banner.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />{banner.isActive ? "Live on Homepage" : "Hidden"}
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditor(banner)} disabled={busyId === banner.id} aria-label={`Edit ${banner.title}`} title="Replace image or edit slot" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => void deleteBanner(banner)} disabled={busyId === banner.id} aria-label={`Delete ${banner.title}`} title="Delete banner & remove blob" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-400 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showModal && (
        <dialog ref={dialogRef} aria-labelledby="banner-dialog-title" onCancel={(event) => { event.preventDefault(); closeEditor(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111326] p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
            <h2 id="banner-dialog-title" className="text-base font-semibold">{editingBanner ? "Edit banner" : "Add banner"}</h2>
            <button onClick={closeEditor} disabled={isSaving} aria-label="Close banner editor" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={saveBanner} className="space-y-5 p-5 sm:p-6">
            <fieldset disabled={isSaving} className="space-y-5 disabled:opacity-70">
              <div className="space-y-2">
                <label htmlFor="banner-title" className="text-xs font-medium text-slate-300">Banner title</label>
                <input id="banner-title" type="text" autoFocus required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Give your banner a name" className={inputClass} />
              </div>
              <div className="space-y-2">
                <label htmlFor="banner-image" className="text-xs font-medium text-slate-300">Banner image</label>
                {currentImage && (
                  <div className="relative aspect-[2.5/1] overflow-hidden rounded-xl border border-white/10 bg-[#080a15]">
                    <Image src={currentImage} alt="Banner preview" fill unoptimized sizes="520px" className="object-contain" />
                  </div>
                )}
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
                  <input id="banner-image" type="file" accept="image/png,image/jpeg,image/webp" required={!editingBanner && !imageFile} onChange={selectImage} aria-describedby="banner-image-help" className="w-full min-w-0 text-xs text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-pink-400/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-pink-300 hover:file:bg-pink-400/20" />
                  <p id="banner-image-help" className="mt-3 text-xs text-slate-500">PNG, JPG, or WebP. Up to 4.5 MB. Securely uploaded and hosted on Vercel Blob.</p>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="banner-link" className="text-xs font-medium text-slate-300">Destination link <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="banner-link" type="text" maxLength={2048} value={form.targetUrl} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} placeholder="/games or https://…" className={inputClass} />
              </div>
              <div className="flex flex-wrap items-end gap-5">
                <div className="w-36 space-y-2">
                  <label htmlFor="banner-order" className="text-xs font-medium text-slate-300">Slot Position (1 - 4)</label>
                  <input id="banner-order" type="number" min="1" max="4" step="1" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 1 })} className={inputClass} />
                </div>
                <label htmlFor="banner-active" className="flex min-h-12 cursor-pointer items-center gap-2.5 text-sm text-slate-300">
                  <input id="banner-active" type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 rounded accent-pink-500" /> Show on homepage
                </label>
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-white/10 pt-5">
              <button type="button" onClick={closeEditor} disabled={isSaving} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:opacity-50">
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{isSaving ? "Saving…" : editingBanner ? "Save changes" : "Upload banner"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
