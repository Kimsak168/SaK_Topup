"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import {
  GAME_EVENT_GAME_LABELS,
  GAME_EVENT_STATUS_LABELS,
  GameEventStatus,
  GameEventView,
} from "@/lib/gameEventTypes";
import styles from "./GameEventsCarousel.module.css";

const STATUS_CLASS: Record<GameEventStatus, string> = {
  upcoming: styles.statusUpcoming,
  live: styles.statusLive,
  ended: styles.statusEnded,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateRange(startDate: string, endDate: string) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return start === end ? start : `${start} – ${end}`;
}

interface GameEventsCarouselProps {
  events: GameEventView[];
  unavailable?: boolean;
}

export function GameEventsCarousel({ events, unavailable = false }: GameEventsCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<GameEventView | null>(null);

  const scrollToIndex = useCallback((index: number) => {
    const viewport = viewportRef.current;
    const card = viewport?.querySelector<HTMLElement>(`[data-event-index="${index}"]`);
    if (!viewport || !card) return;
    const distance = card.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
    const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
    viewport.scrollTo({ left: viewport.scrollLeft + distance, behavior });
    setActiveIndex(index);
  }, [reducedMotion]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (events.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      scrollToIndex((activeIndex + 1) % events.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeIndex, events.length, paused, reducedMotion, scrollToIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedEvent && dialog && !dialog.open) dialog.showModal();
    else if (!selectedEvent && dialog?.open) dialog.close();
  }, [selectedEvent]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>("[data-event-index]"));
      if (!cards.length) return;
      const viewportLeft = viewport.getBoundingClientRect().left;
      const nearest = cards.reduce((best, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left - viewportLeft);
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY });
      setActiveIndex(nearest.index);
    });
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
  }

  return (
    <section className={`home-section ${styles.section}`} aria-labelledby="game-events-title">
      <div className={`home-section-heading ${styles.heading}`}>
        <div>
          <p className={styles.eyebrow}>Seasonal highlights</p>
          <h2 id="game-events-title">Game Events</h2>
          <p>Discover the latest gaming events and promotions.</p>
        </div>
        {events.length > 0 && (
          <div className={styles.controls} aria-label="Game event carousel controls">
            <button type="button" onClick={() => scrollToIndex((activeIndex - 1 + events.length) % events.length)} aria-label="Previous events">
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scrollToIndex((activeIndex + 1) % events.length)} aria-label="Next events">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}><CalendarDays aria-hidden="true" /></span>
          <div>
            <h3>{unavailable ? "Game events are temporarily unavailable" : "New events are on the way"}</h3>
            <p>{unavailable ? "Please check back soon." : "Check back soon for game events, limited-time promotions, and rewards."}</p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={viewportRef}
            className={styles.viewport}
            role="region"
            aria-roledescription="carousel"
            aria-label="Game events"
            onScroll={handleScroll}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={handleBlur}
          >
            <div className={styles.track}>
              {events.map((event, index) => (
                <article
                  key={event.id}
                  data-event-index={index}
                  className={styles.card}
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${events.length}: ${event.title}`}
                >
                  <div className={styles.imageFrame}>
                    <Image
                      src={event.imageUrl}
                      alt={`${GAME_EVENT_GAME_LABELS[event.game]} event banner`}
                      fill
                      sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 1200px) calc(100vw - 48px), 1100px"
                      className={styles.image}
                    />
                    <div className={styles.imageShade} aria-hidden="true" />
                    <span className={styles.gameTag}>{GAME_EVENT_GAME_LABELS[event.game]}</span>
                    <span className={`${styles.status} ${STATUS_CLASS[event.status]}`}>
                      <span aria-hidden="true" />{GAME_EVENT_STATUS_LABELS[event.status]}
                    </span>
                    <div className={styles.cardBody}>
                      <p className={styles.date}><CalendarDays aria-hidden="true" />{formatDateRange(event.startDate, event.endDate)}</p>
                      <h3>{event.title}</h3>
                      <p className={styles.description}>{event.description}</p>
                      <button type="button" className={styles.detailsButton} onClick={() => setSelectedEvent(event)}>
                        View Details <ChevronRight aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {events.length > 1 && (
            <div className={styles.pagination} aria-label="Choose an event">
              {events.map((event, index) => (
                <button
                  key={event.id}
                  type="button"
                  aria-label={`Show event ${index + 1}: ${event.title}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  onClick={() => scrollToIndex(index)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setSelectedEvent(null)}>
        {selectedEvent && (
          <div className={styles.dialogContent}>
            <button type="button" className={styles.dialogClose} aria-label="Close event details" onClick={() => dialogRef.current?.close()}>
              <X aria-hidden="true" />
            </button>
            <div className={styles.dialogImage}>
              <Image src={selectedEvent.imageUrl} alt={`${GAME_EVENT_GAME_LABELS[selectedEvent.game]} event banner`} fill sizes="(max-width: 600px) 90vw, 560px" />
            </div>
            <span className={`${styles.status} ${STATUS_CLASS[selectedEvent.status]}`}>
              <span aria-hidden="true" />{GAME_EVENT_STATUS_LABELS[selectedEvent.status]}
            </span>
            <p className={styles.dialogGame}>{GAME_EVENT_GAME_LABELS[selectedEvent.game]}</p>
            <h2>{selectedEvent.title}</h2>
            <p>{selectedEvent.details || selectedEvent.description}</p>
            <p className={styles.dialogDate}><CalendarDays aria-hidden="true" />{formatDateRange(selectedEvent.startDate, selectedEvent.endDate)}</p>
            {selectedEvent.targetUrl && (
              <a
                href={selectedEvent.targetUrl}
                target={/^https?:\/\//i.test(selectedEvent.targetUrl) ? "_blank" : undefined}
                rel={/^https?:\/\//i.test(selectedEvent.targetUrl) ? "noopener noreferrer" : undefined}
                className={styles.externalLink}
              >
                Open event page <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
