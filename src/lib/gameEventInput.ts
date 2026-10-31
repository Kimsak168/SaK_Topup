import { BannerInputError, readBannerRequest } from "@/lib/bannerUpload";
import { GAME_EVENT_GAMES, GAME_EVENT_STATUSES, GameEventGame, GameEventStatus } from "@/lib/gameEventTypes";

export class GameEventInputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface GameEventFields {
  game?: GameEventGame;
  title?: string;
  description?: string;
  details?: string;
  startDate?: Date;
  endDate?: Date;
  status?: GameEventStatus;
  imageUrl?: string;
  targetUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

function readText(body: Record<string, unknown>, key: string, maxLength: number, required = false) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new GameEventInputError(`${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new GameEventInputError(`Invalid ${key}.`);
  const text = value.trim();
  if (text.length > maxLength || (required && !text)) {
    throw new GameEventInputError(text ? `${key} is too long.` : `${key} is required.`);
  }
  return text;
}

function parseEventDate(value: unknown, key: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GameEventInputError(`Choose a valid ${key}.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new GameEventInputError(`Choose a valid ${key}.`);
  }
  return date;
}

export function parseGameEventFields(body: Record<string, unknown>, creating = false): GameEventFields {
  const fields: GameEventFields = {};
  const game = readText(body, "game", 32, creating);
  if (game !== undefined) {
    if (!GAME_EVENT_GAMES.includes(game as GameEventGame)) throw new GameEventInputError("Choose a supported game.");
    fields.game = game as GameEventGame;
  }

  const title = readText(body, "title", 120, creating);
  if (title !== undefined) fields.title = title;
  const description = readText(body, "description", 320, creating);
  if (description !== undefined) fields.description = description;
  const details = readText(body, "details", 2000);
  if (details !== undefined) fields.details = details;
  const targetUrl = readText(body, "targetUrl", 2048);
  if (targetUrl !== undefined) {
    if (targetUrl && /[\u0000-\u001f\u007f]/.test(targetUrl)) {
      throw new GameEventInputError("Invalid event details link.");
    }
    if (targetUrl && !targetUrl.startsWith("/") && !/^https?:\/\//i.test(targetUrl)) {
      throw new GameEventInputError("Use a page path or an http(s) event link.");
    }
    if (targetUrl.startsWith("//") || targetUrl.includes("\\")) {
      throw new GameEventInputError("Use a page path or an http(s) event link.");
    }
    fields.targetUrl = targetUrl;
  }

  for (const key of ["startDate", "endDate"] as const) {
    if (body[key] !== undefined) fields[key] = parseEventDate(body[key], key === "startDate" ? "start date" : "end date");
    else if (creating) throw new GameEventInputError(`Choose a ${key === "startDate" ? "start" : "end"} date.`);
  }

  const status = readText(body, "status", 16, creating);
  if (status !== undefined) {
    if (!GAME_EVENT_STATUSES.includes(status as GameEventStatus)) throw new GameEventInputError("Choose a valid event status.");
    fields.status = status as GameEventStatus;
  }

  const imageUrl = readText(body, "imageUrl", 2048);
  if (imageUrl !== undefined) fields.imageUrl = imageUrl;

  if (body.isActive !== undefined) {
    if (![true, false, "true", "false"].includes(body.isActive as boolean | string)) {
      throw new GameEventInputError("Invalid event visibility.");
    }
    fields.isActive = body.isActive === true || body.isActive === "true";
  } else if (creating) {
    fields.isActive = true;
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
      throw new GameEventInputError("Sort order must be a whole number from 0 to 10000.");
    }
    fields.sortOrder = sortOrder;
  } else if (creating) {
    fields.sortOrder = 0;
  }

  return fields;
}

export function validateGameEventDateRange(startDate: Date, endDate: Date) {
  if (startDate.getTime() > endDate.getTime()) {
    throw new GameEventInputError("The event end date must be on or after the start date.");
  }
}

export async function readGameEventRequest(request: Request) {
  try {
    return await readBannerRequest(request);
  } catch (error) {
    if (error instanceof BannerInputError) {
      throw new GameEventInputError(error.message.replace(/banner/gi, "event banner"), error.status);
    }
    throw error;
  }
}
