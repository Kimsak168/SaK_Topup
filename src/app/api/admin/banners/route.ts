import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Banner } from "@/models/Banner";
import { requireAdminAuth } from "@/lib/auth";
import { BannerInputError, readBannerFields, readBannerRequest } from "@/lib/bannerUpload";
import {
  hasBlobToken,
  uploadToBlob,
  safeDeleteBlobIfOrphaned,
} from "@/lib/services/blobService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof BannerInputError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error("Banner request failed:", error);
  return NextResponse.json(
    { success: false, error: "Could not save your banner changes. Please try again." },
    { status: 500 }
  );
}

function requireBannerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new BannerInputError("A valid banner ID is required.");
  }
  return value;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const banners = await Banner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    return NextResponse.json({
      success: true,
      banners: banners.map((banner) => ({
        id: String(banner._id),
        title: banner.title,
        subtitle: banner.subtitle ?? "",
        badge: banner.badge ?? "",
        imageUrl: banner.imageUrl,
        targetUrl: banner.targetUrl ?? "",
        ctaText: banner.ctaText ?? "",
        accentColor: banner.accentColor || "pink",
        isActive: banner.isActive !== false,
        sortOrder: banner.sortOrder || 0,
      })),
    });
  } catch (error) {
    console.error("Unable to load banners:", error);
    return NextResponse.json(
      { success: false, error: "Could not load banners. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const { body, image } = await readBannerRequest(req);
    const fields = readBannerFields(body, true);

    const explicitImageUrl = typeof fields.imageUrl === "string" ? fields.imageUrl.trim() : "";

    if (!image && !explicitImageUrl) {
      throw new BannerInputError("Upload a banner image.");
    }

    const id = new Types.ObjectId();
    let finalImageUrl = explicitImageUrl;

    // If an image file was uploaded
    if (image) {
      if (hasBlobToken()) {
        const ext = image.imageContentType?.split("/")[1] || "png";
        const uploaded = await uploadToBlob({
          file: image.imageData,
          filename: `banner-${id}.${ext}`,
          folder: "banners",
          contentType: image.imageContentType,
        });
        finalImageUrl = uploaded.url;
      } else {
        // Fallback if token not set locally
        finalImageUrl = `/api/banners/${id}/image?v=${randomUUID()}`;
      }
    }

    await connectDB();
    const banner = await Banner.create({
      ...fields,
      ...(image && !hasBlobToken() ? image : {}),
      _id: id,
      imageUrl: finalImageUrl,
    });

    return NextResponse.json({ success: true, banner: { id: String(banner._id), imageUrl: finalImageUrl } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const { body, image } = await readBannerRequest(req);
    const bannerId = requireBannerId(body.bannerId);
    const fields = readBannerFields(body);

    await connectDB();
    const existingBanner = await Banner.findById(bannerId);
    if (!existingBanner) {
      return NextResponse.json({ success: false, error: "Banner not found." }, { status: 404 });
    }

    const oldImageUrl = existingBanner.imageUrl;
    let finalImageUrl: string | undefined;

    if (image) {
      if (hasBlobToken()) {
        const ext = image.imageContentType?.split("/")[1] || "png";
        const uploaded = await uploadToBlob({
          file: image.imageData,
          filename: `banner-${bannerId}.${ext}`,
          folder: "banners",
          contentType: image.imageContentType,
        });
        finalImageUrl = uploaded.url;
      } else {
        finalImageUrl = `/api/banners/${bannerId}/image?v=${randomUUID()}`;
      }
    } else if (typeof fields.imageUrl === "string" && fields.imageUrl) {
      finalImageUrl = fields.imageUrl.trim();
    }

    const update: Record<string, unknown> = { ...fields };
    if (finalImageUrl) {
      update.imageUrl = finalImageUrl;
    }
    if (image && !hasBlobToken()) {
      update.imageData = image.imageData;
      update.imageContentType = image.imageContentType;
    }

    const updatedBanner = await Banner.findByIdAndUpdate(
      bannerId,
      { $set: update },
      { new: true, runValidators: true }
    );

    // Only delete the old blob after the database update succeeds, and only if not used elsewhere
    if (finalImageUrl && oldImageUrl && oldImageUrl !== finalImageUrl) {
      await safeDeleteBlobIfOrphaned(oldImageUrl).catch((err) => {
        console.warn("[Admin Banners] Error cleaning up replaced banner blob:", err);
      });
    }

    return NextResponse.json({
      success: true,
      banner: { id: String(updatedBanner?._id), imageUrl: updatedBanner?.imageUrl },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const bannerId = requireBannerId(req.nextUrl.searchParams.get("bannerId"));
    await connectDB();
    const banner = await Banner.findByIdAndDelete(bannerId);
    if (!banner) {
      return NextResponse.json({ success: false, error: "Banner not found." }, { status: 404 });
    }

    // Safely delete the blob from Vercel Blob if orphaned
    if (banner.imageUrl) {
      await safeDeleteBlobIfOrphaned(banner.imageUrl).catch((err) => {
        console.warn("[Admin Banners] Error cleaning up deleted banner blob:", err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
