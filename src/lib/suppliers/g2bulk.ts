import "server-only";

const BASE_URL =
  process.env.G2BULK_BASE_URL ||
  "https://api.g2bulk.com/v1";

export class G2BulkError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = "G2BulkError";
    this.statusCode = statusCode;
  }
}

function getApiKey(): string {
  const apiKey = process.env.G2BULK_API_KEY;
  if (!apiKey) {
    throw new G2BulkError("G2BULK_API_KEY is not configured", 500);
  }
  return apiKey;
}

export interface G2BulkGame {
  id: number;
  code: string;
  name: string;
  image_url: string;
}

export interface G2BulkCatalogueItem {
  id: number; // Real catalogue ID
  name: string; // Package name
  amount: number; // Supplier buying cost (Internal only)
}

export interface G2BulkProductItem {
  id: number;
  title: string;
  category_id?: number;
  category_title: string;
  unit_price: number;
  stock: number;
  face_value?: number | null;
  description?: string;
  image_url?: string | null;
}

export interface G2BulkFieldsInfo {
  code: string;
  info: {
    fields: string[];
    notes?: string;
  };
}

export async function testG2Bulk() {
  const apiKey = getApiKey();
  const response = await fetch(`${BASE_URL}/getMe`, {
    headers: {
      "X-API-Key": apiKey,
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new G2BulkError(`G2Bulk connection failed: HTTP ${response.status}`, response.status);
  }

  return response.json();
}

export interface G2BulkSmmBalance {
  balance: string;
  currency: string;
}

/** Read the SMM wallet through G2Bulk's documented SMM-panel balance action. */
export async function getG2BulkSmmBalance(): Promise<G2BulkSmmBalance> {
  const apiKey = getApiKey();
  const origin = new URL(BASE_URL).origin;
  let response: Response;
  try {
    response = await fetch(`${origin}/api/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ key: apiKey, action: "balance" }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new G2BulkError("G2Bulk balance service is temporarily unreachable.", 504);
  }

  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || data.error) {
    throw new G2BulkError(`G2Bulk balance request failed (HTTP ${response.status}).`, response.status);
  }

  const rawBalance = data.balance;
  const balance = typeof rawBalance === "number" && Number.isFinite(rawBalance) && rawBalance >= 0
    ? String(rawBalance)
    : typeof rawBalance === "string" && /^\d+(?:\.\d+)?$/.test(rawBalance.trim())
    ? rawBalance.trim()
    : "";
  const currency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "";
  if (!balance || !/^[A-Z]{3}$/.test(currency)) {
    throw new G2BulkError("G2Bulk returned an invalid balance response.", 502);
  }
  return { balance, currency };
}

/**
 * Fetch Roblox direct top-up and gift card products from G2Bulk
 */
export async function getG2BulkRobloxProducts(): Promise<G2BulkProductItem[]> {
  const apiKey = getApiKey();
  try {
    const response = await fetch(`${BASE_URL}/products`, {
      headers: {
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new G2BulkError(`Failed to fetch G2Bulk products: HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    const products: G2BulkProductItem[] = Array.isArray(data.products) ? data.products : [];
    return products.filter((p) => {
      const s = `${p.title} ${p.category_title}`.toLowerCase();
      return s.includes("roblox") || s.includes("robux");
    });
  } catch (err: unknown) {
    if (err instanceof G2BulkError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new G2BulkError("G2Bulk API timed out fetching Roblox products", 504);
    }
    throw new G2BulkError(err instanceof Error ? err.message : "G2Bulk API failure", 502);
  }
}

/**
 * Fetch supported direct top-up games list from G2Bulk
 */
export async function getG2BulkGames(): Promise<G2BulkGame[]> {
  const apiKey = getApiKey();
  try {
    const response = await fetch(`${BASE_URL}/games`, {
      headers: {
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new G2BulkError(`Failed to fetch G2Bulk games: HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data.games)) {
      return data.games;
    }
    return [];
  } catch (err: unknown) {
    if (err instanceof G2BulkError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new G2BulkError("G2Bulk API timed out fetching games", 504);
    }
    throw new G2BulkError(err instanceof Error ? err.message : "G2Bulk API failure", 502);
  }
}

/**
 * Fetch direct top-up catalogue (packages) for a game from G2Bulk
 * GET /v1/games/{code}/catalogue
 *
 * NOTE: Do NOT use G2Bulk for Free Fire.
 * Keeps direct top-ups separate from voucher products.
 */
export async function getG2BulkCatalogue(gameCode: string): Promise<G2BulkCatalogueItem[]> {
  const code = gameCode.trim().toLowerCase();

  // Strict validation: Do not use G2Bulk for Free Fire
  if (code.includes("freefire") || code === "ff") {
    throw new G2BulkError("Free Fire is not available via G2Bulk.", 400);
  }

  // Handle Roblox catalogue from products
  if (code === "roblox" || code === "robux") {
    const robloxProducts = await getG2BulkRobloxProducts();
    return robloxProducts.map((p) => ({
      id: p.id,
      name: p.title,
      amount: p.unit_price,
    }));
  }

  const apiKey = getApiKey();

  try {
    const response = await fetch(
      `${BASE_URL}/games/${encodeURIComponent(gameCode.trim())}/catalogue`,
      {
        headers: {
          "X-API-Key": apiKey,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }
    );

    if (response.status === 404) {
      throw new G2BulkError(`Game code '${gameCode}' not found on G2Bulk API`, 404);
    }

    if (!response.ok) {
      throw new G2BulkError(`G2Bulk API returned error HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    let list: G2BulkCatalogueItem[] = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (Array.isArray(data.catalogues)) {
      list = data.catalogues;
    }

    return list;
  } catch (err: unknown) {
    if (err instanceof G2BulkError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new G2BulkError("G2Bulk API timed out while fetching catalogue", 504);
    }
    throw new G2BulkError(err instanceof Error ? err.message : "G2Bulk API failure", 502);
  }
}

/**
 * Fetch required account fields for a game from G2Bulk
 */
export async function getG2BulkFields(gameCode: string): Promise<G2BulkFieldsInfo | null> {
  const apiKey = getApiKey();
  try {
    const response = await fetch(`${BASE_URL}/games/fields`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ game: gameCode }),
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export interface G2BulkVerifyResult {
  success: boolean;
  playerName?: string;
  message: string;
  isInvalidId?: boolean;
  isSupported?: boolean;
  isAuthError?: boolean;
  isUnavailable?: boolean;
  region?: string;
}

/**
 * Validate Roblox player username or numeric user ID via official Roblox API
 */
export async function checkRobloxPlayer(
  userId: string,
  signal?: AbortSignal
): Promise<G2BulkVerifyResult> {
  const clean = userId.trim();
  if (!clean) {
    return {
      success: false,
      isInvalidId: true,
      message: "Please enter your Roblox Username",
    };
  }

  // 1. If numeric User ID, verify via official Roblox users API
  if (/^\d+$/.test(clean)) {
    try {
      const response = await fetch(`https://users.roblox.com/v1/users/${clean}`, {
        signal: signal || AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (response.ok) {
        const u = await response.json();
        if (u && !u.isBanned) {
          const playerName = u.displayName ? `${u.displayName} (@${u.name})` : u.name;
          return {
            success: true,
            playerName,
            message: "Roblox account confirmed",
          };
        }
      }
    } catch {}
  }

  // 2. Verify by username
  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usernames: [clean],
        excludeBannedUsers: true,
      }),
      signal: signal || AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (response.ok) {
      const d = await response.json();
      if (Array.isArray(d.data) && d.data.length > 0) {
        const u = d.data[0];
        const playerName = u.displayName ? `${u.displayName} (@${u.name})` : u.name;
        return {
          success: true,
          playerName,
          message: "Roblox account confirmed",
        };
      }
      return {
        success: false,
        isInvalidId: true,
        message: "Roblox username not found. Please double check your username.",
      };
    }
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError" || error.message.toLowerCase().includes("timeout"));
    return {
      success: false,
      isUnavailable: true,
      message: isTimeout
        ? "Roblox verification timed out. You may proceed if your username is correct."
        : "Failed to connect to Roblox verification service",
    };
  }

  return {
    success: false,
    isInvalidId: true,
    message: "Roblox account not found. Please double check your username.",
  };
}

/**
 * Validate player ID and retrieve username/nickname
 */
export async function checkG2BulkPlayer(
  rawGame: string,
  userId: string,
  serverId?: string,
  signal?: AbortSignal
): Promise<G2BulkVerifyResult> {
  const lowerGame = rawGame.trim().toLowerCase();

  // Roblox uses official live player verification
  if (lowerGame === "roblox" || lowerGame === "robux") {
    return checkRobloxPlayer(userId, signal);
  }

  const apiKey = process.env.G2BULK_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      isAuthError: true,
      message: "G2BULK_API_KEY is not configured",
    };
  }

  // Normalize game code for G2Bulk checkPlayerId endpoint
  let game = lowerGame;
  if (lowerGame.includes("freefire") || lowerGame.includes("ff") || lowerGame === "free-fire") {
    game = "freefire_sgmy";
  } else if (lowerGame === "pubg-mobile") {
    game = "pubgm";
  } else if (lowerGame === "mobile-legends") {
    game = "mlbb";
  }

  try {
    const payload: Record<string, string> = {
      game,
      user_id: userId.trim(),
      userid: userId.trim(),
    };
    if (serverId && serverId.trim()) {
      payload.server_id = serverId.trim();
      payload.serverid = serverId.trim();
      payload.zone_id = serverId.trim();
    }

    const response = await fetch(`${BASE_URL}/games/checkPlayerId`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: signal || AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        isAuthError: true,
        message: "G2Bulk authentication failed. Please check credentials.",
      };
    }

    if (response.status >= 500) {
      return {
        success: false,
        isUnavailable: true,
        message: "G2Bulk verification server temporarily unavailable.",
      };
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      return {
        success: false,
        isUnavailable: true,
        message: "Empty response from G2Bulk verification service.",
      };
    }

    // 1. Check if game is explicitly unsupported by G2Bulk checkPlayerId
    if (
      response.status === 404 ||
      (typeof data.message === "string" &&
        (data.message.toLowerCase().includes("not available") ||
          data.message.toLowerCase().includes("not support") ||
          data.message.toLowerCase().includes("unsupported")))
    ) {
      return {
        success: false,
        isSupported: false,
        message: "Live nickname check is not available for this game.",
      };
    }

    // 2. Extract genuine player name / nickname
    const candidateName = data.name || data.username || data.nickname || data.player_name;
    const hasValidName = typeof candidateName === "string" && candidateName.trim() !== "";

    if (hasValidName && data.valid !== "invalid") {
      return {
        success: true,
        playerName: candidateName.trim(),
        message: "Player account confirmed",
        region: typeof data.region === "string" ? data.region : undefined,
      };
    }

    // 3. Determine if G2Bulk explicitly confirmed ID is invalid
    if (data.valid === "invalid" || (response.status === 400 && data.name === "")) {
      return {
        success: false,
        isInvalidId: true,
        message: "Player not found. Please double check your Player ID.",
      };
    }

    return {
      success: false,
      message: data.message || data.error || "Player ID could not be validated. Please check your ID and Server ID.",
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError" || error.message.toLowerCase().includes("timeout"));
    return {
      success: false,
      isUnavailable: true,
      message: isTimeout
        ? "G2Bulk verification request timed out. You may proceed if your Player ID is correct."
        : error instanceof Error
        ? error.message
        : "Failed to connect to G2Bulk API",
    };
  }
}

export interface PlaceG2BulkOrderParams {
  catalogueId: string | number;
  userId: string;
  serverId?: string;
  refOrder: string;
  gameSlug?: string;
  isProduct?: boolean;
}

export interface G2BulkOrderResult {
  success: boolean;
  status: "completed" | "processing" | "failed" | "pending";
  supplierOrderId?: string;
  deliveryItems?: string[];
  message?: string;
  raw?: unknown;
}

/**
 * Purchase a product (e.g. Robux / Gift Card) from G2Bulk
 * POST https://api.g2bulk.com/v1/products/{id}/purchase
 */
export async function purchaseG2BulkProduct(
  productId: number | string,
  refOrder: string,
  quantity: number = 1
): Promise<G2BulkOrderResult> {
  const apiKey = getApiKey();
  const id = Number(productId);
  if (isNaN(id) || id <= 0) {
    return {
      success: false,
      status: "failed",
      message: `Invalid product ID for G2Bulk purchase: ${productId}`,
    };
  }

  try {
    const response = await fetch(`${BASE_URL}/products/${id}/purchase`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": refOrder,
      },
      body: JSON.stringify({
        quantity,
        description: refOrder,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && (data.success !== false || data.status === "COMPLETED" || data.status === "PENDING")) {
      const orderId = String(data.order_id || refOrder);
      const isCompleted = data.status === "COMPLETED" || (Array.isArray(data.delivery_items) && data.delivery_items.length > 0);
      return {
        success: true,
        status: isCompleted ? "completed" : "processing",
        supplierOrderId: orderId,
        deliveryItems: Array.isArray(data.delivery_items) ? data.delivery_items : undefined,
        message: isCompleted ? "Delivered successfully" : (data.message || "Order pending on G2Bulk"),
        raw: data,
      };
    }

    const errorMsg = data?.error || data?.message || `G2Bulk purchase failed (HTTP ${response.status})`;
    return {
      success: false,
      status: !data || response.status >= 500 || response.status === 429 ? "processing" : "failed",
      message: errorMsg,
      raw: data,
    };
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return {
        success: false,
        status: "processing",
        message: "G2Bulk request timed out. Awaiting status reconciliation.",
      };
    }
    return {
      success: false,
      status: "processing",
      message: err instanceof Error ? err.message : "G2Bulk purchase error",
    };
  }
}

/**
 * Place a direct game top-up or product order on G2Bulk
 */
export async function placeG2BulkOrder(
  params: PlaceG2BulkOrderParams
): Promise<G2BulkOrderResult> {
  const isRoblox = params.gameSlug === "roblox" || params.gameSlug === "robux" || params.isProduct;
  if (isRoblox) {
    return purchaseG2BulkProduct(params.catalogueId, params.refOrder);
  }

  const apiKey = getApiKey();
  const serviceId = Number(params.catalogueId);

  // Link format: userId (and zone if provided)
  const link = params.serverId
    ? `${params.userId}|${params.serverId}`
    : params.userId;

  const bodyPayload: Record<string, unknown> = {
    key: apiKey,
    action: "add",
    service: serviceId,
    link,
    quantity: 1,
    custom_data: params.serverId || undefined,
  };

  try {
    const response = await fetch("https://api.g2bulk.com/api/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && !data.error) {
      const orderId = String(data.order || params.refOrder);
      return {
        success: true,
        status: "processing", // SMM orders are queued/processing
        supplierOrderId: orderId,
        message: "Order queued on G2Bulk",
        raw: data,
      };
    }

    const errorMsg = data?.error || `G2Bulk order failed (HTTP ${response.status})`;
    return {
      success: false,
      status: !data || response.status >= 500 || response.status === 429 ? "processing" : "failed",
      message: errorMsg,
      raw: data,
    };
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return {
        success: false,
        status: "processing",
        message: "G2Bulk request timed out. Awaiting status reconciliation.",
      };
    }
    return {
      success: false,
      status: "processing",
      message: err instanceof Error ? err.message : "G2Bulk order error",
    };
  }
}

/**
 * Check order status on G2Bulk
 * Checks /v1/orders/{id} first, then falls back to /api/v2 status
 */
export async function checkG2BulkOrderStatus(
  supplierOrderId: string
): Promise<G2BulkOrderResult | null> {
  const apiKey = getApiKey();
  const orderNum = parseInt(supplierOrderId, 10);
  if (isNaN(orderNum)) return null;

  // 1. Check /v1/orders/{id}
  try {
    const res = await fetch(`${BASE_URL}/orders/${orderNum}`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.order) {
        const ord = data.order;
        const s = String(ord.status || "").toLowerCase();
        const isCompleted = s === "completed" || s === "delivered" || s === "success";
        const isFailed = s === "canceled" || s === "cancelled" || s === "failed";
        return {
          success: isCompleted,
          status: isCompleted ? "completed" : isFailed ? "failed" : "processing",
          supplierOrderId: String(ord.id || orderNum),
          deliveryItems: Array.isArray(ord.delivery_items) ? ord.delivery_items : undefined,
          message: ord.status || undefined,
          raw: data,
        };
      }
    }
  } catch {
    // proceed to SMM check
  }

  // 2. Fall back to SMM v2 protocol status check
  try {
    const response = await fetch("https://api.g2bulk.com/api/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: apiKey,
        action: "status",
        order: orderNum,
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data.error) return null;

    const s = String(data.status || "").toLowerCase();
    const isCompleted = s === "completed" || s === "success";
    const isFailed = s === "canceled" || s === "cancelled" || s === "failed";

    return {
      success: isCompleted,
      status: isCompleted ? "completed" : isFailed ? "failed" : "processing",
      supplierOrderId: String(orderNum),
      message: data.status || undefined,
      raw: data,
    };
  } catch {
    return null;
  }
}
