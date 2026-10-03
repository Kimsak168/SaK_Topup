export type BlobFolder = "banners" | "games" | "packages" | "branding";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const MAX_SERVER_UPLOAD_BYTES = 4.5 * 1024 * 1024; // 4.5 MB (Vercel Functions request body limit)
export const MAX_CLIENT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB for direct client-to-blob uploads

/**
 * Validate image MIME type and file size (pure client/server safe)
 */
export function validateImageFile(
  file: { name?: string; type?: string; size?: number },
  isClientUpload = false
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No image file provided." };
  }

  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  const isAllowedMime = ALLOWED_IMAGE_TYPES.some((t) => mime === t);
  const isAllowedExt = /\.(png|jpe?g|webp|gif)$/i.test(name);

  if (!isAllowedMime && !isAllowedExt) {
    return {
      valid: false,
      error: "Invalid image format. Supported formats: PNG, JPG, WebP, and GIF.",
    };
  }

  const limit = isClientUpload ? MAX_CLIENT_UPLOAD_BYTES : MAX_SERVER_UPLOAD_BYTES;
  const limitLabel = isClientUpload ? "25 MB" : "4.5 MB";

  if (file.size && file.size > limit) {
    return {
      valid: false,
      error: `Image exceeds the ${limitLabel} file size limit.`,
    };
  }

  return { valid: true };
}

/**
 * Determines whether a given URL points to a Vercel Blob storage object
 */
export function isVercelBlobUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  return (
    url.includes(".public.blob.vercel-storage.com") ||
    url.includes(".blob.vercel-storage.com")
  );
}

/**
 * Sanitize a filename and create a collision-resistant unique path in Vercel Blob
 */
export function buildBlobPathname(folder: BlobFolder, originalFilename: string): string {
  const cleanExtMatch = originalFilename.match(/\.[a-zA-Z0-9]+$/);
  const ext = cleanExtMatch ? cleanExtMatch[0].toLowerCase() : ".png";
  const nameWithoutExt = originalFilename
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 30);

  const uniqueId = Math.random().toString(36).substring(2, 14);
  return `${folder}/${nameWithoutExt}-${uniqueId}${ext}`;
}
