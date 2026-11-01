import { upload } from "@vercel/blob/client";
import { BlobFolder, buildBlobPathname, MAX_SERVER_UPLOAD_BYTES, validateImageFile } from "@/lib/blob-shared";

export interface ClientUploadResult {
  url: string;
  pathname: string;
}

/**
 * Universal image upload helper for admin dashboard components:
 * Large files bypass function request limits using direct uploads.
 * The resource's save endpoint cleans up the previous image after saving.
 */
export async function uploadAdminImage(
  file: File,
  folder: BlobFolder
): Promise<ClientUploadResult> {
  const validation = validateImageFile(file, true);
  if (!validation.valid) throw new Error(validation.error);

  if (file.size > MAX_SERVER_UPLOAD_BYTES) {
    const pathname = buildBlobPathname(folder, file.name);
    const newBlob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/uploads/blob-client",
      clientPayload: JSON.stringify({ folder, originalName: file.name }),
    });

    return {
      url: newBlob.url,
      pathname: newBlob.pathname,
    };
  }

  // Standard multipart server upload (fast and direct)
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

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
