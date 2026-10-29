import "server-only";

// Provider contract: https://www.vngzz2game.site/api/document?format=json
// Catalogue requests also require X-API-Key, despite security: [] in the spec.
export interface VngzzGame {
  game_code: string;
  name: string;
  display_name?: string;
  description?: string;
  image_url?: string;
  thumb_url?: string;
  game_fields: string[];
}

export interface VngzzProduct {
  product_code: string;
  name: string;
  price: number;
  available: boolean;
  currency: string;
}

export class VngzzGameError extends Error {
  constructor(message: string, public status = 502, public code = "UPSTREAM_ERROR") {
    super(message);
    this.name = "VngzzGameError";
  }
}

export function getVngzzGameConfig() {
  const baseUrl = (process.env.VNGZZ2_GAME_BASE_URL || process.env.VNGZZ2_PAYMENT_BASE_URL || "https://www.vngzz2game.site/api")
    .trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  const apiKey = process.env.VNGZZ2_GAME_API_KEY?.trim() || process.env.VNGZZ2_PRIMARY_API_KEY?.trim() || process.env.VNGZZ2_PAYMENT_API_KEY?.trim();
  if (!apiKey) throw new VngzzGameError("VNGZZ2 game API key is not configured.", 503, "NOT_CONFIGURED");
  const configuredTimeout = Number(process.env.VNGZZ2_GAME_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 100 && configuredTimeout <= 30000 ? configuredTimeout : 15000;
  return { baseUrl, apiKey, timeoutMs };
}

export function isVngzzGameConfigured() {
  return Boolean(process.env.VNGZZ2_GAME_API_KEY?.trim() || process.env.VNGZZ2_PRIMARY_API_KEY?.trim() || process.env.VNGZZ2_PAYMENT_API_KEY?.trim());
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VngzzGameError("VNGZZ2 returned an invalid response.", 502, "INVALID_RESPONSE");
  return value as JsonObject;
}

async function request(path: string, body?: JsonObject): Promise<JsonObject> {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();
  // Never replay a purchase automatically, even after a timeout or 5xx.
  const attempts = body ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/game${path}`, {
        method: body ? "POST" : "GET",
        headers: { Accept: "application/json", "X-API-Key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
        continue;
      }
      throw new VngzzGameError("VNGZZ2 game API is temporarily unreachable.", 504, "UNREACHABLE");
    }
    if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 300 * 2 ** attempt;
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, Math.max(100, Number.isFinite(delay) ? delay : 1000))));
      continue;
    }
    const data = object(await response.json().catch(() => null));
    if (!response.ok || data.success === false || data.status === "error") {
      const message = typeof data.message === "string" ? data.message.split(apiKey).join("[redacted]").slice(0, 300) : "Game API request failed.";
      throw new VngzzGameError(`VNGZZ2: ${message}`, response.ok ? 502 : response.status, typeof data.code === "string" ? data.code : "UPSTREAM_ERROR");
    }
    return data;
  }
  throw new VngzzGameError("VNGZZ2 game API request failed.");
}

export function normalizeVngzzGames(payload: unknown): VngzzGame[] {
  const data = object(payload);
  if (!Array.isArray(data.categories)) throw new VngzzGameError("VNGZZ2 categories are missing.", 502, "INVALID_RESPONSE");
  const codes = new Set<string>();
  const games = data.categories.map(value => {
    const game = object(value);
    if (typeof game.game_code !== "string" || !/^[a-zA-Z0-9_-]+$/.test(game.game_code) || typeof game.name !== "string" || !game.name.trim() || codes.has(game.game_code)) {
      throw new VngzzGameError("VNGZZ2 returned an invalid or duplicate game.", 502, "INVALID_RESPONSE");
    }
    codes.add(game.game_code);
    return { ...game, game_fields: Array.isArray(game.game_fields) ? game.game_fields.filter((field): field is string => typeof field === "string") : [] } as unknown as VngzzGame;
  });
  if (typeof data.total === "number" && data.total !== games.length) throw new VngzzGameError("VNGZZ2 returned an incomplete catalogue.", 502, "INCOMPLETE_CATALOGUE");
  return games;
}

export function normalizeVngzzProducts(payload: unknown): VngzzProduct[] {
  const data = object(payload);
  if (!Array.isArray(data.products)) throw new VngzzGameError("VNGZZ2 products are missing.", 502, "INVALID_RESPONSE");
  const codes = new Set<string>();
  return data.products.map(value => {
    const product = object(value);
    const code = product.product_code;
    // sell_price/price is what this reseller pays. cost_price is the provider's
    // own upstream cost and must never become our buying price.
    const rawPrice = product.sell_price ?? product.price;
    const price = typeof rawPrice === "number" ? rawPrice : typeof rawPrice === "string" && /^\d+(\.\d+)?$/.test(rawPrice.trim()) ? Number(rawPrice) : NaN;
    if (typeof code !== "string" || !code.trim() || codes.has(code) || typeof product.name !== "string" || !product.name.trim() || !Number.isFinite(price) || price < 0) {
      throw new VngzzGameError("VNGZZ2 returned an invalid product or price.", 502, "INVALID_RESPONSE");
    }
    codes.add(code);
    return { product_code: code, name: product.name.trim(), price, available: price > 0 && product.status === "active" && product.orderable !== false, currency: typeof product.currency === "string" ? product.currency : "USD" };
  });
}

export async function getVngzzGames() {
  return normalizeVngzzGames(await request("/categories"));
}

export async function getVngzzProducts(gameCode: string) {
  const result = await request(`/products?${new URLSearchParams({ game_code: gameCode })}`);
  const game = object(result.game);
  if (game.game_code !== gameCode) throw new VngzzGameError("VNGZZ2 returned products for a different game.", 502, "GAME_MISMATCH");
  return normalizeVngzzProducts(result);
}

export function getVngzzImageUrl(image?: string) {
  if (!image) return "/images/hero-banner.jpg";
  try {
    const url = new URL(image, new URL(getVngzzGameConfig().baseUrl).origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "/images/hero-banner.jpg";
  } catch { return "/images/hero-banner.jpg"; }
}

export function isVngzzCheckoutSupported(game: VngzzGame) {
  // The published create_order contract accepts only player and zone IDs.
  // Do not charge for games requiring character names or other unmapped fields.
  return game.game_fields.every(field => ["userid", "serverid"].includes(field));
}

export function getVngzzProfile() { return request("/profile"); }

/** Read the documented account profile without exposing API credentials to callers. */
export async function getVngzzAccountProfile(): Promise<JsonObject> {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/me`, {
      headers: { Accept: "application/json", "X-API-Key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new VngzzGameError("VNGZZ2 account profile is temporarily unreachable.", 504, "UNREACHABLE");
  }

  const payload = await response.json().catch(() => null);
  const data = object(payload);
  if (!response.ok || data.success === false || data.status === "error") {
    throw new VngzzGameError(`VNGZZ2 account profile request failed (HTTP ${response.status}).`, response.status);
  }
  return data;
}

export interface VngzzOrderResult {
  id: string;
  status: "completed" | "failed" | "processing";
  supplierStatus: string;
  message: string;
}

function normalizeOrder(data: JsonObject, reference: string): VngzzOrderResult {
  const order = object(data.data ?? data.order ?? data);
  const supplierStatus = String(order.order_status ?? order.status ?? "pending").toLowerCase();
  return {
    id: String(order.order_id ?? order.id ?? reference),
    status: ["completed", "delivered", "succeeded"].includes(supplierStatus) ? "completed" : ["failed", "cancelled", "canceled", "refunded"].includes(supplierStatus) ? "failed" : "processing",
    supplierStatus,
    message: typeof order.message === "string" ? order.message : `VNGZZ2 order status: ${supplierStatus}`,
  };
}

export async function createVngzzOrder(params: { productCode: string; playerId: string; serverId?: string; reference: string }) {
  if (![params.productCode, params.playerId, params.reference].every(value => typeof value === "string" && value.trim())) throw new VngzzGameError("Product, player ID and order reference are required.", 400, "INVALID_ORDER");
  return normalizeOrder(await request("/create_order", {
    product_code: params.productCode,
    game_user_id: params.playerId,
    ...(params.serverId ? { game_zone_id: params.serverId } : {}),
    reference: params.reference,
  }), params.reference);
}

export async function checkVngzzOrder(reference: string) {
  return normalizeOrder(await request(`/check_order?${new URLSearchParams({ reference })}`), reference);
}

export interface VngzzPlayerCheckResult {
  valid: boolean;
  username?: string;
  region?: string;
  message?: string;
}

export async function checkVngzzPlayer(
  gameCode: string,
  userId: string,
  serverId?: string,
  signal?: AbortSignal
): Promise<VngzzPlayerCheckResult> {
  const { baseUrl, apiKey } = getVngzzGameConfig();
  const params = new URLSearchParams({
    game: String(gameCode).trim(),
    userid: String(userId).trim(),
  });
  if (serverId) params.append("serverid", String(serverId).trim());

  try {
    const res = await fetch(`${baseUrl}/v1/game/check_id?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
      signal: signal || AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { valid: false, message: `Supplier returned HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = (data.data || data) as Record<string, unknown>;
    const isValid = Boolean(payload.valid || payload.status === "APPROVED" || data.success === true);
    const username = String(payload.username || payload.name || payload.nickname || "").trim();

    return {
      valid: isValid,
      username: username || (isValid ? "Verified Player" : undefined),
      region: payload.region ? String(payload.region) : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Verification check failed: ${msg}` };
  }
}

// ============================================================================
// SMM (Social Media Growth Services)
// ============================================================================

export interface VngzzSmmService {
  service: string;
  name: string;
  type?: string;
  category: string;
  platform?: string;
  refill?: boolean;
  rate: number; // Wholesale price per 1,000 units in USD
  min: number;
  max: number;
  description?: string;
}

export interface VngzzSmmOrderResult {
  orderId: string;
  status: "completed" | "processing" | "failed";
  supplierStatus: string;
  message: string;
}

export interface VngzzSmmServiceCandidate {
  service: string;
  name: string;
  type?: string;
  category: string;
  platform?: string;
  refill?: boolean;
  rate: number | null;
  min: number | null;
  max: number | null;
  description?: string;
  supplierAvailable: boolean;
  issues: string[];
}

export interface VngzzSmmCatalogSnapshot {
  total: number;
  services: VngzzSmmServiceCandidate[];
  fetchedAt: string;
}

function parseSmmFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["yes", "true", "1", "y", "enabled", "active"].includes(normalized)) return true;
  if (["no", "false", "0", "n", "disabled", "inactive", "none"].includes(normalized)) return false;
  return undefined;
}

function isActiveSmmRecord(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  const activeFlag = parseSmmFlag(record.active ?? record.is_active ?? record.enabled);
  if (activeFlag === false) return false;
  const status = String(record.status ?? record.state ?? "").trim().toLowerCase();
  if (parseSmmFlag(status) === false) return false;
  return !["inactive", "disabled", "paused", "unavailable", "deleted", "hidden"].includes(status);
}

let cachedSmmSnapshot: { data: VngzzSmmCatalogSnapshot; expiresAt: number } | null = null;

function parseSmmNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSmmInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function getVngzzSmmServiceSnapshot(forceRefresh = false): Promise<VngzzSmmCatalogSnapshot> {
  const now = Date.now();
  if (!forceRefresh && cachedSmmSnapshot && cachedSmmSnapshot.expiresAt > now) {
    return cachedSmmSnapshot.data;
  }

  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();
  try {
    const res = await fetch(`${baseUrl}/v1/smm/services`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      if (!forceRefresh && cachedSmmSnapshot?.data?.services.length) return cachedSmmSnapshot.data;
      throw new VngzzGameError(`VNGZZ2 SMM services HTTP ${res.status}`, res.status);
    }

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | unknown[];
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.services)
      ? ((data as Record<string, unknown>).services as unknown[])
      : Array.isArray((data as Record<string, unknown>)?.data)
      ? ((data as Record<string, unknown>).data as unknown[])
      : [];

    const services: VngzzSmmServiceCandidate[] = rawList.map((item) => {
      const obj = (item || {}) as Record<string, unknown>;
      const serviceValue = obj.service ?? obj.id ?? obj.service_id;
      const service = serviceValue === undefined || serviceValue === null ? "" : String(serviceValue);
      const name = typeof obj.name === "string" ? obj.name.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() : "";
      const category = typeof obj.category === "string" ? obj.category.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() : "";
      const description = typeof obj.description === "string" ? obj.description.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() : "";
      const rate = parseSmmNumber(obj.rate ?? obj.price);
      const min = parseSmmInteger(obj.min);
      const max = parseSmmInteger(obj.max);
      const platform = typeof obj.platform === "string" ? obj.platform.replace(/\s+/g, " ").trim() : undefined;
      const refill = parseSmmFlag(obj.refill);
      const supplierAvailable = isActiveSmmRecord(obj);
      const issues: string[] = [];
      if (!service.trim()) issues.push("missing_supplier_service_id");
      if (!name) issues.push("missing_name");
      if (rate === null || rate <= 0) issues.push("invalid_rate");
      if (min === null || min <= 0) issues.push("invalid_minimum");
      if (max === null || min === null || max < min) issues.push("invalid_maximum");
      if (!supplierAvailable) issues.push("inactive_or_unavailable");
      if (platform && !["tiktok", "telegram", "facebook", "instagram", "youtube", "other", "fb", "ig", "yt", "tg"].includes(platform.toLowerCase())) {
        issues.push("unrecognized_platform");
      }
      return {
        service,
        name,
        type: typeof obj.type === "string" ? obj.type.replace(/\s+/g, " ").trim() : undefined,
        category,
        platform,
        refill,
        rate,
        min,
        max,
        description: description || undefined,
        supplierAvailable,
        issues,
      };
    });
    const snapshot = { total: rawList.length, services, fetchedAt: new Date().toISOString() };
    cachedSmmSnapshot = { data: snapshot, expiresAt: now + 5 * 60 * 1000 };
    return snapshot;
  } catch (err: unknown) {
    if (!forceRefresh && cachedSmmSnapshot?.data?.services.length) {
      return cachedSmmSnapshot.data;
    }
    throw err;
  }
}

export async function getVngzzSmmServices(forceRefresh = false): Promise<VngzzSmmService[]> {
  const snapshot = await getVngzzSmmServiceSnapshot(forceRefresh);
  return snapshot.services
    .filter((service) => service.supplierAvailable && service.issues.length === 0)
    .map((service) => ({
      service: service.service,
      name: service.name,
      type: service.type,
      category: service.category,
      platform: service.platform?.toLowerCase(),
      refill: service.refill,
      rate: service.rate as number,
      min: service.min as number,
      max: service.max as number,
      description: service.description,
    }));
}

export async function createVngzzSmmOrder(params: {
  serviceId: string | number;
  link: string;
  quantity: number;
  reference?: string;
}): Promise<VngzzSmmOrderResult> {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();
  const payload = {
    service: String(params.serviceId).trim(),
    link: String(params.link).trim(),
    quantity: Number(params.quantity),
    ...(params.reference ? { reference: params.reference } : {}),
  };

  const res = await fetch(`${baseUrl}/v1/smm/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = ((await res.json().catch(() => ({}))) || {}) as Record<string, unknown>;
  if (!res.ok || data.status === "error" || data.success === false) {
    const errorMsg = String(data.message || data.error || `SMM order failed with HTTP ${res.status}`);
    return {
      orderId: "",
      status: "failed",
      supplierStatus: "failed",
      message: errorMsg,
    };
  }

  const orderId = String(data.order ?? data.order_id ?? data.id ?? params.reference ?? "");
  return {
    orderId,
    status: "processing",
    supplierStatus: "processing",
    message: String(data.message || "SMM order placed successfully"),
  };
}

export async function checkVngzzSmmOrder(orderId: string | number) {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();
  const res = await fetch(`${baseUrl}/v1/smm/status?${new URLSearchParams({ order: String(orderId) })}`, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    return { status: "unknown", message: `Status inquiry HTTP ${res.status}` };
  }

  return res.json().catch(() => ({}));
}


