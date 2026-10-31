import "server-only";
import { SmmService } from "@/models/SmmService";
import { calculateSmmCustomerRate } from "./smmPricing";
import { cachePublicQuery, SMM_CATALOGUE_TAG } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

export interface PublicSmmCatalogQuery {
  page: number;
  limit: number;
  platform: string;
  type: string;
  category: string;
  search: string;
  sort: "recommended" | "price-low" | "price-high" | "name";
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok", telegram: "Telegram", facebook: "Facebook",
  instagram: "Instagram", youtube: "YouTube", other: "Other Platforms",
};

// Admin validation must always read current records, without the public cache.
export async function getSmmDuplicateKeys() {
  const [fingerprints, supplierServiceIds] = await Promise.all([
    SmmService.aggregate([
      { $match: { supplier: "vngzz2", fingerprint: { $type: "string", $ne: "" } } },
      { $group: { _id: "$fingerprint", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]).option({ maxTimeMS: 4000 }),
    SmmService.aggregate([
      { $match: { supplier: "vngzz2", supplierServiceId: { $type: "string", $ne: "" } } },
      { $group: { _id: "$supplierServiceId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]).option({ maxTimeMS: 4000 }),
  ]);
  return {
    fingerprints: fingerprints.map((row: { _id: string }) => row._id),
    supplierServiceIds: supplierServiceIds.map((row: { _id: string }) => row._id),
  };
}

function activeServiceFilter(duplicates: Awaited<ReturnType<typeof getSmmDuplicateKeys>>): Record<string, unknown> {
  return {
    supplier: "vngzz2",
    isActive: true,
    supplierAvailable: true,
    requiresReview: false,
    reviewFlags: { $size: 0 },
    rate: { $type: "number", $gt: 0, $lte: Number.MAX_SAFE_INTEGER },
    min: { $type: "number", $gt: 0, $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
    max: { $type: "number", $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
    name: { $type: "string", $ne: "" },
    category: { $type: "string", $ne: "" },
    platform: { $in: Object.keys(PLATFORM_LABELS) },
    serviceType: { $in: ["followers", "likes", "views", "comments", "shares", "other"] },
    supplierServiceId: { $type: "string", $ne: "", $nin: duplicates.supplierServiceIds },
    fingerprint: { $type: "string", $ne: "", $nin: duplicates.fingerprints },
    $expr: { $gte: ["$max", "$min"] },
  };
}

const getCatalogMetadata = cachePublicQuery("smm-metadata", SMM_CATALOGUE_TAG, async () =>
  withCatalogueTimeout(catalogueQuery("smm-metadata", async () => {
    const duplicates = await getSmmDuplicateKeys();
    // One aggregate supplies totals, platform counts, and category options for
    // every page. The homepage needs only this summary, never service rows.
    const groups: { _id: { platform: string; category: string }; count: number }[] = await SmmService.aggregate([
      { $match: activeServiceFilter(duplicates) },
      { $group: { _id: { platform: "$platform", category: "$category" }, count: { $sum: 1 } } },
    ]).option({ maxTimeMS: 4000 });
    const catalogTotal = groups.reduce((total, group) => total + group.count, 0);
    const platforms = [
      { id: "all", name: "All Platforms", count: catalogTotal },
      ...Object.entries(PLATFORM_LABELS).map(([id, name]) => ({
        id, name, count: groups.filter((group) => group._id.platform === id).reduce((total, group) => total + group.count, 0),
      })).filter((platform) => platform.id !== "other" || platform.count > 0),
    ];
    return { duplicates, catalogTotal, platforms, groups };
  }))
);

export async function getPublicSmmCatalogSummary() {
  const { catalogTotal, platforms } = await getCatalogMetadata();
  return { catalogTotal, platforms };
}

async function readPublicCatalog(query: PublicSmmCatalogQuery) {
  const metadata = await getCatalogMetadata();
  return catalogueQuery("smm-page", async () => {
    const filter = activeServiceFilter(metadata.duplicates);
    if (query.platform && query.platform !== "all") filter.platform = query.platform;
    if (["followers", "likes", "views", "comments", "shares", "other"].includes(query.type)) filter.serviceType = query.type;
    if (query.category && query.category !== "All") filter.category = query.category;
    if (query.search) {
      const search = new RegExp(query.search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$and = [{ $or: [{ name: search }, { category: search }, { platform: search }, { description: search }] }];
    }
    const sort: Record<string, 1 | -1> = query.sort === "price-low" ? { rate: 1, name: 1 }
      : query.sort === "price-high" ? { rate: -1, name: 1 }
      : query.sort === "name" ? { name: 1, platform: 1 }
      : { platform: 1, serviceType: 1, rate: 1, name: 1 };
    const unfiltered = (!query.platform || query.platform === "all") && (!query.type || query.type === "all") &&
      (!query.category || query.category === "All") && !query.search;
    const [total, rows] = await Promise.all([
      unfiltered ? Promise.resolve(metadata.catalogTotal) : SmmService.countDocuments(filter).maxTimeMS(4000),
      SmmService.find(filter)
        .select("supplierServiceId name category platform serviceType refill +rate min max description")
        .sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).maxTimeMS(4000).lean(),
    ]);
    const services = rows.map((service) => ({
      service: service.supplierServiceId,
      name: service.name,
      category: service.category,
      platform: service.platform,
      serviceType: service.serviceType,
      ...(service.refill == null ? {} : { refill: service.refill }),
      rate: calculateSmmCustomerRate(service.rate || 0),
      min: service.min,
      max: service.max,
      ...(service.description ? { description: service.description } : {}),
    }));
    const categoryNames = metadata.groups
      .filter((group) => !query.platform || query.platform === "all" || group._id.platform === query.platform)
      .map((group) => group._id.category);
    return {
      success: true,
      total,
      catalogTotal: metadata.catalogTotal,
      platforms: metadata.platforms,
      categories: ["All", ...new Set(categoryNames)].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)),
      services,
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      source: "mongodb" as const,
    };
  });
}

const getCachedCatalog = cachePublicQuery("smm-page", SMM_CATALOGUE_TAG,
  (query: PublicSmmCatalogQuery) => withCatalogueTimeout(readPublicCatalog(query)));

export function getPublicSmmCatalog(query: PublicSmmCatalogQuery) {
  // Keep arbitrary search terms out of the persistent cache; shared metadata
  // still avoids repeating duplicate scans and counts on every keystroke.
  return withCatalogueTimeout(query.search ? readPublicCatalog(query) : getCachedCatalog(query));
}
