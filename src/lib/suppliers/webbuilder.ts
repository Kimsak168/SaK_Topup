import "server-only";
import crypto from "crypto";

/**
 * WebBuilder Reseller API Client for Honor of Kings
 * Server-to-server integration only.
 * Money values are integer USD cents. Timestamps are Unix seconds.
 */

// Configuration constants
const DEFAULT_BASE_URL = "https://webbuilderservice.dev/v1";
const MAX_BODY_BYTES = 32 * 1024; // 32 KiB limit
const DEFAULT_TIMEOUT_MS = 10000; // 10s connection/read timeout
const MAX_RETRIES = 3;

// Hourly in-memory cache for products
interface ProductCacheEntry {
  data: WebBuilderProduct[];
  expiresAt: number; // Unix timestamp in seconds
}
let productCache: ProductCacheEntry | null = null;

// ==========================================
// Types
// ==========================================

export interface WebBuilderBalance {
  available_cents: number;
  reserved_cents: number;
}

export interface WebBuilderProduct {
  id: string; // Used unchanged as supplierProductCode
  name: string;
  game?: string;
  region?: string;
  regions?: string[];
  price_cents: number; // Reseller price in integer USD cents
  currency: string; // e.g. "USD"
  orderable: boolean;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface WebBuilderPlayerCheckRequest {
  product_id: string;
  player_id: string;
  zone_id?: string;
}

export interface WebBuilderPlayerCheckResponse {
  success: boolean;
  username: string;
  region?: string;
  zone_name?: string;
  isInvalidId?: boolean;
  isUnavailable?: boolean;
  message?: string;
}

export type WebBuilderOrderStatus =
  | "queued"
  | "submitting"
  | "pending"
  | "succeeded"
  | "failed"
  | "manual_review";

export interface WebBuilderOrderPayload {
  product_id: string;
  player_id: string;
  zone_id?: string;
  reference?: string;
}

export interface WebBuilderOrderResponse {
  id: string;
  status: WebBuilderOrderStatus;
  product_id: string;
  player_id: string;
  zone_id?: string;
  reference?: string;
  price_cents?: number;
  created_at?: number;
  updated_at?: number;
  failure_reason?: string;
  is_duplicate?: boolean; // true if HTTP 200 was returned for existing order
}

export interface WebBuilderWebhookEvent {
  event_id: string;
  event: "order.succeeded" | "order.failed" | "order.manual_review" | string;
  timestamp: number;
  data: {
    order_id: string;
    reference?: string;
    status: WebBuilderOrderStatus;
    product_id?: string;
    player_id?: string;
    price_cents?: number;
    failure_reason?: string;
  };
}

// ==========================================
// Custom Error Hierarchy
// ==========================================

export class WebBuilderError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(message: string, status: number, code: string, detail?: string) {
    super(message);
    this.name = "WebBuilderError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** 401: Unauthorized - Stop and replace the API key */
export class WebBuilderAuthError extends WebBuilderError {
  constructor(detail?: string) {
    super("WebBuilder API authentication failed. Verify WEBBUILDER_API_KEY.", 401, "UNAUTHORIZED", detail);
    this.name = "WebBuilderAuthError";
  }
}

/** 403: Forbidden - Missing scope, suspended account, or spending limit */
export class WebBuilderForbiddenError extends WebBuilderError {
  constructor(detail?: string) {
    super("WebBuilder access forbidden: check permissions, account status, or spending limit.", 403, "FORBIDDEN", detail);
    this.name = "WebBuilderForbiddenError";
  }
}

/** 404: Not Found - Refresh products or verify player details */
export class WebBuilderNotFoundError extends WebBuilderError {
  constructor(detail?: string) {
    super("WebBuilder resource not found: product or player does not exist.", 404, "NOT_FOUND", detail);
    this.name = "WebBuilderNotFoundError";
  }
}

/** 400 / 422: Bad Request - Fix request; do not retry unchanged */
export class WebBuilderBadRequestError extends WebBuilderError {
  constructor(message: string, status = 400, detail?: string) {
    super(message, status, "BAD_REQUEST", detail);
    this.name = "WebBuilderBadRequestError";
  }
}

/** 409: Conflict - Insufficient balance, mapping error, or idempotency payload conflict */
export class WebBuilderConflictError extends WebBuilderError {
  constructor(detail?: string) {
    super("WebBuilder conflict: inspect detail for insufficient balance or idempotency collision.", 409, "CONFLICT", detail);
    this.name = "WebBuilderConflictError";
  }
}

/** 429: Rate Limit Exceeded - Respect Retry-After */
export class WebBuilderRateLimitError extends WebBuilderError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = 1, detail?: string) {
    super(`WebBuilder rate limit exceeded. Retry after ${retryAfterSeconds}s.`, 429, "RATE_LIMITED", detail);
    this.name = "WebBuilderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 500, 502, 503, 504: Server Error - Safe to retry with backoff */
export class WebBuilderServerError extends WebBuilderError {
  constructor(status: number, detail?: string) {
    super(`WebBuilder server error (HTTP ${status}).`, status, "SERVER_ERROR", detail);
    this.name = "WebBuilderServerError";
  }
}

/** Connection or read timeout */
export class WebBuilderTimeoutError extends WebBuilderError {
  constructor(detail?: string) {
    super("WebBuilder request timed out.", 504, "TIMEOUT", detail);
    this.name = "WebBuilderTimeoutError";
  }
}

// ==========================================
// Redacted Logging Helper
// ==========================================

function getApiKey(): string {
  const key = process.env.WEBBUILDER_API_KEY?.trim();
  if (!key) {
    throw new WebBuilderAuthError("Missing WEBBUILDER_API_KEY environment variable on server.");
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.WEBBUILDER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Mask sensitive string for safe logging (never print full keys or secrets)
 */
function maskSecret(str?: string): string {
  if (!str) return "[EMPTY]";
  if (str.length <= 6) return "***";
  return `${str.slice(0, 3)}***${str.slice(-3)}`;
}

/**
 * Mask player UID for audit logs
 */
export function maskPlayerUid(uid?: string): string {
  if (!uid) return "[EMPTY]";
  if (uid.length <= 4) return "***";
  return `${uid.slice(0, 2)}***${uid.slice(-2)}`;
}

/**
 * Redacted logging helper to guarantee sensitive credentials are never logged
 */
function logRedacted(level: "log" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  const sanitizedMeta: Record<string, unknown> = {};
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      const lower = k.toLowerCase();
      if (lower.includes("key") || lower.includes("secret") || lower.includes("token") || lower.includes("authorization") || lower.includes("bearer")) {
        sanitizedMeta[k] = "[REDACTED]";
      } else if (lower.includes("player") || lower.includes("userid") || lower.includes("uid")) {
        sanitizedMeta[k] = typeof v === "string" ? maskPlayerUid(v) : v;
      } else {
        sanitizedMeta[k] = v;
      }
    }
  }

  // Redact any accidental leakage of the actual API key string if present in message
  const key = process.env.WEBBUILDER_API_KEY;
  let cleanMessage = message;
  if (key && key.length > 5 && cleanMessage.includes(key)) {
    cleanMessage = cleanMessage.replaceAll(key, "[REDACTED_API_KEY]");
  }

  if (level === "error") {
    console.error(`[WebBuilder] ${cleanMessage}`, sanitizedMeta);
  } else if (level === "warn") {
    console.warn(`[WebBuilder] ${cleanMessage}`, sanitizedMeta);
  } else {
    console.log(`[WebBuilder] ${cleanMessage}`, sanitizedMeta);
  }
}

// ==========================================
// Idempotency Key Generator & Validation
// ==========================================

/**
 * Derives a stable Idempotency-Key from immutable local order ID.
 * Requirements: 8-100 ASCII letters, numbers, dot, underscore, colon, or hyphen.
 * Pattern: ^[A-Za-z0-9._:-]{8,100}$
 */
export function generateWebBuilderIdempotencyKey(localOrderId: string, prefix = "wb:"): string {
  const sanitized = String(localOrderId || "").trim().replace(/[^A-Za-z0-9._:-]/g, "-");
  let key = `${prefix.endsWith(":") ? prefix : prefix + ":"}${sanitized}`;
  if (key.length < 8) {
    key = `${key}-pad12345`.slice(0, 8);
  }
  if (key.length > 100) {
    key = key.slice(0, 100);
  }
  return key;
}

/**
 * Computes deterministic SHA-256 hash of order request payload for audit trail
 */
export function computeOrderRequestHash(payload: WebBuilderOrderPayload): string {
  const normalized = JSON.stringify({
    product_id: String(payload.product_id),
    player_id: String(payload.player_id),
    zone_id: payload.zone_id ? String(payload.zone_id) : undefined,
    reference: payload.reference ? String(payload.reference) : undefined,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// ==========================================
// HTTP Client with Timeouts & Backoff
// ==========================================

interface RequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function executeRequest<T>(options: RequestOptions): Promise<{ data: T; status: number }> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${options.path.startsWith("/") ? options.path : "/" + options.path}`;
  const method = options.method || "GET";

  let serializedBody: string | undefined;
  if (options.body !== undefined) {
    serializedBody = JSON.stringify(options.body);
    const bodyBytes = Buffer.byteLength(serializedBody, "utf8");
    if (bodyBytes > MAX_BODY_BYTES) {
      throw new WebBuilderBadRequestError(
        `Request payload exceeds 32 KiB limit (${bodyBytes} bytes).`,
        400
      );
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  if (serializedBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let attempt = 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  while (attempt <= MAX_RETRIES) {
    attempt++;

    // Compose abort signal with timeout
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: serializedBody,
        signal: combinedSignal,
        cache: "no-store",
      });
    } catch (err: unknown) {
      const isTimeout =
        (err instanceof Error && err.name === "TimeoutError") ||
        combinedSignal.aborted;

      if (attempt <= MAX_RETRIES && isTimeout) {
        // Backoff with jitter for timeouts
        const jitter = Math.floor(Math.random() * 200);
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 4000) + jitter;
        logRedacted("warn", `Timeout connecting to ${options.path}, retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (isTimeout) {
        throw new WebBuilderTimeoutError(`Request to ${options.path} timed out after ${timeoutMs}ms.`);
      }

      const msg = err instanceof Error ? err.message : String(err);
      if (attempt <= MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 200);
        const backoff = 1000 + jitter;
        logRedacted("warn", `Network error connecting to ${options.path}: ${msg}. Retrying in ${backoff}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw new WebBuilderServerError(503, `Network error communicating with WebBuilder: ${msg}`);
    }

    // Success response handling
    if (response.ok) {
      const json = (await response.json().catch(() => ({}))) as T;
      return { data: json, status: response.status };
    }

    // Parse error response payload
    const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const detail = (errorBody.detail || errorBody.message || errorBody.error || "") as string;

    // Error status code routing
    if (response.status === 401) {
      logRedacted("error", "401 Unauthorized from WebBuilder API. Replace WEBBUILDER_API_KEY.");
      throw new WebBuilderAuthError(detail);
    }

    if (response.status === 403) {
      logRedacted("error", "403 Forbidden from WebBuilder API. Check scopes or account spending limit.", { detail });
      throw new WebBuilderForbiddenError(detail);
    }

    if (response.status === 404) {
      logRedacted("warn", "404 Not Found from WebBuilder API.", { path: options.path, detail });
      throw new WebBuilderNotFoundError(detail);
    }

    if (response.status === 409) {
      logRedacted("warn", "409 Conflict from WebBuilder API.", { path: options.path, detail });
      throw new WebBuilderConflictError(detail);
    }

    if (response.status === 400 || response.status === 422) {
      logRedacted("warn", `HTTP ${response.status} Bad Request from WebBuilder API.`, { path: options.path, detail });
      throw new WebBuilderBadRequestError(detail || `Validation error (${response.status})`, response.status, detail);
    }

    if (response.status === 429) {
      // Respect Retry-After header with exponential backoff and jitter
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Math.max(1, parseInt(retryAfterHeader, 10) || 1) : Math.pow(2, attempt);
      const jitterMs = Math.floor(Math.random() * 300);
      const waitMs = retryAfterSeconds * 1000 + jitterMs;

      logRedacted("warn", `429 Rate limited. Respecting Retry-After: ${retryAfterSeconds}s (waiting ${waitMs}ms)...`);
      if (attempt <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw new WebBuilderRateLimitError(retryAfterSeconds, detail);
    }

    if (response.status >= 500) {
      if (attempt <= MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 250);
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 4000) + jitter;
        logRedacted("warn", `HTTP ${response.status} from WebBuilder. Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw new WebBuilderServerError(response.status, detail);
    }

    throw new WebBuilderError(
      detail || `Unexpected HTTP error ${response.status} from WebBuilder`,
      response.status,
      "UNKNOWN_ERROR",
      detail
    );
  }

  throw new WebBuilderServerError(503, "Max retries exceeded communicating with WebBuilder.");
}

// ==========================================
// API Operations
// ==========================================

/**
 * Filter products specifically for Honor of Kings only.
 * Checks name, game, or tags matching "Honor of Kings" or "HoK".
 */
export function isHonorOfKingsProduct(prod: WebBuilderProduct): boolean {
  const name = (prod.name || "").toLowerCase();
  const game = (prod.game || "").toLowerCase();
  const id = (prod.id || "").toLowerCase();
  return (
    name.includes("honor of king") ||
    name.includes("hok") ||
    game.includes("honor of king") ||
    game.includes("hok") ||
    id.includes("hok") ||
    id.includes("honor-of-kings") ||
    id.includes("honor_of_kings")
  );
}

/**
 * Filter products specifically for Free Fire.
 */
export function isFreeFireProduct(prod: WebBuilderProduct): boolean {
  const name = (prod.name || "").toLowerCase();
  const game = (prod.game || "").toLowerCase();
  const id = (prod.id || "").toLowerCase();
  return (
    game.includes("free fire") ||
    game.includes("freefire") ||
    name.includes("free fire") ||
    name.includes("freefire") ||
    id.includes("freefire")
  );
}

/**
 * Filter products specifically for Mobile Legends (MLBB).
 */
export function isMobileLegendsProduct(prod: WebBuilderProduct): boolean {
  const name = (prod.name || "").toLowerCase();
  const game = (prod.game || "").toLowerCase();
  const id = (prod.id || "").toLowerCase();
  return (
    game.includes("mobile legends") ||
    game.includes("mlbb") ||
    name.includes("mobile legends") ||
    name.includes("mlbb") ||
    id.includes("mlbb")
  );
}

/**
 * Synchronize published products from WebBuilder.
 * Refresh at least hourly. Caches in-memory to prevent rate limit violations.
 */
export async function getWebBuilderProducts(options?: {
  forceRefresh?: boolean;
  honorOfKingsOnly?: boolean;
  gameCode?: string;
}): Promise<WebBuilderProduct[]> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch or use cached products
  let rawList: WebBuilderProduct[] = [];
  if (!options?.forceRefresh && productCache && productCache.expiresAt > now) {
    rawList = productCache.data;
  } else {
    const res = await executeRequest<WebBuilderProduct[] | { products: WebBuilderProduct[]; data?: WebBuilderProduct[] }>({
      method: "GET",
      path: "/products",
    });

    if (Array.isArray(res.data)) {
      rawList = res.data;
    } else if (res.data && Array.isArray((res.data as { products?: WebBuilderProduct[] }).products)) {
      rawList = (res.data as { products: WebBuilderProduct[] }).products;
    } else if (res.data && Array.isArray((res.data as { data?: WebBuilderProduct[] }).data)) {
      rawList = (res.data as { data: WebBuilderProduct[] }).data!;
    }

    // Update in-memory hourly cache (3600s TTL)
    productCache = {
      data: rawList,
      expiresAt: now + 3600,
    };

    logRedacted("log", `Fetched ${rawList.length} total products from WebBuilder /products (cached for 1h).`);
  }

  // Filter based on gameCode or honorOfKingsOnly flag
  const targetCode = options?.gameCode?.toLowerCase().trim();
  if (targetCode) {
    if (targetCode.includes("freefire") || targetCode.includes("free-fire") || targetCode === "ff") {
      return rawList.filter(isFreeFireProduct);
    }
    if (targetCode.includes("mlbb") || targetCode.includes("mobile-legends")) {
      return rawList.filter(isMobileLegendsProduct);
    }
    if (targetCode.includes("hok") || targetCode.includes("honor")) {
      return rawList.filter(isHonorOfKingsProduct);
    }
  }

  if (options?.honorOfKingsOnly === false) {
    return rawList;
  }

  if (options?.honorOfKingsOnly === true) {
    return rawList.filter(isHonorOfKingsProduct);
  }

  return rawList;
}

/**
 * Read balance: available_cents and reserved_cents
 */
export async function getWebBuilderBalance(): Promise<WebBuilderBalance> {
  const res = await executeRequest<WebBuilderBalance | { data: WebBuilderBalance }>({
    method: "GET",
    path: "/balance",
  });

  if ("available_cents" in res.data) {
    return res.data;
  }
  if ("data" in res.data && typeof res.data.data === "object" && res.data.data !== null) {
    return res.data.data;
  }

  return {
    available_cents: Number((res.data as Record<string, unknown>).available_cents || 0),
    reserved_cents: Number((res.data as Record<string, unknown>).reserved_cents || 0),
  };
}

/**
 * Check Honor of Kings player info before payment
 * Sends product_id, player_id, and zone_id when required.
 * Returns verified username and region.
 */
export async function checkWebBuilderPlayer(
  productId: string,
  playerId: string,
  zoneId?: string,
  signal?: AbortSignal
): Promise<WebBuilderPlayerCheckResponse> {
  try {
    const res = await executeRequest<{
      username?: string;
      player_name?: string;
      region?: string;
      zone_name?: string;
      valid?: boolean;
    }>({
      method: "POST",
      path: "/players/check",
      body: {
        product_id: productId,
        player_id: playerId,
        zone_id: zoneId || undefined,
      },
      signal,
    });

    const username = res.data.username || res.data.player_name || "";
    const region = res.data.region || res.data.zone_name;

    if (!username && res.data.valid === false) {
      return {
        success: false,
        isInvalidId: true,
        username: "",
        message: "Honor of Kings player account not found. Check your Player ID / Zone ID.",
      };
    }

    return {
      success: true,
      username,
      region,
      zone_name: region,
    };
  } catch (err: unknown) {
    if (err instanceof WebBuilderNotFoundError || err instanceof WebBuilderBadRequestError) {
      return {
        success: false,
        isInvalidId: true,
        username: "",
        message: err.message || "Invalid Player ID or Zone ID.",
      };
    }

    if (err instanceof WebBuilderTimeoutError || (err instanceof Error && err.name === "AbortError")) {
      return {
        success: false,
        isUnavailable: true,
        username: "",
        message: "Live player verification timed out. You may still proceed if your ID is correct.",
      };
    }

    const msg = err instanceof Error ? err.message : String(err);
    logRedacted("warn", `Player check exception for UID ${maskPlayerUid(playerId)}: ${msg}`);
    return {
      success: false,
      isUnavailable: true,
      username: "",
      message: "Verification service temporarily unavailable.",
    };
  }
}

/**
 * Place an order with WebBuilder using exactly-once rules.
 * Uses a stable Idempotency-Key derived from immutable local order ID.
 * HTTP 201 means created; HTTP 200 means identical earlier order was returned.
 */
export async function createWebBuilderOrder(params: {
  localOrderId: string;
  productId: string;
  playerId: string;
  zoneId?: string;
  reference?: string;
}): Promise<WebBuilderOrderResponse> {
  const idempotencyKey = generateWebBuilderIdempotencyKey(params.localOrderId);
  const payload: WebBuilderOrderPayload = {
    product_id: params.productId,
    player_id: params.playerId,
    zone_id: params.zoneId || undefined,
    reference: params.reference || params.localOrderId,
  };

  logRedacted("log", `Submitting WebBuilder order with key ${idempotencyKey}`, {
    reference: payload.reference,
    productId: payload.product_id,
    playerId: payload.player_id,
  });

  const res = await executeRequest<WebBuilderOrderResponse | { order: WebBuilderOrderResponse; data?: WebBuilderOrderResponse }>({
    method: "POST",
    path: "/orders",
    body: payload,
    idempotencyKey,
  });

  const isDuplicate = res.status === 200;
  let orderData: WebBuilderOrderResponse;

  if ("id" in res.data && "status" in res.data) {
    orderData = res.data;
  } else if ("order" in res.data && typeof res.data.order === "object") {
    orderData = res.data.order;
  } else if ("data" in res.data && typeof res.data.data === "object" && res.data.data !== null) {
    orderData = res.data.data as WebBuilderOrderResponse;
  } else {
    throw new WebBuilderServerError(500, "Unexpected order response format from WebBuilder.");
  }

  return {
    ...orderData,
    is_duplicate: isDuplicate,
  };
}

/**
 * Get order by ID
 */
export async function getWebBuilderOrder(orderId: string): Promise<WebBuilderOrderResponse> {
  const res = await executeRequest<WebBuilderOrderResponse | { order: WebBuilderOrderResponse; data?: WebBuilderOrderResponse }>({
    method: "GET",
    path: `/orders/${encodeURIComponent(orderId)}`,
  });

  if ("id" in res.data && "status" in res.data) {
    return res.data;
  }
  if ("order" in res.data && typeof res.data.order === "object") {
    return res.data.order;
  }
  if ("data" in res.data && typeof res.data.data === "object" && res.data.data !== null) {
    return res.data.data as WebBuilderOrderResponse;
  }

  throw new WebBuilderServerError(500, `Unexpected order response format for order ID ${orderId}`);
}

/**
 * Poll order status with exponential backoff: 2s, 4s, 8s, 15s until final.
 * Final statuses: 'succeeded', 'failed', 'manual_review'.
 * Intermediate: 'queued', 'submitting', 'pending'.
 */
export async function pollWebBuilderOrderUntilFinal(
  orderId: string,
  backoffScheduleMs = [2000, 4000, 8000, 15000]
): Promise<WebBuilderOrderResponse> {
  let currentOrder: WebBuilderOrderResponse | null = null;

  for (let i = 0; i < backoffScheduleMs.length; i++) {
    const delay = backoffScheduleMs[i];
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      currentOrder = await getWebBuilderOrder(orderId);
      logRedacted("log", `Poll attempt ${i + 1}/${backoffScheduleMs.length} for ${orderId}: status is '${currentOrder.status}'`);

      if (
        currentOrder.status === "succeeded" ||
        currentOrder.status === "failed" ||
        currentOrder.status === "manual_review"
      ) {
        return currentOrder;
      }
    } catch (pollErr: unknown) {
      logRedacted("warn", `Polling check error on attempt ${i + 1}: ${pollErr instanceof Error ? pollErr.message : String(pollErr)}`);
    }
  }

  if (currentOrder) {
    return currentOrder;
  }

  // Final fetch attempt
  return getWebBuilderOrder(orderId);
}

// ==========================================
// Webhook Signature Verification
// ==========================================

export interface WebhookVerificationParams {
  rawBody: string | Buffer;
  signature: string;
  timestamp: string | number;
  signingSecret?: string;
  toleranceSeconds?: number;
}

/**
 * Verifies X-WebBuilder-Signature as HMAC-SHA256(signing_secret, timestamp + "." + raw_request_body)
 * Uses raw bytes and constant-time comparison (crypto.timingSafeEqual).
 * Validates timestamp freshness (default: 300 seconds / 5 minutes).
 */
export function verifyWebBuilderWebhookSignature(params: WebhookVerificationParams): boolean {
  const secret = params.signingSecret || process.env.WEBBUILDER_WEBHOOK_SECRET;
  if (!secret) {
    logRedacted("error", "Webhook verification failed: Missing WEBBUILDER_WEBHOOK_SECRET on server.");
    return false;
  }

  if (!params.signature || !params.timestamp || params.rawBody === undefined) {
    return false;
  }

  // 1. Freshness check: reject stale or future timestamps (Unix seconds)
  const timestampNum = typeof params.timestamp === "number" ? params.timestamp : parseInt(params.timestamp, 10);
  if (!Number.isFinite(timestampNum) || timestampNum <= 0) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - timestampNum) > tolerance) {
    logRedacted("warn", `Webhook signature rejected: timestamp difference (${Math.abs(nowSeconds - timestampNum)}s) exceeds ${tolerance}s tolerance.`);
    return false;
  }

  // 2. Compute expected HMAC-SHA256 over raw bytes: timestamp + "." + raw_body
  const rawBodyBytes = Buffer.isBuffer(params.rawBody)
    ? params.rawBody
    : Buffer.from(params.rawBody, "utf8");

  const prefixBytes = Buffer.from(`${timestampNum}.`, "utf8");
  const payloadToSign = Buffer.concat([prefixBytes, rawBodyBytes]);

  const expectedHmacHex = crypto
    .createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("hex");

  // Clean incoming signature
  const cleanSignature = params.signature.trim().replace(/^sha256=/i, "");

  // 3. Constant-time comparison
  const expectedBuffer = Buffer.from(expectedHmacHex, "hex");
  let receivedBuffer: Buffer;
  try {
    receivedBuffer = Buffer.from(cleanSignature, "hex");
  } catch {
    return false;
  }

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
