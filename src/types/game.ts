export interface ClientGame {
  id: string;
  slug: string;
  name: string;
  code: string; // Supplier game code (e.g. "freefire_global", "pubgm", "mlbb_global")
  supplier: "vizo" | "g2bulk";
  path: string; // e.g. "/games/vizo/freefire_global"
  category: string;
  image: string;
  banner?: string;
  publisher: string;
  currencyName: string;
  description: string;
  requiresServer: boolean;
  serverLabel: string;
  userIdLabel: string;
  instruction?: string;
  badge?: string;
  isPopular: boolean;
  isTrending: boolean;
}

export interface ClientPackage {
  id: string;
  supplierProductCode: string; // Original supplier product code / catalogue ID
  name: string;
  diamondsOrPoints: string;
  bonus?: string;
  sellingPrice: number | null; // Customer price from DB, null if unconfigured
  originalPrice: number | null;
  currency: string;
  badge?: string;
  isFeatured: boolean;
  isAvailable: boolean;
  category?: "diamonds" | "special" | string;
  group?: "diamonds" | "special" | string;
  customImage?: string | null;
}

export interface GameDetailResponse {
  game: ClientGame;
  packages: ClientPackage[];
  lastSynced?: string;
}

export interface PlayerVerifyResponse {
  success: boolean;
  playerName?: string;
  message?: string;
}
