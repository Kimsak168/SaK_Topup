import "server-only";

const BASE_URL =
  process.env.VIZO_BASE_URL ||
  "https://api.vizoapp.store";

export class VizoError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = "VizoError";
    this.statusCode = statusCode;
  }
}

function getApiKey(): string {
  const apiKey = process.env.VIZO_API_KEY;
  if (!apiKey) {
    throw new VizoError("VIZO_API_KEY is not configured", 500);
  }
  return apiKey;
}

export interface VizoCategory {
  id: number;
  game_code: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  game_fields?: string[];
  requires_server?: boolean;
}

export interface VizoProduct {
  product_code: string;
  name: string;
  sell_price: number; // Supplier buying cost (Internal only)
  status: string; // "active" | "inactive"
}

export interface VizoCatalogueResponse {
  status: string;
  game?: {
    game_code: string;
    name: string;
  };
  products: VizoProduct[];
}

export async function testVizo() {
  const apiKey = getApiKey();
  const response = await fetch(`${BASE_URL}/api/v1/reseller/profile`, {
    headers: {
      "X-API-Key": apiKey,
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new VizoError(`Vizo connection failed: HTTP ${response.status}`, response.status);
  }

  return response.json();
}

/**
 * Fetch available game categories from Vizo catalogue API
 */
export async function getVizoCategories(): Promise<VizoCategory[]> {
  const apiKey = getApiKey();
  try {
    const response = await fetch(`${BASE_URL}/api/v1/catalogue/categories`, {
      headers: {
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new VizoError(`Failed to fetch Vizo categories: HTTP ${response.status}`, response.status);
    }

    return response.json();
  } catch (err: unknown) {
    if (err instanceof VizoError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new VizoError("Vizo API timed out fetching categories", 504);
    }
    throw new VizoError(err instanceof Error ? err.message : "Vizo API failure", 502);
  }
}

/**
 * Fetch real packages for Free Fire or any Vizo game
 * GET /api/v1/catalogue/products/{game_code}
 * Filters active packages and preserves original product_code
 */
export async function getVizoPackages(gameCode: string): Promise<VizoProduct[]> {
  const apiKey = getApiKey();

  // Normalize aliases if necessary: "freefire" or "free-fire" -> "freefire_global"
  let resolvedCode = gameCode.trim();
  if (resolvedCode === "freefire" || resolvedCode === "free-fire") {
    resolvedCode = "freefire_global";
  }

  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/catalogue/products/${encodeURIComponent(resolvedCode)}`,
      {
        headers: {
          "X-API-Key": apiKey,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }
    );

    if (response.status === 404) {
      throw new VizoError(`Game code '${resolvedCode}' not found on Vizo API`, 404);
    }

    if (!response.ok) {
      throw new VizoError(`Vizo API returned error HTTP ${response.status}`, response.status);
    }

    const data: VizoCatalogueResponse = await response.json();
    const products = data.products || [];

    // Filter and show ONLY active packages
    return products.filter((p) => p.status === "active");
  } catch (err: unknown) {
    if (err instanceof VizoError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new VizoError("Vizo API timed out while fetching packages", 504);
    }
    throw new VizoError(err instanceof Error ? err.message : "Vizo API failure", 502);
  }
}

/**
 * Verify player ID and retrieve in-game nickname
 */
export async function checkVizoPlayer(
  game: string,
  userId: string,
  serverId?: string
): Promise<{ success: boolean; playerName?: string; message?: string }> {
  const apiKey = getApiKey();

  try {
    const payload: Record<string, string> = {
      game,
      user_id: userId,
    };
    if (serverId) {
      payload.server_id = serverId;
    }

    const response = await fetch(`${BASE_URL}/api/v1/player_info/check`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    const data = await response.json();

    if (response.ok && (data.status === "APPROVED" || data.msg_status === "success" || data.player_name)) {
      return {
        success: true,
        playerName: data.player_name || data.name || "Verified Player",
        message: data.message || "Player verified successfully",
      };
    }

    return {
      success: false,
      message: data.detail || data.message || "Player not found. Please double check your Player ID.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to verify player with Vizo API",
    };
  }
}

export interface PlaceVizoOrderParams {
  productCode: string;
  userId: string;
  serverId?: string;
  refOrder: string;
}

export interface VizoOrderResult {
  success: boolean;
  status: "completed" | "processing" | "failed" | "pending";
  supplierOrderId?: string;
  transactionId?: string;
  message?: string;
  raw?: unknown;
}

/**
 * Place an order for Free Fire top-up on Vizo
 * POST /api/v1/orders/create_order
 */
export async function placeVizoOrder(
  params: PlaceVizoOrderParams
): Promise<VizoOrderResult> {
  const apiKey = getApiKey();
  const payload: Record<string, string> = {
    product_code: params.productCode,
    game_user_id: params.userId,
    ref_order: params.refOrder,
  };
  if (params.serverId) {
    payload.game_zone_id = params.serverId;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/v1/orders/create_order`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data) {
      const orderStatus = (data.status || "processing").toLowerCase();
      const isCompleted = orderStatus === "success" || orderStatus === "completed";
      const isFailed = orderStatus === "failed";

      return {
        success: !isFailed,
        status: isCompleted ? "completed" : isFailed ? "failed" : "processing",
        supplierOrderId: data.transaction_id || params.refOrder,
        transactionId: data.transaction_id,
        message: data.message || data.detail || "Order submitted to Vizo",
        raw: data,
      };
    }

    const errorMsg =
      data?.message || data?.detail || `Vizo order rejected (HTTP ${response.status})`;
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
        status: "processing", // In-flight timeout, must not retry duplicate purchase
        message: "Vizo request timed out. Awaiting status reconciliation.",
      };
    }
    return {
      success: false,
      status: "failed",
      message: err instanceof Error ? err.message : "Vizo order error",
    };
  }
}

/**
 * Reconcile/check Vizo order status by merchant reference or transaction ID
 */
export async function checkVizoOrderStatus(
  refOrder: string
): Promise<VizoOrderResult | null> {
  const apiKey = getApiKey();
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/orders/order_history?limit=50`,
      {
        headers: {
          "X-API-Key": apiKey,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const orders = data.orders || [];

    const found = orders.find(
      (o: { ref_order?: string; transaction_id?: string }) =>
        o.ref_order === refOrder || o.transaction_id === refOrder
    );

    if (!found) return null;

    const s = (found.status || "").toLowerCase();
    const isCompleted = s === "success" || s === "completed";
    const isFailed = s === "failed";

    return {
      success: isCompleted,
      status: isCompleted ? "completed" : isFailed ? "failed" : "processing",
      supplierOrderId: found.transaction_id || found.ref_order,
      transactionId: found.transaction_id,
      message: found.message || undefined,
      raw: found,
    };
  } catch {
    return null;
  }
}