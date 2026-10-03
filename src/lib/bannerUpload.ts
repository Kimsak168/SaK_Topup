const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export class BannerInputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function readBannerImage(file: File) {
  if (file.size === 0) {
    throw new BannerInputError("Choose a banner image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BannerInputError("Banner images must be 3 MB or smaller.", 413);
  }

  const imageData = Buffer.from(await file.arrayBuffer());
  let imageContentType: string | undefined;

  if (imageData.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    imageContentType = "image/png";
  } else if (imageData[0] === 0xff && imageData[1] === 0xd8 && imageData[2] === 0xff) {
    imageContentType = "image/jpeg";
  } else if (["GIF87a", "GIF89a"].includes(imageData.toString("ascii", 0, 6))) {
    imageContentType = "image/gif";
  } else if (
    imageData.toString("ascii", 0, 4) === "RIFF" &&
    imageData.toString("ascii", 8, 12) === "WEBP"
  ) {
    imageContentType = "image/webp";
  }

  if (!imageContentType || (file.type && file.type !== imageContentType)) {
    throw new BannerInputError("Upload a valid PNG, JPG, WebP, or GIF image.");
  }

  return { imageData, imageContentType };
}

export async function readBannerRequest(req: Request) {
  // Allow a small amount of multipart overhead in addition to the image.
  if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 64 * 1024) {
    throw new BannerInputError("Banner images must be 3 MB or smaller.", 413);
  }

  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const data = await req.formData();
      const body: Record<string, unknown> = {};
      for (const [key, value] of data.entries()) {
        if (key !== "image") body[key] = value;
      }
      const file = data.get("image");
      if (file !== null && !(file instanceof File)) {
        throw new BannerInputError("Choose a valid banner image.");
      }
      return { body, image: file ? await readBannerImage(file) : undefined };
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BannerInputError("Invalid banner details.");
    }
    return { body: body as Record<string, unknown>, image: undefined };
  } catch (error) {
    if (error instanceof BannerInputError) throw error;
    throw new BannerInputError("Could not read the banner details. Please try again.");
  }
}

export function readBannerFields(body: Record<string, unknown>, creating = false) {
  const fields: Record<string, string | number | boolean> = {};
  const textFields = {
    title: 160,
    subtitle: 400,
    badge: 40,
    targetUrl: 2048,
    ctaText: 80,
    accentColor: 30,
  };

  for (const [key, maxLength] of Object.entries(textFields)) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length > maxLength) {
      throw new BannerInputError(`Invalid ${key}.`);
    }
    fields[key] = value.trim();
  }

  if ((creating || body.title !== undefined) && !fields.title) {
    throw new BannerInputError("A banner headline is required.");
  }

  if (typeof fields.targetUrl === "string" && fields.targetUrl) {
    const target = fields.targetUrl;
    const isLocalPath = target.startsWith("/") && !target.startsWith("//") && !target.includes("\\");
    let isWebUrl = false;
    try {
      isWebUrl = ["https:", "http:"].includes(new URL(target).protocol);
    } catch {
      // Relative destinations must start with a slash.
    }
    if ((!isLocalPath && !isWebUrl) || /[\u0000-\u001f\u007f]/.test(target)) {
      throw new BannerInputError("Use a page path or an http(s) destination link.");
    }
  }

  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isSafeInteger(order)) throw new BannerInputError("Sort order must be a whole number.");
    fields.sortOrder = order;
  }
  if (body.isActive !== undefined) {
    if (![true, false, "true", "false"].includes(body.isActive as boolean | string)) {
      throw new BannerInputError("Invalid banner status.");
    }
    fields.isActive = body.isActive === true || body.isActive === "true";
  }

  return fields;
}
