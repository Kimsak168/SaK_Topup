"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Edit2, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  GAME_EVENT_GAME_LABELS,
  GAME_EVENT_GAMES,
  GAME_EVENT_STATUS_LABELS,
  GAME_EVENT_STATUSES,
  GameEventGame,
  GameEventStatus,
  GameEventView,
} from "@/lib/gameEventTypes";

interface EventForm {
  game: GameEventGame;
  title: string;
  description: string;
  details: string;
  startDate: string;
  endDate: string;
  status: GameEventStatus;
  imageUrl: string;
  targetUrl: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_FORM: EventForm = {
  game: "pubg-mobile",
  title: "",
  description: "",
  details: "",
  startDate: "",
  endDate: "",
  status: "upcoming",
  imageUrl: "",
  targetUrl: "",
  isActive: true,
  sortOrder: 0,
};

const INPUT_CLASS = "admin-input w-full";

function dateInputValue(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function toForm(event?: GameEventView): EventForm {
  if (!event) return { ...EMPTY_FORM };
  return {
    game: event.game,
    title: event.title,
    description: event.description,
    details: event.details,
    startDate: dateInputValue(event.startDate),
    endDate: dateInputValue(event.endDate),
    status: event.status,
    imageUrl: event.imageUrl,
    targetUrl: event.targetUrl,
    isActive: event.isActive,
    sortOrder: event.sortOrder,
  };
}

export default function AdminGameEventsPage() {
  const [events, setEvents] = useState<GameEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GameEventView | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/admin/game-events", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.events)) {
        throw new Error(data.error || "Could not load game events.");
      }
      setEvents(data.events as GameEventView[]);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "Could not load game events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!showModal) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function openEditor(event?: GameEventView) {
    setEditingEvent(event ?? null);
    setForm(event ? toForm(event) : { ...EMPTY_FORM, sortOrder: events.length });
    setImageFile(null);
    setPreviewUrl("");
    setShowModal(true);
  }

  function closeEditor() {
    if (isSaving) return;
    setShowModal(false);
    setImageFile(null);
    setPreviewUrl("");
  }

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Choose a PNG, JPG, WebP, or GIF event banner.");
      event.target.value = "";
      return;
    }
    if (file.size === 0 || file.size > 4.5 * 1024 * 1024) {
      toast.error("Choose an event banner up to 4.5 MB.");
      event.target.value = "";
      return;
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function saveEvent(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.startDate || !form.endDate || (!imageFile && !editingEvent?.imageUrl)) {
      toast.error("Add the event details, dates, and a banner image.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = new FormData();
      for (const [key, value] of Object.entries(form)) payload.set(key, String(value));
      if (editingEvent) payload.set("eventId", editingEvent.id);
      if (imageFile) payload.set("image", imageFile);

      const response = await fetch("/api/admin/game-events", {
        method: editingEvent ? "PATCH" : "POST",
        body: payload,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save game event.");
      toast.success(editingEvent ? "Game event updated" : "Game event created");
      setShowModal(false);
      setImageFile(null);
      setPreviewUrl("");
      void fetchEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save game event.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleEvent(event: GameEventView) {
    setBusyId(event.id);
    try {
      const response = await fetch("/api/admin/game-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, isActive: !event.isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update event visibility.");
      setEvents((previous) => previous.map((item) => item.id === event.id ? { ...item, isActive: !event.isActive } : item));
      toast.success(event.isActive ? "Event hidden from the homepage" : "Event is visible on the homepage");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update event visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEvent(event: GameEventView) {
    if (!confirm(`Delete “${event.title}”?`)) return;
    setBusyId(event.id);
    try {
      const response = await fetch(`/api/admin/game-events?eventId=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not delete game event.");
      setEvents((previous) => previous.filter((item) => item.id !== event.id));
      toast.success("Game event deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete game event.");
    } finally {
      setBusyId(null);
    }
  }

  const imagePreview = previewUrl || form.imageUrl;

  return (
    <div className="admin-page animate-in fade-in duration-300">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Homepage content</p>
          <h1>Game Events</h1>
          <p>Manage event banners, schedules, status, and homepage visibility.</p>
        </div>
        <div className="admin-heading-actions">
          <span className="admin-connection">{events.filter((event) => event.isActive).length} active</span>
          <button type="button" onClick={() => void fetchEvents()} disabled={loading} aria-label="Refresh game events" className="admin-button admin-button-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={() => openEditor()} className="admin-button admin-button-primary">
            <Plus className="h-4 w-4" /> Add event
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-card flex min-h-56 items-center justify-center gap-3 text-sm text-[var(--admin-muted)]" role="status">
          <RefreshCw className="h-5 w-5 animate-spin" /> Loading game events…
        </div>
      ) : loadError ? (
        <div className="admin-card text-center">
          <p>Game events could not be loaded.</p>
          <button type="button" onClick={() => void fetchEvents()} className="admin-button admin-button-secondary mt-4">Try again</button>
        </div>
      ) : events.length === 0 ? (
        <div className="admin-card py-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[var(--admin-accent)]" />
          <h2 className="mt-3">No game events yet</h2>
          <p className="admin-page-description">Add a confirmed event for PUBG Mobile, Mobile Legends, Free Fire, Roblox, or Call of Duty.</p>
          <button type="button" onClick={() => openEditor()} className="admin-button admin-button-primary mt-4"><Plus className="h-4 w-4" /> Add first event</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {events.map((event) => (
            <article key={event.id} className="admin-card flex min-w-0 flex-col gap-4 sm:flex-row">
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-pink-100 sm:w-48">
                <Image src={event.imageUrl} alt={`${GAME_EVENT_GAME_LABELS[event.game]} event banner`} fill sizes="(max-width: 640px) 100vw, 192px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="admin-eyebrow">{GAME_EVENT_GAME_LABELS[event.game]}</p>
                    <h2 className="truncate">{event.title}</h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${event.status === "live" ? "bg-pink-100 text-pink-800" : event.status === "upcoming" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                    {GAME_EVENT_STATUS_LABELS[event.status]}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-[var(--admin-secondary)]">{event.description}</p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--admin-muted)]"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.startDate)} – {formatDate(event.endDate)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  <button type="button" onClick={() => openEditor(event)} className="admin-button admin-button-secondary min-h-8 px-2.5 text-xs"><Edit2 className="h-3.5 w-3.5" /> Edit</button>
                  <button type="button" onClick={() => void toggleEvent(event)} disabled={busyId === event.id} aria-pressed={event.isActive} className="admin-button admin-button-secondary min-h-8 px-2.5 text-xs">
                    {busyId === event.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : event.isActive ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                    {event.isActive ? "Visible" : "Hidden"}
                  </button>
                  <button type="button" onClick={() => void deleteEvent(event)} disabled={busyId === event.id} aria-label={`Delete ${event.title}`} className="admin-button admin-button-secondary min-h-8 px-2.5 text-xs text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="game-event-dialog-title"
        onCancel={(event) => { event.preventDefault(); closeEditor(); }}
        onClose={() => setShowModal(false)}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-0 text-[var(--admin-primary)] shadow-2xl backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between border-b border-[var(--admin-border)] px-5 py-4">
          <div>
            <p className="admin-eyebrow">Homepage content</p>
            <h2 id="game-event-dialog-title">{editingEvent ? "Edit game event" : "Add game event"}</h2>
          </div>
          <button type="button" onClick={closeEditor} disabled={isSaving} aria-label="Close event editor" className="admin-icon-button"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={saveEvent} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)]">
            Game
            <select className={INPUT_CLASS} value={form.game} onChange={(event) => setForm((current) => ({ ...current, game: event.target.value as GameEventGame }))}>
              {GAME_EVENT_GAMES.map((game) => <option key={game} value={game}>{GAME_EVENT_GAME_LABELS[game]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)]">
            Status
            <select className={INPUT_CLASS} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as GameEventStatus }))}>
              {GAME_EVENT_STATUSES.map((status) => <option key={status} value={status}>{GAME_EVENT_STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            Event title
            <input className={INPUT_CLASS} required maxLength={120} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Enter the official event name" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            Short description
            <textarea className={INPUT_CLASS} required rows={2} maxLength={320} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="A short summary for the event card" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            Details <span className="font-normal text-[var(--admin-muted)]">(optional)</span>
            <textarea className={INPUT_CLASS} rows={4} maxLength={2000} value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} placeholder="More information shown in View Details" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)]">
            Start date
            <input className={INPUT_CLASS} type="date" required value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)]">
            End date
            <input className={INPUT_CLASS} type="date" required value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            Event banner
            <input className="w-full text-xs text-[var(--admin-secondary)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-pink-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-pink-800" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required={!editingEvent} onChange={selectImage} />
            <span className="admin-helper">Up to 4.5 MB. Still images are resized and optimized before storage.</span>
          </label>
          {imagePreview && (
            <div className="relative aspect-video overflow-hidden rounded-lg border border-[var(--admin-border)] bg-pink-50 sm:col-span-2">
              <Image src={imagePreview} alt="Event banner preview" fill sizes="(max-width: 640px) 100vw, 600px" className="object-cover" unoptimized={Boolean(previewUrl)} />
            </div>
          )}
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            Event details link <span className="font-normal text-[var(--admin-muted)]">(optional)</span>
            <input className={INPUT_CLASS} type="text" maxLength={2048} value={form.targetUrl} onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))} placeholder="https://official-event-page.example or /games" />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-[var(--admin-secondary)] sm:col-span-2">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-pink-600" /> Show on homepage
          </label>
          <div className="flex justify-end gap-2 border-t border-[var(--admin-border)] pt-4 sm:col-span-2">
            <button type="button" onClick={closeEditor} disabled={isSaving} className="admin-button admin-button-secondary">Cancel</button>
            <button type="submit" disabled={isSaving} className="admin-button admin-button-primary">
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isSaving ? "Saving…" : editingEvent ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
