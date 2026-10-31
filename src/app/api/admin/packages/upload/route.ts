import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";
import { requireAdminAuth } from "@/lib/auth";
import { readBannerImage } from "@/lib/bannerUpload";
import { hasBlobToken, safeDeleteBlobIfOrphaned, uploadToBlob } from "@/lib/services/blobService";
import { invalidateLegacyImage } from "@/lib/services/legacyImageService";
import { isPersistentImageReference, isVercelBlobUrl, MAX_SERVER_UPLOAD_BYTES } from "@/lib/blob-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const contentLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SERVER_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json(
        { success: false, error: "Package images must be 4.5 MB or smaller." },
        { status: 413 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let packageId = "";
    let customImageUrl: string | null = null;
    let imageData: Buffer | undefined;
    let imageContentType: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      packageId = String(formData.get("packageId") || "").trim();
      const file = formData.get("image");

      if (file instanceof File && file.size > 0) {
        const parsed = await readBannerImage(file);
        imageData = parsed.imageData;
        imageContentType = parsed.imageContentType;
      }

      const urlInput = formData.get("customImage");
      if (typeof urlInput === "string") {
        customImageUrl = urlInput.trim();
      }
    } else {
      const json = await req.json();
      packageId = String(json.packageId || "").trim();
      if (typeof json.customImage === "string") {
        customImageUrl = json.customImage.trim();
      }
    }

    if (customImageUrl && !isPersistentImageReference(customImageUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: "Use a permanent HTTP(S) image URL or upload the image file.",
        },
        { status: 400 }
      );
    }

    if (!packageId || !/^[a-f\d]{24}$/i.test(packageId)) {
      return NextResponse.json(
        { success: false, error: "A valid packageId is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const existingPackage = await GamePackage.findById(packageId).select("customImage").lean();
    if (!existingPackage) {
      return NextResponse.json(
        { success: false, error: "Package not found." },
        { status: 404 }
      );
    }
    const previousImage = typeof existingPackage.customImage === "string"
      ? existingPackage.customImage
      : null;

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (imageData && imageContentType) {
      if (hasBlobToken()) {
        const ext = imageContentType.split("/")[1] || "png";
        const uploaded = await uploadToBlob({
          file: imageData,
          filename: `pkg-${packageId}.${ext}`,
          folder: "packages",
          contentType: imageContentType,
        });
        updateFields.customImage = uploaded.url;
        updateFields.imageData = null;
        updateFields.imageContentType = null;
      } else {
        updateFields.imageData = imageData;
        updateFields.imageContentType = imageContentType;
        updateFields.customImage = `/api/packages/${packageId}/image?v=${randomUUID()}`;
      }
      invalidateLegacyImage(`package:${packageId}`);
    } else if (customImageUrl !== null) {
      updateFields.customImage = customImageUrl;
      updateFields.imageData = null;
      updateFields.imageContentType = null;
      invalidateLegacyImage(`package:${packageId}`);
    }

    const updated = await GamePackage.findByIdAndUpdate(
      packageId,
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Package not found." },
        { status: 404 }
      );
    }

    if (previousImage && previousImage !== updated.customImage && isVercelBlobUrl(previousImage)) {
      const cleanup = await safeDeleteBlobIfOrphaned(previousImage);
      if (!cleanup.deleted && cleanup.reason !== "Blob URL is still in use by other resources in the database.") {
        console.warn("[Admin Package Upload] Could not remove the replaced package image:", cleanup.reason);
      }
    }

    invalidateCatalogueCache();
    return NextResponse.json({
      success: true,
      message: "Package image updated successfully",
      package: {
        id: String(updated._id),
        customImage: updated.customImage,
      },
    });
  } catch (error) {
    console.error("Package image upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload package image",
      },
      { status: 500 }
    );
  }
}
