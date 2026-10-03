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
    throw new G2BulkError("Free Fire is not available via G2Bulk. Please use Vizo supplier.", 400);
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
 * Validate player ID and retrieve username/nickname
 */
export async function checkG2BulkPlayer(
  rawGame: string,
  userId: string,
  serverId?: string
): Promise<G2BulkVerifyResult> {
  const apiKey = process.env.G2BULK_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      isAuthError: true,
      message: "G2BULK_API_KEY is not configured",
    };
  }

  // Normalize game code for G2Bulk checkPlayerId endpoint
  const lowerGame = rawGame.trim().toLowerCase();
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
      signal: AbortSignal.timeout(10000),
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
      (error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout"));
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
}

export interface G2BulkOrderResult {
  success: boolean;
  status: "completed" | "processing" | "failed" | "pending";
  supplierOrderId?: string;
  message?: string;
  raw?: unknown;
}

/**
 * Place a direct game top-up order on G2Bulk
 * Uses SMM v2 protocol: POST https://api.g2bulk.com/api/v2
 */
export async function placeG2BulkOrder(
  params: PlaceG2BulkOrderParams
): Promise<G2BulkOrderResult> {
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
      status: "failed",
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
      status: "failed",
      message: err instanceof Error ? err.message : "G2Bulk order error",
    };
  }
}

/**
 * Check order status on G2Bulk
 * POST https://api.g2bulk.com/api/v2 with action: 'status'
 */
export async function checkG2BulkOrderStatus(
  supplierOrderId: string
): Promise<G2BulkOrderResult | null> {
  const apiKey = getApiKey();
  const orderNum = parseInt(supplierOrderId, 10);
  if (isNaN(orderNum)) return null;

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