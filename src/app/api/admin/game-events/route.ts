import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { GameEvent } from "@/models/GameEvent";
import { GameEventInputError, parseGameEventFields, readGameEventRequest, validateGameEventDateRange } from "@/lib/gameEventInput";
import { invalidateGameEventsCache } from "@/lib/services/cacheService";
import { hasBlobToken, safeDeleteBlobIfOrphaned, uploadToBlob } from "@/lib/services/blobService";
import { invalidateLegacyImage } from "@/lib/services/legacyImageService";
import { isVercelBlobUrl } from "@/lib/blob-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EventRecord = {
  _id: unknown;
  game: string;
  title: string;
  description: string;
  details?: string;
  startDate: Date;
  endDate: Date;
  status: string;
  imageUrl: string;
  targetUrl?: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function eventResponse(event: EventRecord) {
  return {
    id: String(event._id),
    game: event.game,
    title: event.title,
    description: event.description,
    details: event.details || "",
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
    status: event.status,
    imageUrl: event.imageUrl,
    targetUrl: event.targetUrl || "",
    isActive: event.isActive !== false,
    sortOrder: event.sortOrder || 0,
  };
}

function validEventImageUrl(value: string, eventId: string) {
  if (isTrustedEventBlobUrl(value)) return true;
  const route = `/api/game-events/${eventId}/image`;
  if (value === route) return true;
  if (!value.startsWith(`${route}?v=`)) return false;
  return /^[a-z\d-]{1,64}$/i.test(value.slice(route.length + 3));
}

function isTrustedEventBlobUrl(value: string) {
  if (!isVercelBlobUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function eventImageFilename(eventId: string, contentType: string) {
  const extension = contentType === "image/gif" ? "gif"
    : contentType === "image/png" ? "png"
      : contentType === "image/jpeg" ? "jpg"
        : "webp";
  return `game-event-${eventId}.${extension}`;
}

function errorResponse(error: unknown) {
  if (error instanceof GameEventInputError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error("Game event request failed.");
  return NextResponse.json({ success: false, error: "Could not save game event changes." }, { status: 500 });
}

function requireEventId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new GameEventInputError("A valid game event ID is required.");
  }
  return value;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const events = await GameEvent.find()
      .sort({ sortOrder: 1, startDate: 1, createdAt: -1 })
      .limit(100)
      .maxTimeMS(4000)
      .lean();
    return NextResponse.json({ success: true, events: events.map((event) => eventResponse(event as unknown as EventRecord)) });
  } catch {
    return NextResponse.json({ success: false, error: "Could not load game events." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  let uploadedBlobUrl: string | undefined;
  try {
    const { body, image } = await readGameEventRequest(req);
    const fields = parseGameEventFields(body, true);
    validateGameEventDateRange(fields.startDate!, fields.endDate!);
    await connectDB();

    const id = new Types.ObjectId();
    let imageUrl = fields.imageUrl || "";
    let imageData: Buffer | undefined;
    let imageContentType: string | undefined;

    if (image) {
      if (hasBlobToken()) {
        const uploaded = await uploadToBlob({
          file: image.imageData,
          filename: eventImageFilename(String(id), image.imageContentType),
          folder: "game-events",
          contentType: image.imageContentType,
        });
        imageUrl = uploaded.url;
        uploadedBlobUrl = uploaded.url;
      } else {
        imageUrl = `/api/game-events/${id}/image?v=${randomUUID()}`;
        imageData = image.imageData;
        imageContentType = image.imageContentType;
      }
    }

    if (!imageUrl || !validEventImageUrl(imageUrl, String(id))) {
      throw new GameEventInputError("Upload an event banner image.");
    }

    const event = await GameEvent.create({
      ...fields,
      _id: id,
      imageUrl,
      ...(imageData ? { imageData, imageContentType } : {}),
    });
    invalidateGameEventsCache();
    invalidateLegacyImage(`game-event:${String(id)}`);
    return NextResponse.json({ success: true, event: eventResponse(event as unknown as EventRecord) }, { status: 201 });
  } catch (error) {
    if (uploadedBlobUrl) {
      await safeDeleteBlobIfOrphaned(uploadedBlobUrl).catch(() => undefined);
    }
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  let uploadedBlobUrl: string | undefined;
  try {
    const { body, image } = await readGameEventRequest(req);
    const eventId = requireEventId(body.eventId);
    const fields = parseGameEventFields(body);
    await connectDB();

    const existing = await GameEvent.findById(eventId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Game event not found." }, { status: 404 });
    }

    const startDate = fields.startDate || existing.startDate;
    const endDate = fields.endDate || existing.endDate;
    validateGameEventDateRange(startDate, endDate);

    let imageUrl = fields.imageUrl || existing.imageUrl;
    let imageData: Buffer | undefined;
    let imageContentType: string | undefined;
    let shouldUnsetStoredImage = false;

    if (image) {
      if (hasBlobToken()) {
        const uploaded = await uploadToBlob({
          file: image.imageData,
          filename: eventImageFilename(eventId, image.imageContentType),
          folder: "game-events",
          contentType: image.imageContentType,
        });
        imageUrl = uploaded.url;
        uploadedBlobUrl = uploaded.url;
        shouldUnsetStoredImage = true;
      } else {
        imageUrl = `/api/game-events/${eventId}/image?v=${randomUUID()}`;
        imageData = image.imageData;
        imageContentType = image.imageContentType;
      }
    } else if (isVercelBlobUrl(imageUrl)) {
      shouldUnsetStoredImage = true;
    }

    if (!validEventImageUrl(imageUrl, eventId)) {
      throw new GameEventInputError("Upload a valid event banner image.");
    }

    const update: Record<string, unknown> = {
      ...fields,
      startDate,
      endDate,
      imageUrl,
      ...(imageData ? { imageData, imageContentType } : {}),
    };
    const updateOperation: Record<string, unknown> = { $set: update };
    if (shouldUnsetStoredImage) updateOperation.$unset = { imageData: 1, imageContentType: 1 };

    const oldImageUrl = existing.imageUrl;
    const updated = await GameEvent.findByIdAndUpdate(eventId, updateOperation, {
      new: true,
      runValidators: true,
    }).lean();
    if (!updated) return NextResponse.json({ success: false, error: "Game event not found." }, { status: 404 });

    invalidateGameEventsCache();
    invalidateLegacyImage(`game-event:${eventId}`);
    if (oldImageUrl !== imageUrl && isVercelBlobUrl(oldImageUrl)) {
      await safeDeleteBlobIfOrphaned(oldImageUrl).catch(() => undefined);
    }
    return NextResponse.json({ success: true, event: eventResponse(updated as unknown as EventRecord) });
  } catch (error) {
    if (uploadedBlobUrl) {
      await safeDeleteBlobIfOrphaned(uploadedBlobUrl).catch(() => undefined);
    }
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const eventId = requireEventId(req.nextUrl.searchParams.get("eventId"));
    await connectDB();
    const event = await GameEvent.findByIdAndDelete(eventId);
    if (!event) return NextResponse.json({ success: false, error: "Game event not found." }, { status: 404 });

    invalidateGameEventsCache();
    invalidateLegacyImage(`game-event:${eventId}`);
    if (event.imageUrl) await safeDeleteBlobIfOrphaned(event.imageUrl).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
