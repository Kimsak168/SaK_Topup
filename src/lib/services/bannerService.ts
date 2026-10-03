import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Banner } from "@/models/Banner";

export interface PublicBanner {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  targetUrl: string;
  ctaText: string;
  accentColor: string;
}

/**
 * Loads active promotional banners strictly from MongoDB.
 * Supports up to 4 configurable banner slots.
 * If fewer than 4 banners are enabled, only returns the available banners.
 * Does not create or return fake banners.
 */
export async function getPublicBanners(): Promise<PublicBanner[]> {
  try {
    const timeoutPromise = new Promise<PublicBanner[]>((resolve) =>
      setTimeout(() => {
        console.warn("[BannerService] Timeout waiting for MongoDB banners");
        resolve([]);
      }, 4000)
    );

    const fetchBanners = async (): Promise<PublicBanner[]> => {
      await connectDB();
      const banners = await Banner.find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 })
        .limit(4)
        .lean();

      return banners.map((banner) => ({
        id: String(banner._id),
        title: banner.title || "",
        subtitle: banner.subtitle ?? "",
        badge: banner.badge ?? "",
        imageUrl: banner.imageUrl,
        targetUrl: banner.targetUrl ?? "",
        ctaText: banner.ctaText ?? "",
        accentColor: banner.accentColor || "pink",
      }));
    };

    return await Promise.race([fetchBanners(), timeoutPromise]);
  } catch (error) {
    console.warn("Unable to load homepage banners from MongoDB:", error);
    return [];
  }
}
