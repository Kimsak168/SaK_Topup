import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { escapeTelegramHtml } from "@/lib/notifications/telegramFormat";

export const dynamic = "force-dynamic";

const STORE_URL = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")
  ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")
  : "https://www.asuratopup.store";

const SUPPORT_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT || "https://t.me/Asuratopupstore";
const CHANNEL_URL = "https://t.me/asura_botstore";

interface TelegramInlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
}

async function sendBotReply(
  chatId: number | string,
  text: string,
  inlineKeyboard?: TelegramInlineButton[][]
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (inlineKeyboard && inlineKeyboard.length > 0) {
    payload.reply_markup = {
      inline_keyboard: inlineKeyboard,
    };
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[Telegram Bot Webhook] Failed to send reply:", err);
  }
}

function getMainStoreKeyboard(): TelegramInlineButton[][] {
  return [
    [
      {
        text: "🛍️ បើកហាងទិញពេជ្រ (Open Store)",
        web_app: { url: STORE_URL },
      },
    ],
    [
      {
        text: "🚀 សេវាកម្មបណ្តាញសង្គម (SMM Services)",
        web_app: { url: `${STORE_URL}/services` },
      },
    ],
    [
      {
        text: "📢 ឆានែលព័ត៌មាន (Channel)",
        url: CHANNEL_URL,
      },
      {
        text: "💬 ទាក់ទង Admin",
        url: SUPPORT_URL,
      },
    ],
  ];
}

function formatOrderStatusLookup(order: {
  orderNumber: string;
  gameName?: string;
  packageName?: string;
  playerId?: string;
  serverId?: string;
  playerName?: string;
  amount?: number;
  currency?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  createdAt?: Date;
}): string {
  const payUpper = String(order.paymentStatus || "PENDING").toUpperCase();
  const fulUpper = String(order.fulfillmentStatus || "PENDING").toUpperCase();

  const payBadge =
    payUpper === "PAID"
      ? "🟢 បង់ប្រាក់រួចរាល់ (Paid)"
      : payUpper === "EXPIRED"
        ? "⚪ ផុតកំណត់ (Expired)"
        : payUpper === "FAILED"
          ? "🔴 បរាជ័យ (Failed)"
          : "🟡 រង់ចាំការបង់ប្រាក់ (Pending)";

  const fulBadge =
    fulUpper === "COMPLETED" || fulUpper === "DELIVERED"
      ? "✅ បញ្ចូលជោគជ័យ (Completed)"
      : fulUpper === "PROCESSING"
        ? "⏳ កំពុងដំណើរការ (Processing)"
        : fulUpper === "FAILED"
          ? "⚠️ កំពុងត្រួតពិនិត្យដោយ Admin (Manual Review)"
          : "🕐 រង់ចាំ (Pending)";

  const lines = [
    `📦 <b>ព័ត៌មានបញ្ជាទិញ (Order Details)</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `• <b>Order ID:</b> <code>${escapeTelegramHtml(order.orderNumber)}</code>`,
    `• <b>Game/Service:</b> ${escapeTelegramHtml(order.gameName || "Game Top-Up")}`,
    `• <b>Package:</b> ${escapeTelegramHtml(order.packageName || "-")}`,
  ];

  if (order.playerId) {
    lines.push(`• <b>ID:</b> <code>${escapeTelegramHtml(order.playerId)}</code>`);
  }
  if (order.serverId) {
    lines.push(`• <b>Zone/Server:</b> <code>${escapeTelegramHtml(order.serverId)}</code>`);
  }
  if (order.playerName) {
    lines.push(`• <b>IGN:</b> <code>${escapeTelegramHtml(order.playerName)}</code>`);
  }

  const priceStr = typeof order.amount === "number" ? `$${order.amount.toFixed(2)}` : "-";
  lines.push(`• <b>តម្លៃ (Price):</b> ${escapeTelegramHtml(priceStr)}`);
  lines.push(`• <b>ការបង់ប្រាក់:</b> ${payBadge}`);
  lines.push(`• <b>ស្ថានភាពពេជ្រ:</b> ${fulBadge}`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    // Optional secret token check if configured in environment
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (configuredSecret) {
      const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
      if (headerSecret !== configuredSecret) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = await req.json().catch(() => null);
    if (!update || typeof update !== "object") {
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    // Strictly respond ONLY in private 1-on-1 chats with customers.
    // Never respond inside admin groups or broadcast channels.
    if (message.chat.type !== "private") {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const firstName = escapeTelegramHtml(message.from?.first_name || "អតិថិជន");
    const rawText = String(message.text || "").trim();

    if (!rawText) {
      return NextResponse.json({ ok: true });
    }

    const lowerText = rawText.toLowerCase();

    // 1. /start or /shop command
    if (lowerText.startsWith("/start") || lowerText.startsWith("/shop") || lowerText.startsWith("/menu")) {
      const welcomeMsg = [
        `👋 សួស្តី <b>${firstName}</b>! សូមស្វាគមន៍មកកាន់ <b>Asura Store</b> 🎮`,
        ``,
        `💎 <b>សេវាកម្មបញ្ចូលពេជ្រហ្គេម និងបណ្តាញសង្គមស្វ័យប្រវត្តិ 24/7៖</b>`,
        `• Mobile Legends, Free Fire, PUBG Mobile, Honor of Kings, Roblox និងហ្គេមជាច្រើនទៀត`,
        `• សេវាកម្ម TikTok, Facebook, Telegram, Instagram, YouTube`,
        `• បង់ប្រាក់រហ័សតាម <b>ABA KHQR</b> ពេជ្រចូលភ្លាមៗ!`,
        ``,
        `👇 <b>សូមចុចប៊ូតុងខាងក្រោមដើម្បីចូលទិញឥឡូវនេះ៖</b>`,
      ].join("\n");

      await sendBotReply(chatId, welcomeMsg, getMainStoreKeyboard());
      return NextResponse.json({ ok: true });
    }

    // 2. /support or /help command
    if (lowerText.startsWith("/support") || lowerText.startsWith("/help")) {
      const supportMsg = [
        `💬 <b>ផ្នែកជំនួយអតិថិជន (Customer Support)</b>`,
        ``,
        `ប្រសិនបើអ្នកមានបញ្ហាក្នុងការបញ្ចូលពេជ្រ ឬត្រូវការជំនួយបន្ថែម សូមទាក់ទងមកកាន់ Admin ផ្ទាល់តាមរយៈប៊ូតុងខាងក្រោម៖`,
        ``,
        `💡 <i>អ្នកក៏អាចផ្ញើលេខកូដ Order (ឧ. ASURA-xxxxxx ឬ GWN-xxxxxx) មកកាន់ទីនេះផ្ទាល់ដើម្បីឆែកស្ថានភាព Order ផងដែរ។</i>`,
      ].join("\n");

      await sendBotReply(chatId, supportMsg, getMainStoreKeyboard());
      return NextResponse.json({ ok: true });
    }

    // 3. /track command or direct Order ID input (e.g., ASURA-..., GWN-..., SMM-..., ORD-...)
    const orderIdMatch =
      rawText.match(/^\/track\s+([A-Za-z0-9_-]{4,40})$/i) ||
      rawText.match(/^((?:ASURA|GWN|SMM|ORD)-[A-Za-z0-9_-]{3,35})$/i);

    if (lowerText === "/track") {
      await sendBotReply(
        chatId,
        `🔍 សូមបញ្ចូលលេខកូដ Order របស់អ្នកដើម្បីពិនិត្យស្ថានភាព។\nឧទាហរណ៍៖ <code>/track ASURA-123456-AB12</code>`,
        getMainStoreKeyboard()
      );
      return NextResponse.json({ ok: true });
    }

    if (orderIdMatch) {
      const targetOrderNum = orderIdMatch[1].trim().toUpperCase();
      await connectDB();
      const foundOrder = await Order.findOne({
        orderNumber: targetOrderNum,
      })
        .select(
          "orderNumber gameName packageName playerId serverId playerName amount currency paymentStatus fulfillmentStatus createdAt"
        )
        .lean();

      if (!foundOrder) {
        await sendBotReply(
          chatId,
          `❌ រកមិនឃើញលេខកូដ Order <code>${escapeTelegramHtml(targetOrderNum)}</code> នេះទេ។ សូមពិនិត្យមើលលេខកូដម្តងទៀត ឬទាក់ទង Admin។`,
          getMainStoreKeyboard()
        );
      } else {
        await sendBotReply(chatId, formatOrderStatusLookup(foundOrder), getMainStoreKeyboard());
      }
      return NextResponse.json({ ok: true });
    }

    // 4. Default fallback reply for any other private text
    const fallbackMsg = [
      `👋 សួស្តី <b>${firstName}</b>!`,
      ``,
      `• ចុចប៊ូតុង <b>"🛍️ បើកហាងទិញពេជ្រ"</b> ខាងក្រោមដើម្បីទិញពេជ្រហ្គេម ឬសេវាកម្មបណ្តាញសង្គម។`,
      `• ផ្ញើលេខកូដ Order (ឧ. <code>ASURA-xxxxxx</code>) មកទីនេះដើម្បីឆែកមើលស្ថានភាព Order របស់អ្នក។`,
    ].join("\n");

    await sendBotReply(chatId, fallbackMsg, getMainStoreKeyboard());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Bot Webhook] Error handling update:", error);
    return NextResponse.json({ ok: true });
  }
}
