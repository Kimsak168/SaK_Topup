import "server-only";
import crypto from "crypto";
import QRCode from "qrcode";

/**
 * ABA PayWay V2 (VngZz2 Payment API) Service
 * Official integration for Cambodia ABA PayWay KHQR payments via VngZz2 Game API.
 * 
 * Documentation verified against:
 * https://www.vngzz2game.site/api/document
 * https://www.vngzz2game.site/api/document?format=json
 */

export class VngZz2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VngZz2ConfigError";
  }
}

export class VngZz2ApiError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, status = 500, code?: string, details?: unknown) {
    super(message);
    this.name = "VngZz2ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get statusCode(): number {
    return this.status;
  }
}

export class VngZz2TimeoutError extends VngZz2ApiError {
  constructor(message = "VngZz2 payment request timed out") {
    super(message, 504, "TIMEOUT");
    this.name = "VngZz2TimeoutError";
  }
}

export interface VngZz2Config {
  baseUrl: string;
  apiKey: string;
  slot?: string;
  currency?: string;
  webhookSecret?: string;
}

export interface GenerateQrParams {
  amount: number | string;
  currency?: "USD" | "KHR";
  orderNumber: string;
  idempotencyKey?: string;
  slot?: string;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface GenerateQrResult {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
  state: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  qrString?: string;
  qrImage?: string; // base64 data URI (e.g. data:image/png;base64,...)
  qrPngUrl?: string; // hosted PNG URL
  payUrl?: string; // hosted checkout URL
  deepLink?: string; // abamobilebank:// deep link for mobile apps
  expireInSec: number;
  expiresAt?: string;
}

export interface CheckTransactionResult {
  success: boolean;
  transactionId: string;
  state: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  isPaid: boolean;
  amount: number;
  currency: string;
  action?: string;
  code?: string;
  paywayTransactionId?: string;
  receiptUrl?: string;
  checkedAt?: string;
  message?: string;
}

export interface VngZz2HealthResult {
  available: boolean;
  state?: string;
  latencyMs?: number;
  message?: string;
  service?: string;
  version?: string;
  capabilities?: string[];
}

/**
 * Check if VngZz2 environment configuration is provided.
 */
export function isVngZz2Configured(): boolean {
  return Boolean(
    (process.env.VNGZZ2_PRIMARY_API_KEY || process.env.VNGZZ2_PAYMENT_API_KEY)?.trim()
  );
}

/**
 * Validate and retrieve VngZz2 payment credentials securely.
 * Never exposes credentials to frontend code.
 */
export function getVngZz2Config(): VngZz2Config {
  const apiKey = (process.env.VNGZZ2_PRIMARY_API_KEY || process.env.VNGZZ2_PAYMENT_API_KEY)?.trim();
  const rawBase = (process.env.VNGZZ2_PAYMENT_BASE_URL || "https://www.vngzz2game.site/api").trim();
  // Strip trailing slashes and any trailing /v1 so endpoint paths (/v1/generate_qr) don't become /v1/v1
  const baseUrl = rawBase.replace(/\/+$/, "").replace(/\/v1$/, "");
  const slot = (process.env.VNGZZ2_PAYMENT_SLOT || process.env.VNGZZ2_PAYMENT_SLOT_ID || "USD").trim();
  const currency = (process.env.VNGZZ2_PAYMENT_CURRENCY || "USD").toUpperCase();
  const webhookSecret = process.env.VNGZZ2_PAYMENT_WEBHOOK_SECRET?.trim();

  if (!apiKey) {
    throw new VngZz2ConfigError(
      "VngZz2 payment gateway is not configured. Missing VNGZZ2_PRIMARY_API_KEY (or VNGZZ2_PAYMENT_API_KEY) environment variable."
    );
  }

  return { baseUrl, apiKey, slot, currency, webhookSecret };
}

/**
 * Format payment amount canonically for VngZz2 API (e.g. "1.50").
 * Accepts numbers or strings, validates > 0 and max 2 decimal places.
 */
export function formatVngZzAmount(amount: number | string): string {
  if (typeof amount === "string") {
    const trimmed = amount.trim();
    if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      throw new Error(`Invalid payment amount: "${amount}". Must be a positive finite number.`);
    }
  }
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid payment amount: "${amount}". Must be a positive finite number.`);
  }
  return numeric.toFixed(2);
}

/**
 * Redacted audit logger preventing sensitive credentials, API keys, or full card data from leaking.
 */
function logRedacted(level: "log" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  const sanitizedMeta: Record<string, unknown> = {};
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      const lower = k.toLowerCase();
      if (lower.includes("key") || lower.includes("secret") || lower.includes("token") || lower.includes("auth")) {
        sanitizedMeta[k] = "[REDACTED]";
      } else {
        sanitizedMeta[k] = v;
      }
    }
  }

  if (level === "error") {
    console.error(`[VngZz2 PayWay] ${message}`, sanitizedMeta);
  } else if (level === "warn") {
    console.warn(`[VngZz2 PayWay] ${message}`, sanitizedMeta);
  } else {
    console.log(`[VngZz2 PayWay] ${message}`, sanitizedMeta);
  }
}

/**
 * Generate a realistic ABA PayWay KHQR simulation for testing/sandbox environments.
 * Used when VNGZZ2_PAYMENT_API_KEY is not configured or in development mode.
 */
export function generateVngZz2SandboxQr(params: GenerateQrParams): GenerateQrResult {
  const canonicalAmount = formatVngZzAmount(params.amount);
  const currency = params.currency || "USD";
  const transactionId = `TXN-SANDBOX-VNGZZ2-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

  const qrString = `00020101021229300016com.ababank.payway0108${params.orderNumber}54${canonicalAmount}538405802KH5907SAKSUUU6010PHNOM PENH6304DEMO`;

  let svg = "";
  QRCode.toString(qrString, { type: "svg", margin: 1, errorCorrectionLevel: "H" }, (_err, str) => {
    svg = str || "";
  });

  const qrImage = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return {
    success: true,
    transactionId,
    amount: parseFloat(canonicalAmount),
    currency,
    state: "PENDING",
    qrString: `00020101021229300016com.ababank.payway0108${params.orderNumber}54${canonicalAmount}538405802KH5907SAKSUUU6010PHNOM PENH6304DEMO`,
    qrImage,
    deepLink: `abamobilebank://ababank.com?type=payway&qrcode=DEMO_${transactionId}`,
    expireInSec: 180,
    expiresAt: new Date(Date.now() + 180 * 1000).toISOString(),
  };
}

/**
 * 1. Generate ABA PayWay KHQR via VngZz2 API
 * POST /v1/generate_qr
 */
export async function generateVngZz2Qr(params: GenerateQrParams): Promise<GenerateQrResult> {
  const config = getVngZz2Config();
  const canonicalAmount = formatVngZzAmount(params.amount);
  const currency = params.currency || config.currency || "USD";
  const slot = params.slot || config.slot;
  const timeoutMs = params.timeoutMs || 10000;

  const idempotencyKey =
    params.idempotencyKey ||
    `ord:${String(params.orderNumber).trim()}-${Math.round(parseFloat(canonicalAmount) * 100)}`;

  const payload: Record<string, unknown> = {
    amount: canonicalAmount,
    currency,
    idempotency_key: idempotencyKey,
    metadata: {
      orderNumber: params.orderNumber,
      platform: "SakSuuu TopUp",
      ...(params.metadata || {}),
    },
  };

  if (slot) {
    payload.slot = slot;
  }

  const endpoint = `${config.baseUrl}/v1/generate_qr`;
  logRedacted("log", `Generating ABA PayWay QR for order ${params.orderNumber} ($${canonicalAmount} ${currency})`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": config.apiKey,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const isTimeout = Boolean(
      err && typeof err === "object" && "name" in err && (err.name === "TimeoutError" || err.name === "AbortError")
    );
    if (isTimeout) {
      throw new VngZz2TimeoutError(`Connection to VngZz2 timed out after ${timeoutMs}ms`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new VngZz2ApiError(`Failed to connect to VngZz2 API: ${message}`, 502);
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new VngZz2ApiError(
      `VngZz2 returned non-JSON response with HTTP ${response.status}`,
      response.status
    );
  }

  if (!response.ok || body.success === false) {
    const errorMsg =
      (body.message as string) || (body.error as string) || `VngZz2 rejected request with HTTP ${response.status}`;
    const code = (body.code as string) || "PAYWAY_ERROR";
    logRedacted("error", `Payment creation failed: ${errorMsg}`, { status: response.status, code });
    throw new VngZz2ApiError(errorMsg, response.status, code, body);
  }

  const data = ((body.data && typeof body.data === "object" ? body.data : body) || {}) as Record<string, unknown>;
  const transactionId = String(data.transaction_id || "").trim();
  if (!transactionId) {
    throw new VngZz2ApiError("VngZz2 response did not include a valid transaction_id", 502, "MALFORMED_RESPONSE", body);
  }

  return {
    success: true,
    transactionId,
    amount: parseFloat(String(data.amount || canonicalAmount)),
    currency: String(data.currency || currency).toUpperCase(),
    state: (String(data.state || "PENDING").toUpperCase() as GenerateQrResult["state"]),
    qrString: data.qr_string ? String(data.qr_string) : undefined,
    qrImage: data.qr_image ? String(data.qr_image) : undefined,
    qrPngUrl: data.qr_png_url ? String(data.qr_png_url) : undefined,
    payUrl: data.pay_url ? String(data.pay_url) : undefined,
    deepLink: data.deep_link ? String(data.deep_link) : undefined,
    expireInSec: typeof data.expire_in_sec === "number" ? data.expire_in_sec : 180,
    expiresAt: data.expires_at ? String(data.expires_at) : undefined,
  };
}

/**
 * 2. Check payment status for a transaction
 * POST /v1/check_transaction
 */
export async function checkVngZz2Transaction(
  transactionId: string,
  options?: { timeoutMs?: number }
): Promise<CheckTransactionResult> {
  const cleanTxnId = String(transactionId || "").trim();
  if (!cleanTxnId) {
    throw new Error("Missing transactionId for transaction inquiry");
  }

  // Handle sandbox / simulation transactions cleanly without requiring an external API key
  if (cleanTxnId.startsWith("TXN-SANDBOX-") || cleanTxnId.startsWith("SANDBOX-")) {
    return {
      success: true,
      transactionId: cleanTxnId,
      state: "PENDING",
      isPaid: false,
      amount: 0,
      currency: "USD",
      action: "approved",
      code: "00",
      paywayTransactionId: `ABA-SANDBOX-${cleanTxnId.slice(-6)}`,
      receiptUrl: "https://pwapp.ababank.com/download-receipt?id=sandbox",
      checkedAt: new Date().toISOString(),
      message: "Sandbox payments are not accepted as verified customer payments.",
    };
  }

  if (!isVngZz2Configured()) throw new VngZz2ConfigError("VngZz2 payment verification is not configured.");

  const config = getVngZz2Config();

  const endpoint = `${config.baseUrl}/v1/check_transaction`;
  const timeoutMs = options?.timeoutMs || 8000;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ transaction_id: cleanTxnId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const isTimeout = Boolean(
      err && typeof err === "object" && "name" in err && (err.name === "TimeoutError" || err.name === "AbortError")
    );
    if (isTimeout) {
      throw new VngZz2TimeoutError(`Transaction check timed out after ${timeoutMs}ms`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new VngZz2ApiError(`Failed to connect to VngZz2 check API: ${message}`, 502);
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new VngZz2ApiError(`Transaction check returned non-JSON HTTP ${response.status}`, response.status);
  }

  if (!response.ok || body.success === false) {
    const errorMsg = (body.message as string) || "Failed to check transaction";
    const code = (body.code as string) || "CHECK_ERROR";
    // A failed status inquiry is not evidence that the payment failed.
    throw new VngZz2ApiError(errorMsg, response.status, code);
  }

  const data = ((body.data && typeof body.data === "object" ? body.data : body) || {}) as Record<string, unknown>;
  const rawState = String(data.state || "PENDING").toUpperCase();
  const state: CheckTransactionResult["state"] =
    rawState === "PAID" ? "PAID" : rawState === "FAILED" ? "FAILED" : rawState === "EXPIRED" ? "EXPIRED" : "PENDING";

  // The documented transaction state is authoritative. Transport result codes,
  // truthy strings and API acceptance never establish settlement.
  const isPaid = rawState === "PAID" && (data.is_paid === undefined || data.is_paid === true);
  if (["PAID", "FAILED", "EXPIRED"].includes(rawState) && (typeof data.transaction_id !== "string" || data.transaction_id !== cleanTxnId)) {
    throw new VngZz2ApiError("Payment status response has a mismatched transaction reference.", 502, "INVALID_RESPONSE");
  }

  return {
    success: true,
    transactionId: String(data.transaction_id || cleanTxnId),
    state: rawState === "PAID" && !isPaid ? "PENDING" : state,
    isPaid,
    amount: typeof data.amount === "number" ? data.amount : parseFloat(String(data.amount || 0)),
    currency: String(data.currency || "").toUpperCase(),
    action: data.action ? String(data.action) : undefined,
    code: data.code ? String(data.code) : undefined,
    paywayTransactionId: data.payway_transaction_id ? String(data.payway_transaction_id) : undefined,
    receiptUrl: data.receipt_url ? String(data.receipt_url) : undefined,
    checkedAt: data.checked_at ? String(data.checked_at) : new Date().toISOString(),
    message: body.message ? String(body.message) : undefined,
  };
}

/**
 * 3. Health & Liveness check
 * GET /v1/status or GET /v1/ping
 */
export async function checkVngZz2Health(timeoutMs = 5000): Promise<VngZz2HealthResult> {
  if (!isVngZz2Configured()) {
    return {
      available: true,
      state: "SANDBOX_OPERATIONAL",
      latencyMs: 1,
      service: "vngzz2-sandbox-gateway",
      version: "2.0.0-sandbox",
      capabilities: ["khqr", "sandbox_simulation"],
      message: "Operating in Sandbox mode. Set VNGZZ2_PRIMARY_API_KEY in .env.local to activate Live gateway.",
    };
  }

  const rawBase = (process.env.VNGZZ2_PAYMENT_BASE_URL || "https://www.vngzz2game.site/api").trim();
  const baseUrl = rawBase.replace(/\/+$/, "").replace(/\/v1$/, "");

  const startTime = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - startTime;
    if (!res.ok) {
      return {
        available: false,
        latencyMs,
        message: `HTTP ${res.status} from VngZz2 status probe`,
      };
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const data = (json.data || {}) as Record<string, unknown>;

    return {
      available: true,
      latencyMs,
      state: String(data.state || "OPERATIONAL"),
      service: String(data.service || "vngzz2game-api"),
      version: String(data.version || "1.0.0"),
      capabilities: Array.isArray(data.capabilities) ? (data.capabilities as string[]) : ["khqr", "pay_links"],
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      latencyMs,
      message: `Connection failed: ${msg}`,
    };
  }
}

/**
 * 4. Verify Webhook Signature (when secret is configured)
 * Supports HMAC-SHA256 signature verification with timing-safe comparison.
 */
export function verifyVngZz2WebhookSignature(params: {
  rawBody: string;
  signature?: string;
  secret?: string;
}): boolean {
  const secret = params.secret || process.env.VNGZZ2_PAYMENT_WEBHOOK_SECRET?.trim();
  const signature = params.signature?.trim();

  // A missing webhook secret must fail closed; provider callbacks are not trusted without it.
  if (!secret) return false;

  if (!signature) {
    return false;
  }

  try {
    const computed = crypto.createHmac("sha256", secret).update(params.rawBody, "utf8").digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const compBuf = Buffer.from(computed, "hex");

    if (sigBuf.length !== compBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch {
    return false;
  }
}
