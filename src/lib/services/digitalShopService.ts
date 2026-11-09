import { unstable_cache } from "next/cache";
import { getPeSupplyProducts, type PeSupplyProduct } from "@/lib/suppliers/peSupply";

export const DIGITAL_SHOP_FULFILLMENT_AVAILABLE = true;
export const DIGITAL_SHOP_UNAVAILABLE_MESSAGE =
  "Digital Shop fulfillment is currently undergoing scheduled maintenance.";

export interface RawDigitalProduct {
  product_code: string; // e.g. "canva__2y_pro"
  code?: string;
  productSlug: string; // "canva"
  variationId: string; // "2y_pro"
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
  requires_email?: boolean;
  delivery_kind?: string;
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

export const DIGITAL_GROUP_METADATA: Record<
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
  canva: {
    name: "Canva Pro",
    khmerName: "Canva Pro រចនាក្រាហ្វិក",
    categoryKey: "design",
    categoryLabel: "Graphic Design",
    description: "ប្រើប្រាស់រាប់លាន Premium Templates, Fonts, Background Remover គ្មានដែនកំណត់ (2 ឆ្នាំ Pro)",
    image: "/images/digital/canva.jpg",
    badge: "Trending 🔥",
  },
  capcut: {
    name: "CapCut Pro Video Editor",
    khmerName: "CapCut Pro កាត់តវីដេអូ",
    categoryKey: "design",
    categoryLabel: "Video & Design",
    description: "ដោះសោគ្រប់ Effect, Template, 4K Export និងមុខងារ Pro ទាំងអស់ (1 ខែ Pro, Credits)",
    image: "/images/digital/capcut.jpg",
    badge: "Best Seller",
  },
  chatgpt: {
    name: "ChatGPT Plus & AI Tools",
    khmerName: "ChatGPT Plus & ឧបករណ៍ AI",
    categoryKey: "ai",
    categoryLabel: "AI Tools",
    description: "ChatGPT Plus, Claude API Credits, Gemini Plus 12M, ElevenLabs Voice AI · ដំណើរការលឿន ឆ្លាតវៃ",
    image: "/images/digital/chatgpt.jpg",
    badge: "Popular AI",
  },
  office: {
    name: "Microsoft 365, Notion & Office",
    khmerName: "Microsoft 365, Notion & Office",
    categoryKey: "office",
    categoryLabel: "Office & Cloud",
    description: "Word, Excel, PowerPoint, OneDrive 1TB, Notion Plus 12M, Zoom Pro, JetBrains Edu ពេញលេញ",
    image: "/images/digital/office.jpg",
    badge: "Productivity",
  },
  streaming: {
    name: "Spotify & Apple Music",
    khmerName: "Spotify, Apple Music & Streaming",
    categoryKey: "streaming",
    categoryLabel: "Streaming & Music",
    description: "ស្តាប់តន្ត្រីគុណភាពខ្ពស់គ្មានពាណិជ្ជកម្ម និងទស្សនា Anime (Spotify 3M, Apple Music 5M, Crunchyroll)",
    image: "/images/digital/youtube.jpg",
    badge: "Entertainment",
  },
  vpn: {
    name: "ExpressVPN, Proton & Surfshark",
    khmerName: "ExpressVPN, Proton & Surfshark",
    categoryKey: "utilities",
    categoryLabel: "VPN & Security",
    description: "VPN ល្បឿនលឿន សុវត្ថិភាពខ្ពស់ ផ្លាស់ប្តូរ IP ប្រទេសបានច្រើន (ExpressVPN, ProtonVPN, Surfshark, HMA)",
    image: "/images/digital/office.jpg",
    badge: "High Speed",
  },
  utilities: {
    name: "Accounts & Digital Utilities",
    khmerName: "គណនី & កម្មវិធីផ្សេងៗ",
    categoryKey: "utilities",
    categoryLabel: "Software",
    description: "Outlook, Gmail Aged, iLovePDF Premium, Duolingo Super, edX Premium",
    image: "/images/digital/office.jpg",
    badge: "Utilities",
  },
};

/**
 * Competitive and reasonable customer resale markup in USD.
 */
function calculateCustomerPrice(costPrice: number): number {
  if (costPrice <= 0) return 0;
  let markup = 0;
  if (costPrice < 1.0) {
    markup = 0.5;
  } else if (costPrice < 2.0) {
    markup = 0.6;
  } else if (costPrice < 4.0) {
    markup = 0.85;
  } else if (costPrice < 8.0) {
    markup = 1.35;
  } else if (costPrice < 15.0) {
    markup = 2.0;
  } else {
    markup = costPrice * 0.18;
  }
  const rawSell = costPrice + markup;
  return Math.round(rawSell * 10) / 10;
}

function classifyProduct(slug: string, name: string): {
  groupCode: string;
  categoryKey: "ai" | "streaming" | "design" | "office" | "social" | "utilities";
} {
  const s = `${slug} ${name}`.toLowerCase();

  if (s.includes("canva")) {
    return { groupCode: "canva", categoryKey: "design" };
  }
  if (s.includes("capcut")) {
    return { groupCode: "capcut", categoryKey: "design" };
  }
  if (
    s.includes("chatgpt") ||
    s.includes("claude") ||
    s.includes("gemini") ||
    s.includes("elevenlabs") ||
    s.includes("framer") ||
    s.includes("muse")
  ) {
    return { groupCode: "chatgpt", categoryKey: "ai" };
  }
  if (
    s.includes("office") ||
    s.includes("microsoft") ||
    s.includes("notion") ||
    s.includes("zoom") ||
    s.includes("jetbrain") ||
    s.includes("ilovepdf") ||
    s.includes("linkedin")
  ) {
    return { groupCode: "office", categoryKey: "office" };
  }
  if (
    s.includes("spotify") ||
    s.includes("apple") ||
    s.includes("crunchyroll") ||
    s.includes("youtube") ||
    s.includes("steam") ||
    s.includes("netflix") ||
    s.includes("prime") ||
    s.includes("peacock")
  ) {
    return { groupCode: "streaming", categoryKey: "streaming" };
  }
  if (
    s.includes("vpn") ||
    s.includes("avira") ||
    s.includes("nord") ||
    s.includes("surfshark") ||
    s.includes("proton") ||
    s.includes("expressvpn")
  ) {
    return { groupCode: "vpn", categoryKey: "utilities" };
  }
  return { groupCode: "utilities", categoryKey: "utilities" };
}

async function fetchDigitalProductsRaw(): Promise<RawDigitalProduct[]> {
  try {
    const rawSuppliers = await getPeSupplyProducts();
    const items: RawDigitalProduct[] = [];

    for (const prod of rawSuppliers) {
      if (!prod.variations || prod.variations.length === 0) continue;

      for (const v of prod.variations) {
        // Skip variations that are permanently unpurchasable or pre-orders
        if (v.preorder) continue;

        const productCode = `${prod.slug}__${v.id}`;
        const costPrice = Number(v.price || 0);
        const sellPrice = calculateCustomerPrice(costPrice);

        const stockLabel =
          v.stock !== null && v.stock !== undefined
            ? v.stock > 0
              ? `${v.stock} in stock`
              : "Out of Stock"
            : v.in_stock
            ? "In Stock"
            : "Out of Stock";

        items.push({
          product_code: productCode,
          code: productCode,
          productSlug: prod.slug,
          variationId: v.id,
          name: `${prod.name} — ${v.name}`,
          description: prod.description || undefined,
          cost_price: costPrice,
          sell_price: sellPrice,
          price: sellPrice,
          provider: "pe_supply",
          stock: stockLabel,
          qty_available: v.stock ?? (v.in_stock ? 99 : 0),
          available: v.purchasable,
          requires_email: v.requires_email,
          delivery_kind: prod.delivery_kind,
        });
      }
    }

    return items;
  } catch (error) {
    console.error("[DigitalShop] Failed to fetch PE-Supply catalog:", error);
    return [];
  }
}

export const getCachedDigitalProducts = unstable_cache(
  async (): Promise<DigitalProduct[]> => {
    const rawList = await fetchDigitalProductsRaw();
    return rawList.map((p) => {
      const code = String(p.product_code || p.code || "");
      const { groupCode, categoryKey } = classifyProduct(p.productSlug, p.name);
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
  ["digitalshop-products-v5-live"],
  { revalidate: 180, tags: ["digitalshop"] }
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

  const groupOrder = ["canva", "capcut", "chatgpt", "office", "streaming", "vpn", "utilities"];

  const groups: DigitalGroup[] = groupOrder
    .filter((gCode) => groupMap[gCode] && groupMap[gCode].length > 0)
    .map((gCode) => {
      // Sort in-stock packages first, then by price ascending
      const prods = (groupMap[gCode] || []).sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.price - b.price;
      });
      const meta = DIGITAL_GROUP_METADATA[gCode] || DIGITAL_GROUP_METADATA.utilities;
      const prices = prods.filter((p) => p.available && p.price > 0).map((p) => p.price);
      const minPrice = prices.length ? Math.min(...prices) : (prods[0]?.price || 0);

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
