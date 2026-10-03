import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  uploadToBlob,
  safeDeleteBlobIfOrphaned,
  validateImageFile,
  BlobFolder,
} from "@/lib/services/blobService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_FOLDERS: BlobFolder[] = ["banners", "games", "packages", "branding"];

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") || "banners").toLowerCase() as BlobFolder;
    const replaceUrl = formData.get("replaceUrl") ? String(formData.get("replaceUrl")).trim() : undefined;

    if (!VALID_FOLDERS.includes(folder)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid folder. Allowed folders: ${VALID_FOLDERS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: "Please select an image file to upload." },
        { status: 400 }
      );
    }

    const validation = validateImageFile(file, false);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Vercel Blob
    const result = await uploadToBlob({
      file: buffer,
      filename: file.name,
      folder,
      contentType: file.type || "image/png",
    });

    // If an existing image URL was provided for replacement, safely clean it up
    if (replaceUrl && replaceUrl !== result.url) {
      await safeDeleteBlobIfOrphaned(replaceUrl).catch((err) => {
        console.warn("[Admin Upload] Could not cleanup replaced blob:", err);
      });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      pathname: result.pathname,
      message: "Image uploaded to Vercel Blob successfully",
    });
  } catch (error) {
    console.error("Vercel Blob admin upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload image to Vercel Blob",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.json().catch(() => ({}))
      : {};

    const urlToDelete = String(searchParams.get("url") || body.url || "").trim();

    if (!urlToDelete) {
      return NextResponse.json(
        { success: false, error: "Missing image URL to delete" },
        { status: 400 }
      );
    }

    const result = await safeDeleteBlobIfOrphaned(urlToDelete);

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: result.deleted
        ? "Blob deleted successfully"
        : `Blob not deleted: ${result.reason || "Skipped"}`,
    });
  } catch (error) {
    console.error("Vercel Blob admin delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete blob",
      },
      { status: 500 }
    );
  }
}
