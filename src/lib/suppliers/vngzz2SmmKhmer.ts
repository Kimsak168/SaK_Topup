import "server-only";
import { calculateSmmCustomerRate } from "@/lib/services/smmPricing";
import type { KhmerSmmCatalog, KhmerSmmProduct } from "@/lib/khmerSmmTypes";

type KhmerCurrency = "USD" | "KHR";

export class VngzzKhmerSmmError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "UPSTREAM_ERROR",
  ) {
    super(message);
    this.name = "VngzzKhmerSmmError";
  }
}

function getConfig() {
  const baseUrl = (
    process.env.VNGZZ2_SMM_KHMER_BASE_URL ||
    "https://www.vngzz2game.site/api/v1/smm-khmer"
  ).trim().replace(/\/+$/, "");
  const apiKey = process.env.VNGZZ2_GAME_API_KEY?.trim() ||
    process.env.VNGZZ2_PRIMARY_API_KEY?.trim() ||
    process.env.VNGZZ2_PAYMENT_API_KEY?.trim();
  const configuredTimeout = Number(process.env.VNGZZ2_SMM_KHMER_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 100 && configuredTimeout <= 30000
    ? configuredTimeout
    : 15000;

  if (!apiKey) {
    throw new VngzzKhmerSmmError("Khmer SMM API is not configured.", 503, "NOT_CONFIGURED");
  }

  try {
    const url = new URL(baseUrl);
    const isProvider = url.protocol === "https:" && url.hostname === "www.vngzz2game.site";
    const isLocalDevelopment = process.env.NODE_ENV !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if ((!isProvider && !isLocalDevelopment) || url.pathname.replace(/\/+$/, "") !== "/api/v1/smm-khmer") {
      throw new Error("invalid base URL");
    }
  } catch {
    throw new VngzzKhmerSmmError("Khmer SMM API base URL is invalid.", 503, "INVALID_CONFIGURATION");
  }

  return { baseUrl, apiKey, timeoutMs };
}

async function requestJson(path: string, method: "GET" | "POST" = "GET", body?: Record<string, string>) {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new VngzzKhmerSmmError(
      timedOut ? "Khmer SMM API timed out." : "Khmer SMM API is temporarily unreachable.",
      timedOut ? 504 : 502,
      timedOut ? "TIMEOUT" : "UNREACHABLE",
    );
  }

  if (!response.ok) {
    throw new VngzzKhmerSmmError(
      `Khmer SMM API request failed (HTTP ${response.status}).`,
      response.status,
      "UPSTREAM_ERROR",
    );
  }

  const responseText = await response.text();
  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new VngzzKhmerSmmError("Khmer SMM API returned invalid JSON.", 502, "INVALID_RESPONSE");
  }

  return data;
}

export function getKhmerSmmProducts() {
  return requestJson("/products");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseKhmerSmmProduct(value: unknown): KhmerSmmProduct {
  const record = asRecord(value);
  if (!record) throw new VngzzKhmerSmmError("Khmer SMM product data is invalid.", 502, "INVALID_RESPONSE");

  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.replace(/\s+/g, " ").trim() : "";
  const kind = typeof record.kind === "string" ? record.kind.replace(/\s+/g, " ").trim() : "Social media growth";
  const quantity = record.quantity;
  const price = record.price;
  const basePrice = record.base_price;

  if (
    !id || id.length > 128 || !name || name.length > 200 ||
    typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 ||
    typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
    (basePrice !== undefined && (typeof basePrice !== "number" || !Number.isFinite(basePrice) || basePrice < 0))
  ) {
    throw new VngzzKhmerSmmError("Khmer SMM product data is incomplete.", 502, "INVALID_RESPONSE");
  }

  return {
    id,
    name,
    kind: kind.slice(0, 100),
    quantity,
    price,
    basePrice: typeof basePrice === "number" ? basePrice : null,
    customerPrice: calculateSmmCustomerRate(price),
    currency: "USD",
  };
}

export async function getKhmerSmmCatalog(): Promise<KhmerSmmCatalog> {
  const data = asRecord(await getKhmerSmmProducts());
  const products = data?.products;
  const currency = typeof data?.currency === "string" ? data.currency.trim().toUpperCase() : "";
  const status = typeof data?.status === "string" ? data.status.trim().toUpperCase() : "";

  if (!data || status !== "SUCCESS" || currency !== "USD" || !Array.isArray(products)) {
    throw new VngzzKhmerSmmError("Khmer SMM returned an unrecognized product catalog.", 502, "INVALID_RESPONSE");
  }

  const parsed = products.map(parseKhmerSmmProduct);
  if (new Set(parsed.map((product) => product.id)).size !== parsed.length) {
    throw new VngzzKhmerSmmError("Khmer SMM returned duplicate product IDs.", 502, "INVALID_RESPONSE");
  }

  return { currency: "USD", products: parsed };
}

function responseRecords(value: unknown): Record<string, unknown>[] {
  const root = asRecord(value);
  if (!root) return [];
  const records = [root];
  const data = asRecord(root.data);
  const order = asRecord(root.order);
  const nestedOrder = asRecord(data?.order);
  if (data) records.push(data);
  if (order) records.push(order);
  if (nestedOrder) records.push(nestedOrder);
  return records;
}

function firstResponseString(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        if (text) return text;
      }
    }
  }
  return "";
}

export interface KhmerSmmOrderResult {
  status: "processing" | "completed" | "failed" | "unknown";
  orderCode: string;
  supplierStatus: string;
  message: string;
}

function normalizeOrderStatus(rawStatus: string): KhmerSmmOrderResult["status"] {
  const status = rawStatus.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "complete", "done", "delivered", "finished"].includes(status)) return "completed";
  if (["failed", "failure", "cancelled", "canceled", "rejected", "error"].includes(status)) return "failed";
  if (["pending", "processing", "in_progress", "running", "queued", "active"].includes(status)) return "processing";
  return "unknown";
}

export function getKhmerSmmBalance() {
  return requestJson("/balance");
}

export function getKhmerSmmOrders() {
  return requestJson("/orders");
}

export function checkKhmerSmmOrder(orderCode: string) {
  const cleanCode = orderCode.trim();
  if (!cleanCode || cleanCode.length > 160) {
    throw new VngzzKhmerSmmError("A valid supplier order code is required.", 400, "INVALID_ORDER_CODE");
  }
  return requestJson(`/check_order?${new URLSearchParams({ order: cleanCode })}`);
}

export function createKhmerSmmProductOrder(params: {
  productId: string;
  link: string;
  reference: string;
}) {
  const productId = params.productId.trim();
  const link = params.link.trim();
  const reference = params.reference.trim();
  let target: URL;
  try {
    target = new URL(link);
  } catch {
    throw new VngzzKhmerSmmError("A valid public link is required.", 400, "INVALID_LINK");
  }
  if (
    !productId || productId.length > 128 ||
    !reference || reference.length > 160 ||
    !["http:", "https:"].includes(target.protocol) || !target.hostname || link.length > 2048
  ) {
    throw new VngzzKhmerSmmError("The Khmer SMM order details are invalid.", 400, "INVALID_ORDER");
  }

  return requestJson("/product-order", "POST", { product_id: productId, link, reference }).then((data) => {
    const records = responseRecords(data);
    const rawStatus = firstResponseString(records, ["order_status", "fulfillment_status", "state", "status"]);
    const successful = records.every((record) => record.success !== false) &&
      !["error", "failed", "failure", "rejected", "cancelled", "canceled"].includes(rawStatus.toLowerCase());
    const status = successful ? normalizeOrderStatus(rawStatus) : "failed";
    const orderCode = firstResponseString(records, ["order_code", "order_id", "order", "code", "id"]);
    const message = firstResponseString(records, ["message", "error", "description"]);
    return {
      status: status === "unknown" ? "processing" : status,
      orderCode: orderCode || reference,
      supplierStatus: rawStatus || (successful ? "accepted" : "failed"),
      message: message || (successful ? "Khmer SMM order accepted by supplier." : "Khmer SMM rejected the order."),
    } satisfies KhmerSmmOrderResult;
  });
}

export async function getKhmerSmmOrderStatus(orderCode: string): Promise<KhmerSmmOrderResult> {
  const data = await checkKhmerSmmOrder(orderCode);
  const records = responseRecords(data);
  const rawStatus = firstResponseString(records, ["order_status", "fulfillment_status", "state", "status"]);
  const status = normalizeOrderStatus(rawStatus);
  const message = firstResponseString(records, ["message", "error", "description"]);
  return {
    status,
    orderCode,
    supplierStatus: rawStatus || "unknown",
    message: message || (status === "unknown" ? "Khmer SMM returned an unrecognized order status." : `Khmer SMM order status: ${rawStatus}.`),
  };
}

export function createKhmerSmmDeposit(params: { amount: string; currency: KhmerCurrency }) {
  const amount = params.amount.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new VngzzKhmerSmmError("A positive deposit amount is required.", 400, "INVALID_AMOUNT");
  }
  if (params.currency !== "USD" && params.currency !== "KHR") {
    throw new VngzzKhmerSmmError("The deposit currency is invalid.", 400, "INVALID_CURRENCY");
  }
  return requestJson("/deposit", "POST", { amount, currency: params.currency });
}
