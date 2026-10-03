import { upload } from "@vercel/blob/client";
import { BlobFolder, buildBlobPathname, MAX_SERVER_UPLOAD_BYTES } from "@/lib/blob-shared";

export interface ClientUploadResult {
  url: string;
  pathname: string;
}

/**
 * Universal image upload helper for admin dashboard components:
 * - If file size > 4.5MB (Vercel Functions request payload limit): uses official client-to-blob upload
 * - If file size <= 4.5MB: uses direct server endpoint with authentication
 * - Handles optional replacement of previous blob URL safely
 */
export async function uploadAdminImage(
  file: File,
  folder: BlobFolder,
  replaceUrl?: string | null
): Promise<ClientUploadResult> {
  // If file is larger than 4.5MB, use official Vercel Blob client upload
  if (file.size > MAX_SERVER_UPLOAD_BYTES) {
    const pathname = buildBlobPathname(folder, file.name);
    const newBlob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/uploads/blob-client",
      clientPayload: JSON.stringify({ folder, originalName: file.name }),
    });

    // If an old image is being replaced, clean it up safely via delete endpoint
    if (replaceUrl && replaceUrl !== newBlob.url) {
      await fetch(`/api/admin/uploads/blob?url=${encodeURIComponent(replaceUrl)}`, {
        method: "DELETE",
      }).catch((err) => console.warn("Failed to delete replaced blob:", err));
    }

    return {
      url: newBlob.url,
      pathname: newBlob.pathname,
    };
  }

  // Standard multipart server upload (fast and direct)
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  if (replaceUrl) {
    formData.append("replaceUrl", replaceUrl);
  }

  const response = await fetch("/api/admin/uploads/blob", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to upload image to Vercel Blob");
  }

  return {
    url: data.url,
    pathname: data.pathname,
  };
}

/**
 * Helper to delete a blob when administrator explicitly deletes a picture
 */
export async function deleteAdminBlob(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await fetch(`/api/admin/uploads/blob?url=${encodeURIComponent(url)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    return Boolean(data.success && data.deleted);
  } catch (error) {
    console.warn("Error deleting blob:", error);
    return false;
  }
}
