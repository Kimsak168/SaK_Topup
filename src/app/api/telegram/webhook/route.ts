import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Game } from "@/models/Game";
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
  style?: "primary" | "success" | "danger";
}

interface TelegramReplyKeyboardButton {
  text: string;
  web_app?: { url: string };
  style?: "primary" | "success" | "danger";
}

/**
 * Persistent bottom reply keyboard matching Fox Store style (Bot API 9.4+ colored buttons)
 * - Row 1: Blue ("primary") buttons for Games & Services/Vouchers
 * - Row 2: Account ("👤 គណនី") & Green ("success") button for Instant Top-Up / Store
 * - Row 3: Orders ("🗒️ Orders") & Support ("💬 Support")
 */
function getPersistentMainReplyKeyboard(): {
  keyboard: TelegramReplyKeyboardButton[][];
  resize_keyboard: boolean;
  is_persistent: boolean;
} {
  return {
    keyboard: [
      [
        { text: "🎮 Games", style: "primary" },
        { text: "🚀 Services", style: "primary" },
      ],
      [
        { text: "👤 គណនី" },
        {
          text: "💎 ទិញពេជ្រ",
          style: "success",
          web_app: { url: STORE_URL },
        },
      ],
      [
        { text: "🗒️ Orders" },
        { text: "💬 Support" },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function getCustomerBotToken(): string | undefined {
  return (
    process.env.TELEGRAM_CUSTOMER_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim()
  );
}

async function sendBotMessage(
  chatId: number | string,
  text: string,
  options?: {
    inlineKeyboard?: TelegramInlineButton[][];
    useMainReplyKeyboard?: boolean;
  }
) {
  const botToken = getCustomerBotToken();
  if (!botToken) return;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (options?.inlineKeyboard && options.inlineKeyboard.length > 0) {
    payload.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  } else if (options?.useMainReplyKeyboard) {
    payload.reply_markup = getPersistentMainReplyKeyboard();
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

function getInlineStoreKeyboard(): TelegramInlineButton[][] {
  return [
    [
      {
        text: "🛍️ បើកហាងទិញពេជ្រ (Open Store)",
        web_app: { url: STORE_URL },
        style: "primary",
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
        text: "📢 Channel",
        url: CHANNEL_URL,
      },
      {
        text: "💬 Support",
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

    // Handle Channel Post in @asura_botstore (Asura_Xbot channel) if admin types /start or /shop
    const channelPost = update.channel_post;
    if (channelPost && channelPost.chat?.type === "channel") {
      const channelText = String(channelPost.text || "").trim().toLowerCase();
      if (channelText.startsWith("/start") || channelText.startsWith("/shop") || channelText.startsWith("/menu")) {
        const channelMsg = [
          `🌸 <b>Asura Store Top-Up</b>`,
          ``,
          `🎮 Top up games · 🚀 SMM Services`,
          `💡 បញ្ចូលពេជ្រហ្គេមស្វ័យប្រវត្តិ 24/7 តាម ABA KHQR`,
          ``,
          `👇 ចុចប៊ូតុងខាងក្រោមដើម្បីចូលទិញពេជ្រ ឬឆែក Order៖`,
        ].join("\n");

        await sendBotMessage(channelPost.chat.id, channelMsg, {
          inlineKeyboard: [
            [
              { text: "🎮 Games", url: STORE_URL, style: "primary" },
              { text: "🚀 Services", url: `${STORE_URL}/services`, style: "primary" },
            ],
            [
              { text: "💎 ទិញពេជ្រ (Open Store)", url: STORE_URL, style: "success" },
            ],
            [
              { text: "🗒️ Orders", url: `${STORE_URL}/orders` },
              { text: "💬 Support", url: SUPPORT_URL },
            ],
          ],
        });
      }
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    // Strictly respond ONLY in private 1-on-1 customer chats.
    // Never respond inside the "Asura store" admin notification group (-1003762539876).
    if (message.chat.type !== "private") {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromUser = message.from || {};
    const firstName = escapeTelegramHtml(fromUser.first_name || "អតិថិជន");
    const lastName = escapeTelegramHtml(fromUser.last_name || "");
    const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`;
    const username = fromUser.username ? `@${escapeTelegramHtml(fromUser.username)}` : "មិនមាន";
    const rawText = String(message.text || "").trim();

    if (!rawText) {
      return NextResponse.json({ ok: true });
    }

    const lowerText = rawText.toLowerCase();

    // 1. /start or /menu command — Fox Store style welcome + colored persistent bottom keyboard
    if (lowerText.startsWith("/start") || lowerText.startsWith("/menu") || lowerText.startsWith("/shop")) {
      const welcomeMsg = [
        `🌸 <b>Asura Store Top-Up</b>`,
        ``,
        `🎮 Top up games · 🚀 SMM Services`,
        `💡 បញ្ចូលពេជ្រហ្គេមស្វ័យប្រវត្តិ 24/7 តាម ABA KHQR`,
        ``,
        `Choose an option below.`,
      ].join("\n");

      await sendBotMessage(chatId, welcomeMsg, { useMainReplyKeyboard: true });
      return NextResponse.json({ ok: true });
    }

    // 2. "🎮 Games" button handler
    if (rawText === "🎮 Games" || lowerText === "games" || lowerText === "/games") {
      await connectDB();
      const activeGames = await Game.find({ isActive: true })
        .select("name slug supplier supplierGameCode")
        .sort({ sortOrder: 1, name: 1 })
        .limit(16)
        .lean();

      const gameButtons: TelegramInlineButton[][] = [];
      for (let i = 0; i < activeGames.length; i += 2) {
        const row: TelegramInlineButton[] = [];
        for (const g of activeGames.slice(i, i + 2)) {
          const supplier = g.supplier || "webbuilder";
          const code = g.supplierGameCode || g.slug;
          row.push({
            text: `🎮 ${g.name}`,
            web_app: { url: `${STORE_URL}/games/${supplier}/${code}` },
          });
        }
        gameButtons.push(row);
      }

      gameButtons.push([
        {
          text: "🛍️ មើលហ្គេមទាំងអស់ (All Games)",
          web_app: { url: STORE_URL },
          style: "primary",
        },
      ]);

      await sendBotMessage(
        chatId,
        `🎮 <b>ជ្រើសរើសហ្គេមដើម្បីបញ្ចូលពេជ្រ (Select Game):</b>\nចុចលើហ្គេមខាងក្រោមដើម្បីជ្រើសរើសកញ្ចប់ពេជ្រ និងបង់ប្រាក់តាម ABA KHQR៖`,
        { inlineKeyboard: gameButtons }
      );
      return NextResponse.json({ ok: true });
    }

    // 3. "🚀 Services" or "🎁 Vouchers" button handler
    if (
      rawText === "🚀 Services" ||
      rawText === "🎁 Vouchers" ||
      lowerText === "services" ||
      lowerText === "/services"
    ) {
      const serviceButtons: TelegramInlineButton[][] = [
        [
          { text: "🎵 TikTok", web_app: { url: `${STORE_URL}/services/tiktok` } },
          { text: "📘 Facebook", web_app: { url: `${STORE_URL}/services/facebook` } },
        ],
        [
          { text: "✈️ Telegram", web_app: { url: `${STORE_URL}/services/telegram` } },
          { text: "📸 Instagram", web_app: { url: `${STORE_URL}/services/instagram` } },
        ],
        [
          { text: "▶️ YouTube", web_app: { url: `${STORE_URL}/services/youtube` } },
          { text: "🎰 កង់សំណាង", web_app: { url: `${STORE_URL}/lucky-draw` } },
        ],
        [
          {
            text: "🚀 មើលសេវាកម្មទាំងអស់ (All Services)",
            web_app: { url: `${STORE_URL}/services` },
            style: "primary",
          },
        ],
      ];

      await sendBotMessage(
        chatId,
        `🚀 <b>សេវាកម្មបណ្តាញសង្គម & Vouchers:</b>\nជ្រើសរើសសេវាកម្ម Followers, Likes, Views ឬកង់សំណាងខាងក្រោម៖`,
        { inlineKeyboard: serviceButtons }
      );
      return NextResponse.json({ ok: true });
    }

    // 4. "👤 គណនី" (Account) button handler
    if (rawText === "👤 គណនី" || lowerText === "account" || lowerText === "/account") {
      const accountMsg = [
        `👤 <b>ព័ត៌មានគណនីរបស់អ្នក (Your Account)</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `• <b>ឈ្មោះ (Name):</b> ${fullName}`,
        `• <b>Username:</b> ${username}`,
        `• <b>Telegram ID:</b> <code>${escapeTelegramHtml(String(fromUser.id || chatId))}</code>`,
        `• <b>ស្ថានភាព:</b> 🟢 Active Customer`,
        ``,
        `💡 អ្នកអាចទិញពេជ្រហ្គេមដោយផ្ទាល់តាមរយៈ ABA KHQR ដោយមិនចាំបាច់ដាក់ប្រាក់មុនឡើយ!`,
      ].join("\n");

      await sendBotMessage(chatId, accountMsg, {
        inlineKeyboard: [
          [
            {
              text: "🛍️ បើកហាងទិញពេជ្រ (Open Store)",
              web_app: { url: STORE_URL },
              style: "success",
            },
          ],
        ],
      });
      return NextResponse.json({ ok: true });
    }

    // 5. "🗒️ Orders" button handler
    if (rawText === "🗒️ Orders" || lowerText === "orders" || lowerText === "/orders" || lowerText === "/track") {
      const orderPromptMsg = [
        `🗒️ <b>ពិនិត្យស្ថានភាពការកម្ម៉ង់ (Check Orders)</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `សូមផ្ញើ <b>លេខកូដ Order ID</b> របស់អ្នកមកកាន់ឆាតនេះផ្ទាល់ ដើម្បីពិនិត្យស្ថានភាពបង់ប្រាក់ និងពេជ្រ៖`,
        ``,
        `ឧទាហរណ៍៖ <code>ASURA-123456-AB12</code> ឬ <code>GWN-96209459</code>`,
        ``,
        `👇 ឬចុចប៊ូតុងខាងក្រោមដើម្បីឆែកក្នុងវេបសាយ៖`,
      ].join("\n");

      await sendBotMessage(chatId, orderPromptMsg, {
        inlineKeyboard: [
          [
            {
              text: "📦 ឆែកមើលប្រវត្តិ Order (Track Orders)",
              web_app: { url: `${STORE_URL}/orders` },
              style: "primary",
            },
          ],
        ],
      });
      return NextResponse.json({ ok: true });
    }

    // 6. "💬 Support" button handler
    if (rawText === "💬 Support" || lowerText.startsWith("/support") || lowerText.startsWith("/help")) {
      const supportMsg = [
        `💬 <b>ផ្នែកជំនួយអតិថិជន (Customer Support)</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `ប្រសិនបើអ្នកមានចម្ងល់ ឬបញ្ហាក្នុងការបញ្ចូលពេជ្រ សូមទាក់ទងមកកាន់ Admin ផ្ទាល់៖`,
        `• <b>Admin Support:</b> @Asuratopupstore`,
        `• <b>Official Channel:</b> @asura_botstore`,
      ].join("\n");

      await sendBotMessage(chatId, supportMsg, {
        inlineKeyboard: [
          [
            { text: "💬 ឆាតទៅកាន់ Admin", url: SUPPORT_URL, style: "primary" },
            { text: "📢 ចូល Channel", url: CHANNEL_URL },
          ],
        ],
      });
      return NextResponse.json({ ok: true });
    }

    // 7. Direct Order ID lookup (e.g. ASURA-..., GWN-..., SMM-..., ORD-...)
    const orderIdMatch =
      rawText.match(/^\/track\s+([A-Za-z0-9_-]{4,40})$/i) ||
      rawText.match(/^((?:ASURA|GWN|SMM|ORD)-[A-Za-z0-9_-]{3,35})$/i);

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
        await sendBotMessage(
          chatId,
          `❌ រកមិនឃើញលេខកូដ Order <code>${escapeTelegramHtml(targetOrderNum)}</code> នេះទេ។ សូមពិនិត្យមើលលេខកូដម្តងទៀត ឬទាក់ទង Admin។`,
          { inlineKeyboard: getInlineStoreKeyboard() }
        );
      } else {
        await sendBotMessage(chatId, formatOrderStatusLookup(foundOrder), {
          inlineKeyboard: getInlineStoreKeyboard(),
        });
      }
      return NextResponse.json({ ok: true });
    }

    // 8. Default fallback: show Fox Store style menu with persistent bottom keyboard
    const fallbackMsg = [
      `🌸 <b>Asura Store Top-Up</b>`,
      ``,
      `🎮 Top up games · 🚀 SMM Services`,
      `💡 សូមជ្រើសរើសម៉ឺនុយខាងក្រោម ឬផ្ញើលេខកូដ Order ដើម្បីឆែកស្ថានភាព៖`,
    ].join("\n");

    await sendBotMessage(chatId, fallbackMsg, { useMainReplyKeyboard: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Bot Webhook] Error handling update:", error);
    return NextResponse.json({ ok: true });
  }
}
