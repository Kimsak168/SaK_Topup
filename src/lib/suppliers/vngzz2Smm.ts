import "server-only";
import { getVngzzGameConfig, VngzzGameError } from "./vngzz2";

export interface VngzzSmmDepositRequest {
  amount: string | number;
  currency?: "USD" | "KHR";
}

export interface VngzzSmmDepositResult {
  success: boolean;
  status: number;
  message: string;
  data: {
    transaction_id: string;
    target_wallet: string;
    amount: string;
    service_fee: number;
    total_amount: number;
    currency: "USD" | "KHR";
    state: "PENDING" | "COMPLETED" | "CANCELLED" | "EXPIRED" | string;
    qr_string: string;
    qr_image: string;
    qr_image_url?: string;
    pay_url?: string;
    abamobile_deeplink?: string;
    expire_in_sec: number;
    current_smm_balance?: number;
  };
}

export interface VngzzTransactionCheckResult {
  success: boolean;
  status: number;
  message?: string;
  data: {
    transaction_id: string;
    amount: string;
    currency: string;
    state: "PENDING" | "COMPLETED" | "CANCELLED" | "EXPIRED" | string;
    is_paid: boolean;
    created_at?: string;
    expires_at?: string;
    payway_transaction_id?: string | null;
    pay_url?: string;
    metadata?: Record<string, unknown>;
    checked_at?: string;
  };
  provider_verified?: boolean;
}

export interface VngzzSmmProfileResult {
  status: string;
  user: {
    id: string;
    username: string;
    balance: number;
    smm_balance: number;
    game_balance: number;
    currency: string;
    status: string;
    role: string;
    total_orders: number;
    total_spent: number;
  };
  gateway?: {
    provider: string;
    service: string;
    master_status: string;
  };
}

/**
 * Top up SMM wallet balance via instant ABA KHQR (0% fee).
 * Calls VNGZZ2 official POST /v1/smm/deposit endpoint.
 */
export async function createVngzzSmmDeposit(params: VngzzSmmDepositRequest): Promise<VngzzSmmDepositResult> {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();

  const rawAmount = typeof params.amount === "number" ? params.amount.toFixed(2) : String(params.amount || "").trim();
  const numericAmount = parseFloat(rawAmount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new VngzzGameError("A valid deposit amount greater than 0 is required.", 400, "INVALID_AMOUNT");
  }

  const formattedAmount = numericAmount.toFixed(2);
  const currency = params.currency === "KHR" ? "KHR" : "USD";

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/smm/deposit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        amount: formattedAmount,
        currency,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new VngzzGameError("VNGZZ2 SMM deposit service is temporarily unreachable.", 504, "UNREACHABLE");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success === false) {
    const message = typeof payload?.message === "string" ? payload.message.slice(0, 300) : "Failed to create SMM deposit KHQR.";
    throw new VngzzGameError(`VNGZZ2: ${message}`, response.status || 502, payload?.code || "DEPOSIT_FAILED");
  }

  return payload as VngzzSmmDepositResult;
}

/**
 * Check the status of a payment or deposit transaction on VNGZZ2.
 * Calls POST /v1/check_transaction.
 */
export async function checkVngzzTransaction(transactionId: string): Promise<VngzzTransactionCheckResult> {
  const cleanId = transactionId.trim();
  if (!cleanId) {
    throw new VngzzGameError("Transaction ID is required.", 400, "MISSING_TRANSACTION_ID");
  }

  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/check_transaction`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ transaction_id: cleanId }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new VngzzGameError("VNGZZ2 transaction verification is temporarily unreachable.", 504, "UNREACHABLE");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const message = typeof payload?.message === "string" ? payload.message.slice(0, 300) : "Failed to verify transaction.";
    throw new VngzzGameError(`VNGZZ2: ${message}`, response.status || 502, payload?.code || "CHECK_FAILED");
  }

  return payload as VngzzTransactionCheckResult;
}

/**
 * Retrieve the reseller SMM profile and isolated wallet balances from VNGZZ2.
 * Calls GET /v1/smm/profile.
 */
export async function getVngzzSmmProfile(): Promise<VngzzSmmProfileResult> {
  const { baseUrl, apiKey, timeoutMs } = getVngzzGameConfig();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/smm/profile`, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new VngzzGameError("VNGZZ2 SMM profile is temporarily unreachable.", 504, "UNREACHABLE");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.status !== "SUCCESS") {
    const message = typeof payload?.message === "string" ? payload.message.slice(0, 300) : "Failed to retrieve SMM profile.";
    throw new VngzzGameError(`VNGZZ2: ${message}`, response.status || 502, "PROFILE_FAILED");
  }

  return payload as VngzzSmmProfileResult;
}

