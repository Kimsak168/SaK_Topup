import "server-only";
import { put, del } from "@vercel/blob";
import { connectDB } from "@/lib/mongodb";
import { Banner } from "@/models/Banner";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Setting } from "@/models/Setting";
import {
  BlobFolder,
  buildBlobPathname,
} from "@/lib/blob-shared";

export * from "@/lib/blob-shared";

/**
 * Checks if the environment has Vercel Blob Read-Write Token configured
 */
export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export interface UploadBlobOptions {
  file: File | Buffer;
  filename: string;
  folder: BlobFolder;
  contentType?: string;
}

/**
 * Uploads an image to Vercel Blob Storage with public access.
 * Reads BLOB_READ_WRITE_TOKEN from server environment.
 */
export async function uploadToBlob({
  file,
  filename,
  folder,
  contentType,
}: UploadBlobOptions): Promise<{ url: string; pathname: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured in the server environment. Please set it in your Vercel Project settings or .env.local."
    );
  }

  const pathname = buildBlobPathname(folder, filename);

  const blob = await put(pathname, file, {
    access: "public",
    token,
    contentType,
    addRandomSuffix: false, // We already build unique collision-free paths
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

/**
 * Safely delete an old Blob ONLY if it is not used anywhere else in the database.
 * Checks Banners, Games, GamePackages, and Settings.
 */
export async function safeDeleteBlobIfOrphaned(
  blobUrl?: string | null
): Promise<{ deleted: boolean; reason?: string }> {
  const { isVercelBlobUrl } = await import("@/lib/blob-shared");
  if (!blobUrl || !isVercelBlobUrl(blobUrl)) {
    return { deleted: false, reason: "Not a Vercel Blob URL" };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return { deleted: false, reason: "No BLOB_READ_WRITE_TOKEN available" };
  }

  try {
    await connectDB();

    // Check if any other entity still references this blobUrl
    const [bannerInUse, gameInUse, packageInUse, settingInUse] = await Promise.all([
      Banner.exists({ imageUrl: blobUrl }),
      Game.exists({ $or: [{ customImage: blobUrl }, { image: blobUrl }, { banner: blobUrl }] }),
      GamePackage.exists({ customImage: blobUrl }),
      Setting.exists({ logoUrl: blobUrl }),
    ]);

    if (bannerInUse || gameInUse || packageInUse || settingInUse) {
      return {
        deleted: false,
        reason: "Blob URL is still in use by other resources in the database.",
      };
    }

    // No other documents reference this blob; safe to delete
    await del(blobUrl, { token });
    return { deleted: true };
  } catch (error) {
    console.error(`[BlobService] Error during safeDeleteBlobIfOrphaned for ${blobUrl}:`, error);
    return {
      deleted: false,
      reason: error instanceof Error ? error.message : "Failed to delete blob",
    };
  }
}
