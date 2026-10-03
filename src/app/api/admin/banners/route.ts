import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Banner } from "@/models/Banner";
import { requireAdminAuth } from "@/lib/auth";
import { BannerInputError, readBannerFields, readBannerRequest } from "@/lib/bannerUpload";

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
    if (!image) throw new BannerInputError("Upload a banner image.");

    const id = new Types.ObjectId();
    await connectDB();
    const banner = await Banner.create({
      ...fields,
      ...image,
      _id: id,
      imageUrl: `/api/banners/${id}/image?v=${randomUUID()}`,
    });

    return NextResponse.json({ success: true, banner: { id: String(banner._id) } }, { status: 201 });
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
    const update = image
      ? { ...fields, ...image, imageUrl: `/api/banners/${bannerId}/image?v=${randomUUID()}` }
      : fields;

    await connectDB();
    const banner = await Banner.findByIdAndUpdate(bannerId, { $set: update }, {
      new: true,
      runValidators: true,
    });
    if (!banner) {
      return NextResponse.json({ success: false, error: "Banner not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, banner: { id: String(banner._id) } });
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
    // Keeping the image on the banner document avoids orphaned files when replacing or deleting it.
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
