import { unstable_cache } from "next/cache";

export const DIGITAL_SHOP_FULFILLMENT_AVAILABLE = false;
export const DIGITAL_SHOP_UNAVAILABLE_MESSAGE =
  "Digital Shop is paused until a documented digital-product supplier is configured.";

export interface RawDigitalProduct {
  product_code: string;
  code?: string;
  name: string;
  description?: string;
  base_price?: number;
  cost_price?: number;
  sell_price?: number;
  price: number;
  provider?: string;
  stock?: string;
  delivery?: string;
  qty_available?: number;
  available?: boolean;
}

export interface DigitalProduct extends RawDigitalProduct {
  groupCode: string;
  groupName: string;
  categoryKey: "ai" | "streaming" | "design" | "office" | "social" | "utilities";
  image: string;
  formattedPrice: string;
}

export interface DigitalGroup {
  id: string;
  name: string;
  khmerName: string;
  categoryKey: "ai" | "streaming" | "design" | "office" | "social" | "utilities";
  categoryLabel: string;
  description: string;
  image: string;
  productsCount: number;
  minPrice: number;
  badge?: string;
  products: DigitalProduct[];
}

const DIGITAL_GROUP_METADATA: Record<
  string,
  {
    name: string;
    khmerName: string;
    categoryKey: "ai" | "streaming" | "design" | "office" | "social" | "utilities";
    categoryLabel: string;
    description: string;
    image: string;
    badge?: string;
  }
> = {
  chatgpt: {
    name: "ChatGPT",
    khmerName: "ChatGPT Plus & Business",
    categoryKey: "ai",
    categoryLabel: "OpenAI",
    description: "ChatGPT Plus, ChatGPT Business, ChatGPT Pro & ChatGPT Go · ទទួលគណនី ឬ Workspace Invite ភ្លាមៗ",
    image: "/images/digital/chatgpt.jpg",
    badge: "Official",
  },
  youtube: {
    name: "YouTube Premium",
    khmerName: "YouTube Premium គ្មានពាណិជ្ជកម្ម",
    categoryKey: "streaming",
    categoryLabel: "Streaming",
    description: "ទស្សនាវីដេអូគ្មានការរំខានដោយពាណិជ្ជកម្ម និងស្តាប់តន្ត្រីពេលបិទអេក្រង់ (3, 6, 12 ខែ)",
    image: "/images/digital/youtube.jpg",
    badge: "Ad-Free",
  },
  capcut: {
    name: "CapCut Pro Video Editor",
    khmerName: "CapCut Pro កាត់តវីដេអូ",
    categoryKey: "design",
    categoryLabel: "Video & Design",
    description: "ដោះសោគ្រប់ Effect, Template, 4K Export និងមុខងារ Pro ទាំងអស់ (Personal & Team)",
    image: "/images/digital/capcut.jpg",
    badge: "Trending",
  },
  office: {
    name: "Microsoft Office 365",
    khmerName: "Microsoft Office 365 & OneDrive",
    categoryKey: "office",
    categoryLabel: "Office & Cloud",
    description: "Word, Excel, PowerPoint, Outlook និង Cloud Storage OneDrive 1TB ពេញលេញ",
    image: "/images/digital/office.jpg",
    badge: "Productivity",
  },
  canva: {
    name: "Canva Pro / Edu",
    khmerName: "Canva Pro រចនាក្រាហ្វិក",
    categoryKey: "design",
    categoryLabel: "Graphic Design",
    description: "ប្រើប្រាស់រាប់លាន Premium Templates, Fonts, Background Remover គ្មានដែនកំណត់",
    image: "/images/digital/canva.jpg",
    badge: "Creative",
  },
  telegram: {
    name: "Telegram Premium & Accounts",
    khmerName: "Telegram Premium & Gifts",
    categoryKey: "social",
    categoryLabel: "Social & Chat",
    description: "Telegram Premium Gift 3-12 ខែ, Star Badge, Stickers & Upload Files 4GB",
    image: "/images/digital/telegram.jpg",
    badge: "VIP Chat",
  },
  utilities: {
    name: "Software & Utilities",
    khmerName: "កម្មវិធី & គណនីផ្សេងៗ",
    categoryKey: "utilities",
    categoryLabel: "Software",
    description: "Kaspersky Anti-Virus, Duolingo Super, ILovePDF, Gmail & Outlook accounts",
    image: "/images/digital/office.jpg",
    badge: "Utilities",
  },
};

function classifyProduct(name: string): {
  groupCode: string;
  categoryKey: "ai" | "streaming" | "design" | "office" | "social" | "utilities";
} {
  const n = name.toLowerCase();
  // Strictly ChatGPT products only
  if (n.includes("chatgpt")) {
    return { groupCode: "chatgpt", categoryKey: "ai" };
  }
  if (n.includes("youtube")) {
    return { groupCode: "youtube", categoryKey: "streaming" };
  }
  if (n.includes("capcut")) {
    return { groupCode: "capcut", categoryKey: "design" };
  }
  if (n.includes("office") || n.includes("microsoft")) {
    return { groupCode: "office", categoryKey: "office" };
  }
  if (n.includes("canva")) {
    return { groupCode: "canva", categoryKey: "design" };
  }
  if (n.includes("telegram")) {
    return { groupCode: "telegram", categoryKey: "social" };
  }
  return { groupCode: "utilities", categoryKey: "utilities" };
}

async function fetchDigitalProductsRaw(): Promise<RawDigitalProduct[]> {
  // VNGZZ2 does not publish a Digital service in its dashboard or API
  // contract. Do not use its undocumented catalog as a sellable inventory.
  return [];
}

export const getCachedDigitalProducts = unstable_cache(
  async (): Promise<DigitalProduct[]> => {
    const rawList = await fetchDigitalProductsRaw();
    return rawList.map((p) => {
      const code = String(p.product_code || p.code || "");
      const { groupCode, categoryKey } = classifyProduct(p.name);
      const meta = DIGITAL_GROUP_METADATA[groupCode] || DIGITAL_GROUP_METADATA.utilities;
      const priceNum = Number(p.price || p.sell_price || 0);

      return {
        ...p,
        product_code: code,
        code,
        groupCode,
        groupName: meta.name,
        categoryKey,
        image: meta.image,
        price: priceNum,
        formattedPrice: `$${priceNum.toFixed(2)}`,
        available: p.available !== false && (p.qty_available === undefined || p.qty_available > 0),
      };
    });
  },
  ["digitalshop-products-v4-paused"],
  { revalidate: 300, tags: ["digitalshop"] }
);

export async function getDigitalShopCatalogue(): Promise<{
  groups: DigitalGroup[];
  allProducts: DigitalProduct[];
  totalProducts: number;
}> {
  const allProducts = await getCachedDigitalProducts();

  const groupMap: Record<string, DigitalProduct[]> = {};
  for (const prod of allProducts) {
    if (!groupMap[prod.groupCode]) {
      groupMap[prod.groupCode] = [];
    }
    groupMap[prod.groupCode].push(prod);
  }

  const groupOrder = ["chatgpt", "youtube", "capcut", "office", "canva", "telegram", "utilities"];

  const groups: DigitalGroup[] = groupOrder
    .filter((gCode) => groupMap[gCode] && groupMap[gCode].length > 0)
    .map((gCode) => {
      const prods = (groupMap[gCode] || []).sort((a, b) => a.price - b.price);
      const meta = DIGITAL_GROUP_METADATA[gCode] || DIGITAL_GROUP_METADATA.utilities;
      const prices = prods.map((p) => p.price).filter((pr) => pr > 0);
      const minPrice = prices.length ? Math.min(...prices) : 0;

      return {
        id: gCode,
        name: meta.name,
        khmerName: meta.khmerName,
        categoryKey: meta.categoryKey,
        categoryLabel: meta.categoryLabel,
        description: meta.description,
        image: meta.image,
        productsCount: prods.length,
        minPrice,
        badge: meta.badge,
        products: prods,
      };
    });

  return {
    groups,
    allProducts,
    totalProducts: allProducts.length,
  };
}

export async function getDigitalGroup(groupId: string): Promise<DigitalGroup | null> {
  const { groups } = await getDigitalShopCatalogue();
  const normalized = groupId.toLowerCase().trim();
  return groups.find((g) => g.id.toLowerCase() === normalized) || null;
}

export async function getDigitalProduct(productCode: string): Promise<DigitalProduct | null> {
  const all = await getCachedDigitalProducts();
  const clean = String(productCode).trim();
  return all.find((p) => p.product_code === clean || p.code === clean) || null;
}
