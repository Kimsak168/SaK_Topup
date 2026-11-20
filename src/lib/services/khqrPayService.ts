import crypto from "crypto";

if (typeof window !== "undefined") {
  throw new Error("This module can only be run on the server.");
}

/**
 * KHQR PAY Service (https://khqrpay.site)
 * Official integration for Cambodia ABA PayWay and Bakong KHQR payments via khqrpay.site API.
 */

export class KhqrPayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KhqrPayConfigError";
  }
}

export class KhqrPayApiError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, status = 500, code?: string, details?: unknown) {
    super(message);
    this.name = "KhqrPayApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get statusCode(): number {
    return this.status;
  }
}

export class KhqrPayTimeoutError extends KhqrPayApiError {
  constructor(message = "KHQR Pay request timed out") {
    super(message, 504, "TIMEOUT");
    this.name = "KhqrPayTimeoutError";
  }
}

export interface KhqrPayConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export interface GenerateKhqrQrParams {
  amount: number | string;
  currency?: "USD" | "KHR";
  orderNumber: string;
  webhookUrl?: string;
  timeoutMs?: number;
}

export interface GenerateKhqrQrResult {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
  state: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  qrString?: string;
  qrImage?: string; // SVG or PNG data URL
  qrPngUrl?: string;
  payUrl?: string; // Hosted checkout card (/pay/{id})
  deepLink?: string; // ABA mobile deep link
  expireInSec: number;
  expiresAt?: string;
}

export interface CheckKhqrTransactionResult {
  success: boolean;
  transactionId: string;
  state: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  isPaid: boolean;
  amount: number;
  currency: string;
  checkoutUrl?: string;
  merchantName?: string;
  checkedAt?: string;
  message?: string;
}

export interface KhqrPayHealthResult {
  available: boolean;
  latencyMs?: number;
  message?: string;
}

const PRODUCTION_KHQRPAY_API_KEY = "sk_39862b27213d1e204ef79f0430a37faab4282e98861ec2f6";

function resolveKhqrPayKey(env: NodeJS.ProcessEnv): string {
  const configured = env.KHQRPAY_API_KEY?.trim();
  if (configured) return configured;
  // On production / Vercel, fallback to the store's confirmed API key so checkout never fails
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return PRODUCTION_KHQRPAY_API_KEY;
  }
  return "";
}

export function isKhqrPayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = resolveKhqrPayKey(env);
  return Boolean(key && key.startsWith("sk_"));
}

export function getKhqrPayConfig(env: NodeJS.ProcessEnv = process.env): KhqrPayConfig {
  const apiKey = resolveKhqrPayKey(env);
  if (!apiKey) {
    throw new KhqrPayConfigError("KHQRPAY_API_KEY is not configured.");
  }
  const baseUrl = (env.KHQRPAY_BASE_URL || "https://khqrpay.site").trim().replace(/\/+$/, "");
  const webhookSecret = env.KHQRPAY_WEBHOOK_SECRET?.trim() || undefined;

  return { baseUrl, apiKey, webhookSecret };
}

export function formatKhqrAmount(amount: number | string): number {
  const val = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (isNaN(val) || val <= 0) {
    throw new KhqrPayConfigError(`Invalid amount for KHQR payment: ${amount}`);
  }
  return Math.round(val * 100) / 100;
}

/**
 * Generate an ABA PayWay KHQR payment via khqrpay.site POST /api/v1/aba/create
 */
export async function generateKhqrPayQr(
  params: GenerateKhqrQrParams,
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<GenerateKhqrQrResult> {
  const config = getKhqrPayConfig(env);
  const cleanAmount = formatKhqrAmount(params.amount);
  const timeoutMs = params.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, unknown> = {
    amount: cleanAmount,
  };

  if (params.webhookUrl && params.webhookUrl.startsWith("https://")) {
    requestBody.webhook = params.webhookUrl;
  }

  try {
    const url = `${config.baseUrl}/api/v1/aba/create`;
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !data || data.ok !== true) {
      const errorMessage =
        typeof data?.msg === "string"
          ? data.msg
          : typeof data?.error_text === "string"
            ? data.error_text
            : `KHQR PAY failed with HTTP ${response.status}`;
      const code = typeof data?.error === "string" ? data.error : "PAYMENT_CREATION_FAILED";

      throw new KhqrPayApiError(errorMessage, response.status, code, data);
    }

    const transactionId = String(data.id || data.aba_tran_id || `KHQR-${Date.now()}`);
    const qrString = typeof data.qr === "string" ? data.qr : undefined;
    const qrImage = typeof data.qr_image === "string" ? data.qr_image : undefined;
    const payUrl = typeof data.checkout_url === "string" ? data.checkout_url : undefined;
    const deepLink =
      typeof data.aba_deeplink === "string"
        ? data.aba_deeplink
        : typeof data.aba_deeplink_android === "string"
          ? data.aba_deeplink_android
          : undefined;

    const ttlMs = typeof data.ttl_ms === "number" ? data.ttl_ms : 600000;
    const expireInSec = Math.max(60, Math.floor(ttlMs / 1000));

    return {
      success: true,
      transactionId,
      amount: cleanAmount,
      currency: "USD",
      state: "PENDING",
      qrString,
      qrImage,
      qrPngUrl: payUrl ? `${payUrl}.png` : undefined,
      payUrl,
      deepLink,
      expireInSec,
      expiresAt: typeof data.expires_at === "string" ? data.expires_at : undefined,
    };
  } catch (err: unknown) {
    if (err instanceof KhqrPayApiError || err instanceof KhqrPayConfigError) {
      throw err;
    }
    const isTimeout =
      (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) ||
      controller.signal.aborted;
    if (isTimeout) {
      throw new KhqrPayTimeoutError(`KHQR PAY ABA creation timed out after ${timeoutMs}ms`);
    }
    throw new KhqrPayApiError(
      `Network error connecting to KHQR PAY: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check payment status on khqrpay.site GET /api/v1/payment?id={id}
 */
export async function checkKhqrPayTransaction(
  transactionId: string | number,
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<CheckKhqrTransactionResult> {
  const config = getKhqrPayConfig(env);
  const cleanId = String(transactionId).trim();
  if (!cleanId) {
    throw new KhqrPayApiError("Transaction ID is required to check payment status.", 400, "MISSING_ID");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${config.baseUrl}/api/v1/payment?id=${encodeURIComponent(cleanId)}`;
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !data || data.ok !== true) {
      const errorMessage =
        typeof data?.msg === "string"
          ? data.msg
          : typeof data?.error_text === "string"
            ? data.error_text
            : `KHQR PAY status check failed with HTTP ${response.status}`;
      return {
        success: false,
        transactionId: cleanId,
        state: "FAILED",
        isPaid: false,
        amount: 0,
        currency: "USD",
        message: errorMessage,
      };
    }

    const payment = (data.payment || data) as Record<string, unknown>;
    const rawStatus = String(payment.status || "Pending").trim().toLowerCase();

    let state: "PENDING" | "PAID" | "FAILED" | "EXPIRED" = "PENDING";
    let isPaid = false;

    if (rawStatus === "paid" || rawStatus === "success" || rawStatus === "completed") {
      state = "PAID";
      isPaid = true;
    } else if (rawStatus === "expired") {
      state = "EXPIRED";
    } else if (rawStatus === "failed") {
      state = "FAILED";
    }

    return {
      success: true,
      transactionId: cleanId,
      state,
      isPaid,
      amount: typeof payment.amount === "number" ? payment.amount : 0,
      currency: typeof payment.currency === "string" ? payment.currency : "USD",
      checkoutUrl: typeof payment.checkout_url === "string" ? payment.checkout_url : undefined,
      merchantName: typeof payment.merchant_name === "string" ? payment.merchant_name : undefined,
      checkedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) ||
      controller.signal.aborted;
    if (isTimeout) {
      throw new KhqrPayTimeoutError(`KHQR PAY status check timed out for ID ${cleanId}`);
    }
    throw new KhqrPayApiError(
      `Network error checking KHQR PAY status: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify incoming webhook signature from khqrpay.site
 * Header format: X-Webhook-Signature: sha256={hex}
 */
export function verifyKhqrPayWebhookSignature(params: {
  rawBody: string;
  signature?: string | null;
  secret?: string;
}): boolean {
  const secret = params.secret || process.env.KHQRPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // If no secret is configured, accept the webhook

  const header = String(params.signature || "").trim();
  if (!header.startsWith("sha256=")) return false;

  const expectedHash = header.slice(7);
  const calculatedHash = crypto.createHmac("sha256", secret).update(params.rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, "hex"),
      Buffer.from(calculatedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Health check for KHQR PAY service
 */
export async function checkKhqrPayHealth(
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<KhqrPayHealthResult> {
  const baseUrl = (env.KHQRPAY_BASE_URL || "https://khqrpay.site").trim().replace(/\/+$/, "");
  const started = Date.now();

  try {
    const res = await fetcher(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - started;
    return {
      available: res.ok,
      latencyMs,
      message: res.ok ? "KHQR PAY is operational" : `KHQR PAY returned HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      available: false,
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : "KHQR PAY is unreachable",
    };
  }
}
