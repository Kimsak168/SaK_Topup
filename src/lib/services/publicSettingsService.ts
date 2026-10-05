import "server-only";
import { Setting } from "@/models/Setting";
import { cachePublicQuery, SETTINGS_TAG } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

export const getPublicLogoUrl = cachePublicQuery("logo", SETTINGS_TAG, async () =>
  withCatalogueTimeout(catalogueQuery("logo", async () => {
    const setting = await Setting.findOne({ key: "general" }).select("logoUrl").maxTimeMS(4000).lean();
    return setting?.logoUrl || null;
  }))
);
