import "server-only";
import QRCode from "qrcode";

import {
  formatTelegramNotificationMessage,
  type TelegramNotificationEvent,
  type TelegramNotificationStatus,
} from "@/lib/notifications/telegramFormat";

const REQUEST_TIMEOUT_MS = 6000;

type TelegramSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; retryable: boolean; error: string; retryAfterSeconds?: number };

function cleanError(value: unknown, token?: string): string {
  const message = typeof value === "string" ? value : "Telegram request failed.";
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").split(token || "\u0000").join("[redacted]").slice(0, 500);
}

export function getTelegramTopicThreadId(
  status: TelegramNotificationStatus,
  env: NodeJS.ProcessEnv = process.env
): number | undefined {
  let val: string | undefined;
  if (status === "PENDING") {
    val = env.TELEGRAM_TOPIC_PENDING;
  } else if (status === "SUCCESS") {
    val = env.TELEGRAM_TOPIC_SUCCESS;
  } else if (status === "FAILED" || status === "EXPIRED") {
    val = env.TELEGRAM_TOPIC_FAILED;
  }
  if (!val || !val.trim()) return undefined;
  const num = parseInt(val.trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
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

  const topicId = getTelegramTopicThreadId(event.status, env);
  const formattedText = formatTelegramNotificationMessage(event);

  // 1. If this is a PAYMENT PENDING event with QR data, attempt to send real QR photo via sendPhoto
  if (event.kind === "PAYMENT" && event.status === "PENDING") {
    const { qrString, qrImage, qrPngUrl } = event.payload;
    let photoBuffer: Buffer | null = null;
    let photoUrl: string | null = null;

    if (qrString) {
      try {
        photoBuffer = await QRCode.toBuffer(qrString, {
          type: "png",
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
        });
      } catch (err) {
        console.warn("[Telegram] QR PNG generation error:", err);
      }
    } else if (qrImage && typeof qrImage === "string") {
      try {
        const base64Data = qrImage.replace(/^data:image\/\w+;base64,/, "");
        photoBuffer = Buffer.from(base64Data, "base64");
      } catch (err) {
        console.warn("[Telegram] QR base64 buffer error:", err);
      }
    } else if (qrPngUrl && /^https?:\/\//i.test(qrPngUrl)) {
      photoUrl = qrPngUrl;
    }

    if (photoBuffer || photoUrl) {
      try {
        const formData = new FormData();
        formData.append("chat_id", chatId);
        if (typeof topicId === "number") {
          formData.append("message_thread_id", String(topicId));
        }
        formData.append("caption", formattedText.slice(0, 1024));
        formData.append("parse_mode", "HTML");
        if (photoBuffer) {
          const blob = new Blob([new Uint8Array(photoBuffer)], { type: "image/png" });
          formData.append("photo", blob, `khqr-${event.payload.orderNumber || "payment"}.png`);
        } else if (photoUrl) {
          formData.append("photo", photoUrl);
        }

        let photoResp = await fetcher(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          body: formData,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        let photoBody = (await photoResp.json().catch(() => null)) as Record<string, unknown> | null;

        // Fallback: If thread not found, retry sendPhoto without topic thread ID
        if (
          !photoResp.ok &&
          typeof topicId === "number" &&
          typeof photoBody?.description === "string" &&
          photoBody.description.toLowerCase().includes("thread not found")
        ) {
          const fallbackForm = new FormData();
          fallbackForm.append("chat_id", chatId);
          fallbackForm.append("caption", formattedText.slice(0, 1024));
          fallbackForm.append("parse_mode", "HTML");
          if (photoBuffer) {
            const blob = new Blob([new Uint8Array(photoBuffer)], { type: "image/png" });
            fallbackForm.append("photo", blob, `khqr-${event.payload.orderNumber || "payment"}.png`);
          } else if (photoUrl) {
            fallbackForm.append("photo", photoUrl);
          }
          photoResp = await fetcher(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: "POST",
            body: fallbackForm,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          photoBody = (await photoResp.json().catch(() => null)) as Record<string, unknown> | null;
        }

        if (photoResp.ok && photoBody?.ok === true) {
          const result = photoBody.result && typeof photoBody.result === "object" ? (photoBody.result as Record<string, unknown>) : {};
          return { ok: true, ...(result.message_id ? { messageId: String(result.message_id) } : {}) };
        }

        // If Telegram rejected sendPhoto with fatal error (403 forbidden), return immediately
        if (photoResp.status === 403 || photoBody?.error_code === 403) {
          const desc = cleanError(photoBody?.description, token);
          return { ok: false, retryable: false, error: desc || "Telegram rejected the message (HTTP 403)." };
        }

        console.warn(`[Telegram] sendPhoto returned HTTP ${photoResp.status}, falling back to sendMessage`);
      } catch (err) {
        console.warn("[Telegram] sendPhoto error, falling back to sendMessage:", err);
      }
    }
  }

  // 2. Standard text message fallback via sendMessage
  const payloadJson: Record<string, unknown> = {
    chat_id: chatId,
    text: formattedText,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };
  if (typeof topicId === "number") {
    payloadJson.message_thread_id = topicId;
  }

  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payloadJson),
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

  let body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  // Graceful fallback: If topic thread was deleted/not found, retry without thread_id
  if (
    !response.ok &&
    typeof topicId === "number" &&
    typeof body?.description === "string" &&
    body.description.toLowerCase().includes("thread not found")
  ) {
    delete payloadJson.message_thread_id;
    try {
      response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payloadJson),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      // Ignore fallback failure, handled below
    }
  }

  if (response.ok && body?.ok === true) {
    const result = body.result && typeof body.result === "object" ? (body.result as Record<string, unknown>) : {};
    return { ok: true, ...(result.message_id ? { messageId: String(result.message_id) } : {}) };
  }

  const apiCode = typeof body?.error_code === "number" ? body.error_code : response.status;
  if (!body || typeof body.ok !== "boolean") return { ok: false, retryable: true, error: "Telegram returned an invalid response." };
  const description = cleanError(body?.description, token);
  if (apiCode === 429 || response.status === 429) {
    const parameters =
      body?.parameters && typeof body.parameters === "object"
        ? (body.parameters as Record<string, unknown>)
        : {};
    const retryAfter =
      typeof parameters.retry_after === "number" && Number.isFinite(parameters.retry_after)
        ? Math.max(1, Math.min(86400, Math.ceil(parameters.retry_after)))
        : undefined;
    return { ok: false, retryable: true, error: description || "Telegram rate limit reached.", ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}) };
  }
  if (response.status >= 500 || apiCode >= 500) {
    return { ok: false, retryable: true, error: description || `Telegram returned HTTP ${response.status}.` };
  }
  return { ok: false, retryable: false, error: description || `Telegram rejected the message (HTTP ${response.status}).` };
}

export function maskTelegramChatId(chatId?: string): string {
  if (!chatId || !chatId.trim()) return "Not configured";
  const str = chatId.trim();
  if (str.length <= 5) return "***";
  if (str.startsWith("-100") && str.length > 8) {
    return `-100****${str.slice(-4)}`;
  }
  return `${str.slice(0, 3)}****${str.slice(-3)}`;
}

export interface TelegramTestResult {
  ok: boolean;
  error?: string;
  bot?: {
    id: number;
    username: string;
    firstName: string;
  };
  chat?: {
    id: string | number;
    title: string;
    type: string;
    isForum?: boolean;
  };
  topics?: {
    pending?: number;
    success?: number;
    failed?: number;
  };
  webhook?: {
    active: boolean;
    url?: string;
    pendingUpdateCount?: number;
  };
}

export async function testTelegramConnection(
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<TelegramTestResult> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is missing in environment variables." };
  }
  if (!chatId) {
    return { ok: false, error: "TELEGRAM_ADMIN_CHAT_ID is missing in environment variables." };
  }

  // 1. Check getMe (Validates bot token)
  let meRes: Response;
  try {
    meRes = await fetcher(`https://api.telegram.org/bot${token}/getMe`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: isTimeout ? "Connection timed out reaching Telegram API." : "Telegram API is unreachable." };
  }

  const meBody = await meRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!meRes.ok || meBody?.ok !== true) {
    const desc = cleanError(meBody?.description, token);
    return { ok: false, error: `Invalid bot token or Telegram API error: ${desc || `HTTP ${meRes.status}`}` };
  }

  const botResult = meBody.result as Record<string, unknown>;
  const botInfo = {
    id: Number(botResult.id),
    username: String(botResult.username || ""),
    firstName: String(botResult.first_name || ""),
  };

  // 2. Check getChat (Validates bot can access the admin chat)
  let chatInfo: { id: string | number; title: string; type: string; isForum?: boolean } | undefined;
  try {
    const chatRes = await fetcher(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const chatBody = await chatRes.json().catch(() => null) as Record<string, unknown> | null;
    if (chatRes.ok && chatBody?.ok === true) {
      const cr = chatBody.result as Record<string, unknown>;
      chatInfo = {
        id: (cr.id as string | number) || chatId,
        title: String(cr.title || cr.username || cr.first_name || "Admin Chat"),
        type: String(cr.type || "group"),
        isForum: Boolean(cr.is_forum),
      };
    } else {
      const desc = cleanError(chatBody?.description, token);
      return {
        ok: false,
        bot: botInfo,
        error: `Bot cannot access admin chat (${chatId}): ${desc || `HTTP ${chatRes.status}`}. Make sure the bot is added to the SakSuu group as a member or administrator.`,
      };
    }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      bot: botInfo,
      error: isTimeout ? "Timeout verifying group chat access." : "Failed to verify group chat access.",
    };
  }

  // 3. Check getWebhookInfo (Helpful diagnosis for polling/updates)
  let webhookInfo: { active: boolean; url?: string; pendingUpdateCount?: number } | undefined;
  try {
    const whRes = await fetcher(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const whBody = await whRes.json().catch(() => null) as Record<string, unknown> | null;
    if (whRes.ok && whBody?.ok === true) {
      const whResult = whBody.result as Record<string, unknown>;
      const hasUrl = Boolean(whResult.url && String(whResult.url).trim().length > 0);
      webhookInfo = {
        active: hasUrl,
        url: hasUrl ? "[Registered Webhook]" : undefined,
        pendingUpdateCount: Number(whResult.pending_update_count || 0),
      };
    }
  } catch {
    // Non-critical, continue
  }

  const topics = {
    pending: getTelegramTopicThreadId("PENDING", env),
    success: getTelegramTopicThreadId("SUCCESS", env),
    failed: getTelegramTopicThreadId("FAILED", env),
  };

  return {
    ok: true,
    bot: botInfo,
    chat: chatInfo,
    topics,
    webhook: webhookInfo,
  };
}

export async function sendTelegramTestMessage(
  topicThreadId?: number,
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<TelegramSendResult> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { ok: false, retryable: false, error: "Telegram bot credentials are not configured in environment variables." };
  }

  const nowStr = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date());

  const testLines = [
    `🟢 <b>SakSuu Telegram Bot Test</b>`,
    `🧾 <b>Order ID:</b> <code>ORD-TEST-000000</code>`,
    `👤 <b>Customer name:</b> Admin Tester`,
    `🎮 <b>Game:</b> SakSuu System`,
    `📦 <b>Package:</b> Connection Verification`,
    `💵 <b>Amount:</b> 0.00 USD`,
    `💳 <b>Payment method:</b> ABA PayWay V2`,
    `🏭 <b>Supplier:</b> WebBuilder`,
    `🕒 <b>Date and time:</b> ${nowStr} (Asia/Phnom_Penh)`,
  ];

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: testLines.join("\n"),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };

  if (typeof topicThreadId === "number" && topicThreadId > 0) {
    payload.message_thread_id = topicThreadId;
  }

  try {
    const res = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (res.ok && body?.ok === true) {
      const result = (body.result || {}) as Record<string, unknown>;
      return { ok: true, ...(result.message_id ? { messageId: String(result.message_id) } : {}) };
    }
    const description = cleanError(body?.description, token);
    return { ok: false, retryable: false, error: description || `Telegram rejected message (HTTP ${res.status}).` };
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, retryable: true, error: isTimeout ? "Test message timed out." : "Telegram is unreachable." };
  }
}

export { dispatchPendingTelegramNotifications, dispatchTelegramNotificationEvent } from "@/lib/services/telegramOutboxService";
