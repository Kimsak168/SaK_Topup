export type BlobFolder = "banners" | "game-events" | "games" | "packages" | "branding";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

// Leave room for multipart fields below the hosting platform's request limit.
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_CLIENT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB for direct client-to-blob uploads

/** Accept stable same-site paths and HTTP(S) URLs, but never browser-local image references. */
export function isPersistentImageReference(value: string): boolean {
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || /^(?:blob|data):/i.test(value)) {
    return false;
  }

  if (value.startsWith("/")) {
    return !value.startsWith("//") && !value.includes("\\");
  }

  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** A preview may add a cache revision to the same database-backed picture. */
export function isSameImageReference(value: string, current?: string | null): boolean {
  if (value === current) return true;
  return /^\/api\/(?:banners|packages|game-events)\/[a-f\d]{24}\/image(?:\?|$)/i.test(value)
    && value.split("?")[0] === current?.split("?")[0];
}

/** Keep the upload revision stable when unrelated prices or text are edited. */
export function versionImageUrl(value: string, updatedAt?: Date | string | number): string {
  if (!/^\/api\/(?:banners|packages|game-events)\//.test(value)) return value;
  const url = new URL(value, "http://localhost");
  if (url.searchParams.get("v")) return value;
  const revision = updatedAt === undefined ? NaN : new Date(updatedAt).getTime();
  if (!Number.isFinite(revision)) return value;
  url.searchParams.set("v", String(revision));
  return `${url.pathname}${url.search}`;
}

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
  const limitLabel = isClientUpload ? "25 MB" : "4 MB";

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
