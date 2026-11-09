import "server-only";

export interface PeSupplyVariation {
  id: string;
  name: string;
  price: number;
  list_price?: number;
  discount?: {
    label: string;
    percent_off: number;
    amount_off: number;
  } | null;
  stock?: number | null;
  in_stock: boolean;
  preorder: boolean;
  requires_email: boolean;
  expire_days?: number | null;
  purchasable: boolean;
}

export interface PeSupplyProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  description?: string | null;
  delivery_kind: "account" | "code" | "token" | string;
  variations: PeSupplyVariation[];
}

export interface PeSupplyBalanceResponse {
  telegram_id: number;
  username: string;
  balance: number;
  currency: string;
  orders_count: number;
}

export interface PeSupplyOrderResponse {
  id: string;
  reference: string;
  status: "completed" | "activation_awaiting" | "failed" | "cancelled" | string;
  product: string;
  variation: string;
  quantity: number;
  unit_price: number;
  total: number;
  currency: string;
  source: string;
  paid_with: string;
  created_at: string;
  completed_at?: string | null;
  items?: string[];
  emails?: string[];
  balance: number;
}

export class PeSupplyError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "UPSTREAM_ERROR"
  ) {
    super(message);
    this.name = "PeSupplyError";
  }
}

function getConfig() {
  const baseUrl = (
    process.env.PE_SUPPLY_BASE_URL ||
    "https://digital-assets-api.pe-supplykh.com/api/v1"
  ).trim().replace(/\/+$/, "");

  const apiKey =
    process.env.PE_SUPPLY_API_KEY?.trim() ||
    "rk_live_V0eoBlYqBMODwBujh3zLdbteED5nx8gDes_IL8TLqu0";

  const timeoutMs = 25000;

  if (!apiKey) {
    throw new PeSupplyError("PE-Supply Digital Assets API key is not configured.", 503, "NOT_CONFIGURED");
  }

  return { baseUrl, apiKey, timeoutMs };
}

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<T> {
  const { baseUrl, apiKey, timeoutMs } = getConfig();

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new PeSupplyError(
      isTimeout ? "PE-Supply API timed out." : "PE-Supply API is temporarily unreachable.",
      isTimeout ? 504 : 502,
      isTimeout ? "TIMEOUT" : "UNREACHABLE"
    );
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg =
      json?.error?.message ||
      json?.message ||
      `PE-Supply request failed with HTTP ${res.status}`;
    const errorCode = json?.error?.code || `HTTP_${res.status}`;
    throw new PeSupplyError(errorMsg, res.status, errorCode);
  }

  return json as T;
}

/**
 * Fetch all digital products and variations from PE-Supply.
 */
export async function getPeSupplyProducts(): Promise<PeSupplyProduct[]> {
  const response = await requestJson<{
    data: PeSupplyProduct[];
    pagination: { page: number; per_page: number; has_more: boolean };
  }>("/products?per_page=100");

  return response?.data || [];
}

/**
 * Check reseller wallet balance.
 */
export async function getPeSupplyBalance(): Promise<PeSupplyBalanceResponse> {
  return requestJson<PeSupplyBalanceResponse>("/balance");
}

/**
 * Place a digital order with synchronous delivery.
 */
export async function createPeSupplyOrder(params: {
  product: string; // product slug or id (e.g. "capcut-pro-2")
  variation: string; // variation id (e.g. "1m")
  quantity?: number;
  emails?: string[];
  idempotencyKey?: string;
}): Promise<PeSupplyOrderResponse> {
  const body: Record<string, unknown> = {
    product: params.product,
    variation: params.variation,
    quantity: params.quantity || 1,
  };

  if (params.emails && params.emails.length > 0) {
    body.emails = params.emails;
  }

  return requestJson<PeSupplyOrderResponse>(
    "/orders",
    "POST",
    body,
    params.idempotencyKey
  );
}

/**
 * Fetch past order by order ID or list recent orders.
 */
export async function getPeSupplyOrders(page = 1, perPage = 20): Promise<{
  data: PeSupplyOrderResponse[];
  pagination: { page: number; per_page: number; has_more: boolean };
}> {
  return requestJson(`/orders?page=${page}&per_page=${perPage}`);
}
