import "server-only";
import { cache } from "react";
import { Banner } from "@/models/Banner";
import { cachePublicQuery, BANNERS_TAG } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

import { legacyImageBytes, setCachedLegacyImage } from "./legacyImageService";

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

const readBanners = cache(cachePublicQuery("banners", BANNERS_TAG, async (): Promise<PublicBanner[]> =>
  withCatalogueTimeout(catalogueQuery("banners", async () => {
    const banners = await Banner.find({ isActive: true })
      .select("title subtitle badge imageUrl targetUrl ctaText accentColor sortOrder updatedAt imageData imageContentType")
      .sort({ sortOrder: 1, createdAt: -1 }).limit(4).maxTimeMS(4000).lean();

    for (const banner of banners) {
      if (banner.imageData && banner.imageContentType) {
        const bytes = legacyImageBytes(banner.imageData);
        if (bytes) {
          setCachedLegacyImage(`banner:${String(banner._id)}`, {
            bytes,
            contentType: banner.imageContentType,
            updatedAt: banner.updatedAt,
          });
        }
      }
    }

    return banners.map(banner => ({
      id: String(banner._id), title: banner.title || "", subtitle: banner.subtitle ?? "",
      badge: banner.badge ?? "", targetUrl: banner.targetUrl ?? "", ctaText: banner.ctaText ?? "",
      accentColor: banner.accentColor || "pink",
      imageUrl: banner.imageUrl.startsWith("/api/banners/")
        ? `${banner.imageUrl.split("?")[0]}?v=${new Date(banner.updatedAt).getTime()}` : banner.imageUrl,
    }));
  }))
));

export async function getPublicBanners(): Promise<PublicBanner[]> {
  return readBanners();
}
