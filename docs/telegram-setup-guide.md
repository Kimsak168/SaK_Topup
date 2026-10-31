# SakSuu Game Top-Up — Telegram Bot Integration & Setup Guide

This guide explains how to set up, connect, and troubleshoot your private Telegram Bot for **SakSuu Game Top-Up** notifications.

---

## 1. Overview & Security Rules

SakSuu uses the official Telegram Bot API to deliver real-time operational notifications directly to your private administrative Telegram group named **SakSuu**.

### ⚠️ Critical Security Rules
- **Server-Side Only**: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` are read strictly on the server (Node.js runtime / Next.js Server Components and API route handlers).
- **Never Prefix with `NEXT_PUBLIC_`**: Exposing these variables to the frontend client bundle compromises bot control and group access.
- **Never Commit Secrets**: Do not commit `.env.local` or raw credentials to Git. Always add them to your secure hosting environment (e.g. Vercel Project Settings → Environment Variables).
- **Never Delete Webhooks Automatically**: If diagnosing `getUpdates` or webhook activity, inspect `getWebhookInfo` first. Never drop a webhook without explicit confirmation, as other integrations or services may depend on it.

---

## 2. Notification Statuses

The integration supports exactly six operational statuses divided into payment verification and supplier fulfillment:

| Category | Status | Trigger Event |
|---|---|---|
| **Payment** | 🟡 `PAYMENT PENDING` | Customer creates an order and initializes payment QR / checkout |
| **Payment** | 🟢 `PAYMENT SUCCESS` | Customer payment is officially verified and confirmed via provider gateway |
| **Payment** | 🔴 `PAYMENT FAILED` | Customer payment definitively fails, expires, or is rejected |
| **Order** | 🟡 `ORDER PENDING` | Order is queued and ready for fulfillment |
| **Order** | 🟢 `ORDER SUCCESS` | Top-up delivery is verified and confirmed by supplier |
| **Order** | 🔴 `ORDER FAILED` | Supplier confirms delivery failed or package error occurred |

> **Note on Separation of Concerns**: Customer payment processing is strictly separated from supplier fulfillment. A successful payment transitions to supplier processing, but an order is never marked as `ORDER SUCCESS` simply because a supplier accepted it. Delivery verification must be confirmed.

---

## 3. Step-by-Step Setup

### Step 1: Create Your Telegram Bot
1. Open Telegram and search for [`@BotFather`](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts to choose a display name (e.g., `SakSuu Top-Up Notifier`) and a unique bot username (e.g., `saksuu_topup_bot`).
3. BotFather will provide your **HTTP API Bot Token** formatted like:
   ```text
   7123456789:AAFlKjD...EXAMPLE...x9Q
   ```
4. Save this token securely as `TELEGRAM_BOT_TOKEN`.

### Step 2: Add Bot to the "SakSuu" Admin Group
1. In Telegram, navigate to your private admin group named **SakSuu** (or create it if not already present).
2. Go to **Group Settings** → **Members / Administrators** → **Add Member**.
3. Search for your bot username (e.g., `@saksuu_topup_bot`) and add it to the group.
4. **Promote the bot to Administrator** (at minimum, grant permission to *Post Messages* or *Send Messages*).

---

## 4. Obtaining the Correct Telegram Group Chat ID

Telegram supergroups and private channels have negative numeric IDs, typically starting with `-100` (e.g., `-1001987654321`).

### Method A: Using `getUpdates` via Web Browser or cURL
1. Ensure the bot is an admin in the **SakSuu** group.
2. In the **SakSuu** group chat, send a regular message, e.g.:
   ```text
   /test SakSuu Bot Setup
   ```
3. Open your browser or terminal and call the `getUpdates` endpoint replacing `<YOUR_BOT_TOKEN>`:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
   ```
4. Look for the `chat` object in the JSON response:
   ```json
   {
     "ok": true,
     "result": [
       {
         "update_id": 123456789,
         "message": {
           "message_id": 42,
           "from": { "id": 98765432, "first_name": "Admin" },
           "chat": {
             "id": -1001987654321,
             "title": "SakSuu",
             "type": "supergroup"
           },
           "date": 1714500000,
           "text": "/test SakSuu Bot Setup"
         }
       }
     ]
   }
   ```
5. Copy the exact `chat.id` value (including the `-` sign and `100` prefix, e.g. `-1001987654321`). This is your `TELEGRAM_ADMIN_CHAT_ID`.

---

## 5. Diagnosing Empty `getUpdates` (`{"ok":true,"result":[]}`)

If you call `getUpdates` and receive `{"ok": true, "result": []}`, check the following 3 common causes:

### 1. Active Webhook Conflict
- Telegram rules state that **`getUpdates` cannot be used while an active webhook is registered**.
- **Diagnose**: Run:
  ```bash
  curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
  ```
- If `"url"` is not empty (e.g. `"url": "https://..."`), Telegram is dispatching updates to that webhook instead of buffering them for `getUpdates`.
- **Resolution**:
  - If that webhook was set up for another service, do not delete it without checking.
  - If it is an obsolete URL or leftover test webhook, you can clear it using `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook`. Note that SakSuu **never deletes existing webhooks automatically**.

### 2. Group Privacy Mode
- By default, BotFather enables **Group Privacy Mode**. When active, the bot only receives messages that mention the bot (`@saksuu_topup_bot`), commands starting with `/`, or replies to the bot's own messages.
- **Resolution**:
  - In BotFather, send `/setprivacy` → select your bot → choose **Disable**.
  - Alternatively, mention the bot directly in the group: `@saksuu_topup_bot ping`.

### 3. No New Messages Since Bot Was Added
- Telegram only delivers updates that occurred **after** the bot was added or updates that have not yet expired (within 24 hours).
- **Resolution**: Send a new test message in the **SakSuu** group (e.g., `/ping`) and immediately re-query `getUpdates`.

---

## 6. Environment Variables Configuration

Add these variables to your `.env.local` (local development) and your Vercel Dashboard (Production/Preview):

```env
# Admin-only Telegram notifications (server only; never use NEXT_PUBLIC_)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_CHAT_ID=-1001234567890

# Optional: Telegram Forum Topic Thread IDs
# If your SakSuu group has Forum Topics enabled (e.g., ⁉️ Peddling, 💎 Success, 💡 Failed):
TELEGRAM_TOPIC_PENDING=11
TELEGRAM_TOPIC_SUCCESS=10
TELEGRAM_TOPIC_FAILED=12
```

---

## 7. Forum Topics Setup (Optional)

If your **SakSuu** supergroup has **Topics** enabled, you can route notifications directly into designated topic threads:
- **Pending Notifications** (`PAYMENT PENDING`, `ORDER PENDING`) ➔ `⁉️ Peddling` topic
- **Success Notifications** (`PAYMENT SUCCESS`, `ORDER SUCCESS`) ➔ `💎 Success` topic
- **Failed Notifications** (`PAYMENT FAILED`, `ORDER FAILED`) ➔ `💡 Failed` topic

### How to get the Topic ID in Telegram Desktop:
1. In Telegram Desktop, right-click on the topic name (e.g., `💎 Success`).
2. Click **Copy Link to Topic** (e.g. `https://t.me/c/3762539876/10`).
3. The number at the end of the link (`10`) is your **Topic Thread ID**!
4. Add it to `TELEGRAM_TOPIC_SUCCESS=10`.
5. Repeat for `💡 Failed` (`TELEGRAM_TOPIC_FAILED=...`).
6. *(Note: We already detected `⁉️ Peddling` as Topic ID `11`).*

> **Graceful Fallback**: If topic variables are left empty, or if a topic is ever deleted, SakSuu automatically and safely falls back to delivering to the main general chat so you never miss an alert.

---

## 8. Verifying Connection in the Admin Dashboard

SakSuu provides a built-in admin dashboard interface to test your Telegram configuration without manual scripts:

1. Log in to your SakSuu Admin Dashboard at `/admin/settings`.
2. Locate the **Telegram Bot Notifications** section:
   - **Status Badge**: Displays `Active` when configured, or `Missing Configuration` if variables are unset.
   - **Target Admin Group**: Displays your configured chat ID safely masked (e.g. `-100****7890`) — the bot token is never rendered.
3. Click **Test Telegram Connection**:
   - Safely calls `getMe` to verify token validity.
   - Calls `getChat` on your `TELEGRAM_ADMIN_CHAT_ID` to verify bot membership and group permissions in **SakSuu**.
   - Checks `getWebhookInfo` to verify delivery channels.
4. Click **Send Test Message**:
   - Transmits a test message formatted with safe HTML escaping directly to the **SakSuu** group.
5. Review **Notification History**:
   - Inspect recent notifications, delivery timestamps, failure error messages, and retry counters.
   - Use **Retry All Failed** or individual retry buttons to re-dispatch any queued or failed events.

