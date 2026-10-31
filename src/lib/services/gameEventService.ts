import "server-only";
import { cache } from "react";
import { GameEvent } from "@/models/GameEvent";
import { GameEventView } from "@/lib/gameEventTypes";
import { cachePublicQuery, GAME_EVENTS_TAG } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

const readPublicGameEvents = cache(cachePublicQuery("game-events", GAME_EVENTS_TAG, async (): Promise<GameEventView[]> =>
  withCatalogueTimeout(catalogueQuery("game-events", async () => {
    const events = await GameEvent.find({ isActive: true })
      .select("game title description details startDate endDate status imageUrl targetUrl isActive sortOrder updatedAt")
      .sort({ sortOrder: 1, startDate: 1, createdAt: -1 })
      .limit(15)
      .maxTimeMS(4000)
      .lean();

    return events.map((event) => ({
      id: String(event._id),
      game: event.game,
      title: event.title,
      description: event.description,
      details: event.details || "",
      startDate: new Date(event.startDate).toISOString(),
      endDate: new Date(event.endDate).toISOString(),
      status: event.status,
      imageUrl: event.imageUrl.startsWith("/api/game-events/")
        ? `${event.imageUrl.split("?")[0]}?v=${new Date(event.updatedAt).getTime()}`
        : event.imageUrl,
      targetUrl: event.targetUrl || "",
      isActive: event.isActive !== false,
      sortOrder: event.sortOrder || 0,
    }));
  }))
));

export async function getPublicGameEvents(): Promise<GameEventView[]> {
  return readPublicGameEvents();
}
