import "server-only";
import crypto from "crypto";

export class AnajakPayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnajakPayConfigError";
  }
}

export interface AnajakPayConfig {
  profileId: string;
  secretKey: string;
  appUrl: string;
}

/**
 * Check if AnajakPay environment credentials are configured.
 */
export function isAnajakPayConfigured(): boolean {
  return Boolean(
    process.env.ANAJAKPAY_PROFILE_ID?.trim() &&
    process.env.ANAJAKPAY_SECRET_KEY?.trim()
  );
}

/**
 * Validate and retrieve AnajakPay environment credentials safely.
 * Never prints or leaks secrets in logs or errors.
 */
export function getAnajakPayConfig(): AnajakPayConfig {
  const profileId = process.env.ANAJAKPAY_PROFILE_ID?.trim();
  const secretKey = process.env.ANAJAKPAY_SECRET_KEY?.trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");

  if (!profileId || !secretKey) {
    throw new AnajakPayConfigError(
      "AnajakPay payment gateway is currently unconfigured. Missing required credentials."
    );
  }

  return {
    profileId,
    secretKey,
    appUrl,
  };
}

/**
 * Format amount canonically for AnajakPay V2 (e.g. "1.50").
 * The exact same string representation MUST be used in both hash signing and the request.
 */
export function formatAnajakAmount(amount: number | string): string {
  if (typeof amount !== "number" && (typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount.trim()))) {
    throw new Error("Invalid payment amount");
  }
  const num = typeof amount === "number" ? amount : Number(amount.trim());
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Invalid payment amount");
  }
  return num.toFixed(2);
}

export interface CreateCheckoutParams {
  transactionId: string;
  amount: number;
  orderNumber: string;
  remark?: string;
  customSuccessUrl?: string;
  customCancelUrl?: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  transactionId: string;
  amount: string;
  hash: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Generate AnajakPay V2 checkout URL with SHA-1 signature.
 * Formula: SHA1(secret_key + transaction_id + amount + success_url + remark)
 */
export function generateAnajakPayV2Checkout(
  params: CreateCheckoutParams
): CheckoutResult {
  const { profileId, secretKey, appUrl } = getAnajakPayConfig();
  const canonicalAmount = formatAnajakAmount(params.amount);
  const transactionId = params.transactionId.trim();

  const successUrl =
    params.customSuccessUrl ||
    `${appUrl}/payment/success?orderNumber=${encodeURIComponent(
      params.orderNumber
    )}&txn=${encodeURIComponent(transactionId)}`;

  const cancelUrl =
    params.customCancelUrl ||
    `${appUrl}/payment/cancel?orderNumber=${encodeURIComponent(
      params.orderNumber
    )}&txn=${encodeURIComponent(transactionId)}`;

  const remark = (params.remark || `SakSuuu Order ${params.orderNumber}`).trim();

  // Signature calculation: SHA1(secret + transaction_id + amount + success_url + remark)
  const dataToSign = `${secretKey}${transactionId}${canonicalAmount}${successUrl}${remark}`;
  const hash = crypto.createHash("sha1").update(dataToSign).digest("hex");

  // Construct URL with Profile ID appended to path: https://anajakpay.com/api/payment/requestv2/{PROFILE_ID}
  const checkoutUrlObj = new URL(
    `https://anajakpay.com/api/payment/requestv2/${encodeURIComponent(profileId)}`
  );
  checkoutUrlObj.searchParams.set("transaction_id", transactionId);
  checkoutUrlObj.searchParams.set("amount", canonicalAmount);
  checkoutUrlObj.searchParams.set("success_url", successUrl);
  checkoutUrlObj.searchParams.set("remark", remark);
  checkoutUrlObj.searchParams.set("hash", hash);

  return {
    checkoutUrl: checkoutUrlObj.toString(),
    transactionId,
    amount: canonicalAmount,
    hash,
    successUrl,
    cancelUrl,
  };
}

export interface WebhookVerifyParams {
  reqTime: string;
  transactionId: string;
  amount: number | string;
  receivedHash: string;
}

/**
 * Verify AnajakPay V2 signed callback.
 * Formula: SHA256(secret_key + req_time + transaction_id + amount + "SUCCESS")
 * Uses timingSafeEqual comparison to protect against side-channel attacks.
 */
export function verifyAnajakPayWebhookSignature(
  params: WebhookVerifyParams
): boolean {
  try {
    const { secretKey } = getAnajakPayConfig();
    const { reqTime, transactionId, amount, receivedHash } = params;

    if (!reqTime || !transactionId || amount === undefined || !receivedHash) {
      return false;
    }

    const canonicalAmount = formatAnajakAmount(amount);

    // Documented formula: SHA256(secret_key + req_time + transaction_id + amount + "SUCCESS")
    const dataToSign = `${secretKey}${reqTime}${transactionId}${canonicalAmount}SUCCESS`;
    const expectedHash = crypto
      .createHash("sha256")
      .update(dataToSign)
      .digest("hex")
      .toLowerCase();

    const expectedBuffer = Buffer.from(expectedHash, "utf8");
    const receivedBuffer = Buffer.from(receivedHash.trim().toLowerCase(), "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

export interface AnajakPayVerifyV2Result {
  success: boolean;
  status: "PENDING" | "PAID" | "NOT_FOUND" | "FAILED" | "ERROR";
  responseCode: number;
  responseMessage?: string;
  amount?: number;
  transactionId?: string;
  raw?: unknown;
}

/**
 * Verify V2 — Check Transaction
 * Documented POST endpoint:
 * https://anajakpay.com/api/{PROFILE_ID}/payment-gateway/v1/payments/check-transv2-khqrcc
 * Content-Type: application/x-www-form-urlencoded
 * Body:
 *   transaction_id
 *   hash = SHA1(secret + transaction_id)
 *
 * Exclusively executed on the backend. Never exposes Secret Key or provider hash to the browser.
 */
export async function checkAnajakPayTransactionV2(
  transactionId: string
): Promise<AnajakPayVerifyV2Result> {
  const cleanTxnId = String(transactionId || "").trim();
  if (!cleanTxnId) {
    return {
      success: false,
      status: "ERROR",
      responseCode: 1,
      responseMessage: "Transaction ID is required",
    };
  }

  try {
    const { profileId, secretKey } = getAnajakPayConfig();

    // Documented verification hash: SHA1(secret + transaction_id)
    const dataToSign = `${secretKey}${cleanTxnId}`;
    const hash = crypto.createHash("sha1").update(dataToSign).digest("hex");

    const apiBaseUrl = (process.env.ANAJAKPAY_API_BASE_URL || "https://anajakpay.com").replace(/\/+$/, "");
    const endpoint = `${apiBaseUrl}/api/${encodeURIComponent(
      profileId
    )}/payment-gateway/v1/payments/check-transv2-khqrcc`;

    const bodyParams = new URLSearchParams();
    bodyParams.append("transaction_id", cleanTxnId);
    bodyParams.append("hash", hash);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!data || typeof data !== "object" || Array.isArray(data) || !res.ok) {
      return {
        success: false,
        status: res.status === 404 ? "NOT_FOUND" : "ERROR",
        responseCode: 1,
        responseMessage: `Provider response format error (HTTP ${res.status})`,
      };
    }

    const responseCode =
      typeof data.responseCode === "number"
        ? data.responseCode
        : typeof data.responseCode === "string" && /^\d+$/.test(data.responseCode.trim())
          ? Number(data.responseCode.trim()) : 1;
    const responseMsg = String(data.responseMessage || data.message || "");

    // responseCode 0: success or pending
    if (responseCode === 0) {
      const statusRaw = String(
        data.status ||
          (data.data as Record<string, unknown> | undefined)?.status ||
          data.payment_status ||
          ""
      ).toLowerCase();

      let amountReturned: number | undefined;
      const rawAmt =
        data.amount ??
        (data.data as Record<string, unknown> | undefined)?.amount;
      if (rawAmt !== undefined && rawAmt !== null) {
        if ((typeof rawAmt === "number" || (typeof rawAmt === "string" && /^\d+(?:\.\d+)?$/.test(rawAmt.trim()))) &&
          Number.isFinite(Number(rawAmt)) && Number(rawAmt) > 0) {
          amountReturned = Number(rawAmt);
        }
      }

      if (
        statusRaw === "success" ||
        statusRaw === "paid" ||
        statusRaw === "completed"
      ) {
        if (amountReturned === undefined) {
          return {
            success: false, status: "ERROR", responseCode: 1,
            responseMessage: "Payment verification did not provide a valid amount",
            transactionId: cleanTxnId, raw: data,
          };
        }
        return {
          success: true,
          status: "PAID",
          responseCode: 0,
          responseMessage: responseMsg || "Payment confirmed",
          amount: amountReturned,
          transactionId: cleanTxnId,
          raw: data,
        };
      }

      // responseCode 0 with status pending: keep payment PENDING
      return {
        success: true,
        status: "PENDING",
        responseCode: 0,
        responseMessage: responseMsg || "Payment pending",
        amount: amountReturned,
        transactionId: cleanTxnId,
        raw: data,
      };
    }

    // responseCode 1: provider error
    const isNotFound =
      res.status === 404 ||
      responseMsg.toLowerCase().includes("not found");

    if (isNotFound) {
      return {
        success: false,
        status: "NOT_FOUND",
        responseCode: 1,
        responseMessage: "Transaction not found on provider",
        transactionId: cleanTxnId,
        raw: data,
      };
    }

    const isInvalidHash = responseMsg.toLowerCase().includes("invalid security hash");
    if (isInvalidHash) {
      console.warn(`[AnajakPay Verify V2] Provider reported invalid security hash for txn: ${cleanTxnId}`);
      return {
        success: false,
        status: "ERROR",
        responseCode: 1,
        responseMessage: "Security hash verification failed",
        transactionId: cleanTxnId,
        raw: data,
      };
    }

    return {
      success: false,
      status: "ERROR",
      responseCode: 1,
      responseMessage: responseMsg || "Provider verification error",
      transactionId: cleanTxnId,
      raw: data,
    };
  } catch (error) {
    console.error("[AnajakPay Verify V2 Error]:", error);
    return {
      success: false,
      status: "ERROR",
      responseCode: 1,
      responseMessage: "Network error communicating with payment verification service",
      transactionId: cleanTxnId,
    };
  }
}

/**
 * Authenticated transaction verification check against AnajakPay.
 * Queries the documented Verify V2 check-transv2-khqrcc endpoint.
 */
export async function queryAnajakPayTransactionStatus(
  transactionId: string
): Promise<{ verified: boolean; status?: string; amount?: number; details?: unknown }> {
  const result = await checkAnajakPayTransactionV2(transactionId);
  return {
    verified: result.status === "PAID",
    status: result.status,
    amount: result.amount,
    details: result.raw,
  };
}

let cachedHealth: { available: boolean; message?: string; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Checks whether AnajakPay's KHQRcc checkout rail is operational.
 * Probes the V2 endpoint and caches the result for 30s to avoid excessive requests.
 */
export async function checkAnajakPayHealth(force = false): Promise<{ available: boolean; message?: string }> {
  if (!force && cachedHealth && Date.now() - cachedHealth.checkedAt < HEALTH_CACHE_TTL_MS) {
    return { available: cachedHealth.available, message: cachedHealth.message };
  }

  try {
    const { profileId, secretKey, appUrl } = getAnajakPayConfig();
    const testTxn = "TXN-HEALTH-PROBE";
    const amount = "1.00";
    const successUrl = `${appUrl}/payment/health`;
    const remark = "HealthProbe";
    const dataToSign = `${secretKey}${testTxn}${amount}${successUrl}${remark}`;
    const hash = crypto.createHash("sha1").update(dataToSign).digest("hex");

    const probeUrl = `https://anajakpay.com/api/payment/requestv2/${encodeURIComponent(profileId)}?transaction_id=${testTxn}&amount=${amount}&success_url=${encodeURIComponent(successUrl)}&remark=${encodeURIComponent(remark)}&hash=${hash}`;

    const res = await fetch(probeUrl, {
      method: "GET",
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 503) {
      const text = await res.text().catch(() => "");
      const isKhqrccDown = text.includes("KHQRcc Service Unavailable") || text.includes("Unavailable");
      const message = isKhqrccDown
        ? "AnajakPay KHQRcc rail is temporarily undergoing maintenance."
        : "AnajakPay gateway service is temporarily unavailable (503).";
      cachedHealth = { available: false, message, checkedAt: Date.now() };
      return { available: false, message };
    }

    if (!res.ok && res.status >= 500) {
      const message = `AnajakPay server error (${res.status}).`;
      cachedHealth = { available: false, message, checkedAt: Date.now() };
      return { available: false, message };
    }

    cachedHealth = { available: true, checkedAt: Date.now() };
    return { available: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection timeout";
    cachedHealth = { available: false, message: `AnajakPay network error: ${message}`, checkedAt: Date.now() };
    return { available: false, message };
  }
}

