import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";
import { requireAdminAuth } from "@/lib/auth";
import { readBannerImage } from "@/lib/bannerUpload";
import {
  hasBlobToken,
  uploadToBlob,
  safeDeleteBlobIfOrphaned,
} from "@/lib/services/blobService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const contentType = req.headers.get("content-type") || "";
    let packageId = "";
    let customImageUrl: string | null = null;
    let imageData: Buffer | undefined;
    let imageContentType: string | undefined;
    let originalFileName = "package.png";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      packageId = String(formData.get("packageId") || "").trim();
      const file = formData.get("image");

      if (file instanceof File && file.size > 0) {
        originalFileName = file.name;
        const parsed = await readBannerImage(file);
        imageData = parsed.imageData;
        imageContentType = parsed.imageContentType;
      }

      const urlInput = formData.get("customImage");
      if (typeof urlInput === "string" && urlInput.trim()) {
        customImageUrl = urlInput.trim();
      }
    } else {
      const json = await req.json();
      packageId = String(json.packageId || "").trim();
      if (typeof json.customImage === "string") {
        customImageUrl = json.customImage.trim();
      }
    }

    if (!packageId || !/^[a-f\d]{24}$/i.test(packageId)) {
      return NextResponse.json(
        { success: false, error: "A valid packageId is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const existingPkg = await GamePackage.findById(packageId);
    if (!existingPkg) {
      return NextResponse.json(
        { success: false, error: "Package not found." },
        { status: 404 }
      );
    }

    const oldImageUrl = existingPkg.customImage;
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (imageData && imageContentType) {
      if (hasBlobToken()) {
        const ext = imageContentType.split("/")[1] || "png";
        const uploaded = await uploadToBlob({
          file: imageData,
          filename: `package-${packageId}.${ext}`,
          folder: "packages",
          contentType: imageContentType,
        });
        updateFields.customImage = uploaded.url;
      } else {
        updateFields.imageData = imageData;
        updateFields.imageContentType = imageContentType;
        updateFields.customImage = `/api/packages/${packageId}/image?v=${randomUUID()}`;
      }
    } else if (customImageUrl !== null) {
      updateFields.customImage = customImageUrl || null;
      if (!customImageUrl) {
        updateFields.imageData = null;
        updateFields.imageContentType = null;
      }
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

    // Safely delete old blob if replaced or removed
    const newImageUrl = updateFields.customImage as string | null | undefined;
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      await safeDeleteBlobIfOrphaned(oldImageUrl).catch((err) => {
        console.warn("[Package Upload] Could not cleanup replaced package blob:", err);
      });
    }

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
