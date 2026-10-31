import "server-only";


import {
  formatTelegramNotificationMessage,
  type TelegramNotificationEvent,
} from "@/lib/notifications/telegramFormat";

const REQUEST_TIMEOUT_MS = 6000;

type TelegramSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; retryable: boolean; error: string; retryAfterSeconds?: number };

function cleanError(value: unknown, token?: string): string {
  const message = typeof value === "string" ? value : "Telegram request failed.";
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").split(token || "\u0000").join("[redacted]").slice(0, 500);
}

export async function sendTelegramNotification(
  event: Pick<TelegramNotificationEvent, "kind" | "status" | "payload">,
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TelegramSendResult> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { ok: false, retryable: true, error: "Telegram bot credentials are not configured." };
  }

  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramNotificationMessage(event),
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      retryable: true,
      error: isTimeout ? "Telegram request timed out." : "Telegram is temporarily unreachable.",
    };
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok && body?.ok === true) {
    const result = body.result && typeof body.result === "object" ? body.result as Record<string, unknown> : {};
    return { ok: true, ...(result.message_id ? { messageId: String(result.message_id) } : {}) };
  }

  const apiCode = typeof body?.error_code === "number" ? body.error_code : response.status;
  if (!body || typeof body.ok !== "boolean") return { ok: false, retryable: true, error: "Telegram returned an invalid response." };
  const description = cleanError(body?.description, token);
  if (apiCode === 429 || response.status === 429) {
    const parameters = body?.parameters && typeof body.parameters === "object"
      ? body.parameters as Record<string, unknown>
      : {};
    const retryAfter = typeof parameters.retry_after === "number" && Number.isFinite(parameters.retry_after)
      ? Math.max(1, Math.min(86400, Math.ceil(parameters.retry_after)))
      : undefined;
    return { ok: false, retryable: true, error: description || "Telegram rate limit reached.", ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}) };
  }
  if (response.status >= 500 || apiCode >= 500) {
    return { ok: false, retryable: true, error: description || `Telegram returned HTTP ${response.status}.` };
  }
  return { ok: false, retryable: false, error: description || `Telegram rejected the message (HTTP ${response.status}).` };
}

export { dispatchPendingTelegramNotifications, dispatchTelegramNotificationEvent } from "@/lib/services/telegramOutboxService";
