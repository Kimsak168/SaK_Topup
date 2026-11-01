import { WEBBUILDER_REGIONAL_GAMES } from "./webbuilderRegions";
import { isFreeFireKhsgmyProduct, type WebBuilderProduct } from "./webbuilder";

function matchesGame(product: WebBuilderProduct, ...names: string[]): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return typeof product.game === "string" && names.some(name => normalize(name) === normalize(product.game!));
}

export interface WebBuilderGameDefinition {
  name: string;
  slug: string;
  code: string;
  category: string;
  currencyName: string;
  publisher: string;
  filter: (p: WebBuilderProduct) => boolean;
  requiresServer: boolean;
  serverLabel?: string;
  userIdLabel: string;
  image: string;
  badge?: string;
  isPopular: boolean;
  sortOrder: number;
}

export const WEBBUILDER_GAMES: WebBuilderGameDefinition[] = [
  {
    name: "Free Fire (KHSGMY)",
    slug: "free-fire-khsgmy",
    code: "freefire_khsgmy",
    category: "Battle Royale",
    currencyName: "Diamonds",
    publisher: "Garena",
    filter: isFreeFireKhsgmyProduct,
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "/images/freefire.jpg?v=naruto",
    badge: "HOT",
    isPopular: true,
    sortOrder: 1,
  },
  {
    name: "Mobile Legends",
    slug: "mlbb",
    code: "mlbb",
    category: "MOBA",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => matchesGame(p, "Mobile Legends", "MLBB") &&
      [p.region, ...(p.regions || [])].some(region => /cambodia|\bkh\b/i.test(region || "")),
    requiresServer: true,
    serverLabel: "Zone ID (4-5 digits)",
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/mlbb_global.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: "Honor of Kings",
    slug: "hok",
    code: "hok",
    category: "MOBA",
    currencyName: "Tokens",
    publisher: "Level Infinite",
    filter: (p) => matchesGame(p, "Honor of Kings", "HOK"),
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "https://api.g2bulk.com/images/hok.png",
    badge: "TRENDING",
    isPopular: true,
    sortOrder: 3,
  },
  {
    name: "PUBG Mobile",
    slug: "pubg-mobile",
    code: "pubgm",
    category: "Battle Royale",
    currencyName: "UC",
    publisher: "Krafton / Tencent",
    filter: (p) => matchesGame(p, "PUBG Mobile", "PUBGM"),
    requiresServer: false,
    userIdLabel: "Character ID",
    image: "https://api.g2bulk.com/images/pubgm.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 4,
  },
  {
    name: "Blood Strike",
    slug: "blood-strike",
    code: "bloodstrike",
    category: "Battle Royale",
    currencyName: "Gold",
    publisher: "NetEase",
    filter: (p) => matchesGame(p, "Blood Strike"),
    requiresServer: false,
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/bloodstrike.png",
    badge: "",
    isPopular: false,
    sortOrder: 5,
  },
  {
    name: "Magic Chess: Go Go",
    slug: "magic-chess-gogo",
    code: "magic_chess",
    category: "Strategy",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => matchesGame(p, "Magic Chess Gogo", "Magic Chess: Go Go"),
    requiresServer: true,
    serverLabel: "Zone ID",
    userIdLabel: "User ID",
    image: "/images/magic-chess.jpg",
    badge: "NEW",
    isPopular: false,
    sortOrder: 6,
  },
  {
    name: "8 Ball Pool",
    slug: "8-ball-pool",
    code: "8ballpool",
    category: "Sports",
    currencyName: "Cash / Coins",
    publisher: "Miniclip",
    filter: (p) => matchesGame(p, "8 Ball Pool"),
    requiresServer: false,
    userIdLabel: "Unique ID",
    image: "/images/8ballpool.jpg",
    badge: "",
    isPopular: false,
    sortOrder: 7,
  },
  {
    name: "Telegram Stars",
    slug: "telegram",
    code: "telegram",
    category: "Apps & Social",
    currencyName: "Stars",
    publisher: "Telegram FZ-LLC",
    filter: (p) => matchesGame(p, "Telegram", "Telegram Stars"),
    requiresServer: false,
    userIdLabel: "Telegram Username",
    image: "/images/telegram-stars.jpg",
    badge: "HOT",
    isPopular: true,
    sortOrder: 8,
  },
];

// Regions are separate checkout routes. A substring match would put their
// similarly named packages into the base game's catalogue.
for (const [baseCode, code, name, providerName] of WEBBUILDER_REGIONAL_GAMES) {
  const base = WEBBUILDER_GAMES.find(game => game.code === baseCode)!;
  WEBBUILDER_GAMES.push({ ...base, code, slug: `webbuilder-${code.replace(/_/g, "-")}`, name,
    filter: product => matchesGame(product, providerName), isPopular: false, badge: "", sortOrder: WEBBUILDER_GAMES.length + 1 });
}
WEBBUILDER_GAMES.push({
  name: "Zepeto", slug: "webbuilder-zepeto", code: "zepeto", category: "Apps & Social", currencyName: "Zems / Coins",
  publisher: "Naver Z", requiresServer: false, userIdLabel: "User ID", image: "/images/hero-banner.jpg",
  isPopular: false, sortOrder: WEBBUILDER_GAMES.length + 1, filter: product => matchesGame(product, "Zepeto"),
});

export function getWebBuilderGame(product: WebBuilderProduct): WebBuilderGameDefinition | undefined {
  const matches = WEBBUILDER_GAMES.filter(game => game.filter(product));
  if (matches.length > 1) throw new Error(`Ambiguous WebBuilder game mapping for ${product.id}.`);
  return matches[0];
}

