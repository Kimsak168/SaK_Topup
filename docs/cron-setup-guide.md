# SakSuu Game Top-Up — Vercel Cron Job System Guide

This guide details the architecture, configuration, security, and scheduling for the automated background cron system in **SakSuu Game Top-Up**.

---

## 1. Overview of Scheduled Jobs

The system provides three core reconciliation workers plus a master unified endpoint:

| Endpoint | Scheduled Job | Description | Locking & Frequency |
|---|---|---|---|
| `/api/cron/payments` | **Pending Payment Reconciliation** | Verifies pending customer payments with official ABA PayWay V2 / VngZz2 KHQR gateway. Fulfills orders upon payment confirmation. | Lease: `cron-payment-reconciliation` (60s) + Token Fencing |
| `/api/cron/supplier-orders` | **Supplier Order Reconciliation** | Polls in-flight supplier top-up deliveries (VngZz2 via documented `/v1/game/check_order`, WebBuilder, G2Bulk) and verifies completion. | Lease: `cron-supplier-orders` (60s) + Token Fencing |
| `/api/cron/telegram` | **Telegram Outbox Retries** | Retries queued, rate-limited (429), or temporary 5xx Telegram notifications without touching business payment/order states. | Lease: `telegram-outbox` (60s) + Token Fencing |
| `/api/cron/all` | **Master Unified Runner** | Sequentially runs payments (20s budget), supplier deliveries (20s budget), and Telegram outbox (10s budget) in a single invocation. | Consolidates all 3 jobs |
| `/api/cron/order-status` | **Legacy Status Worker** | Maintained for backward compatibility. Orchestrates payments and supplier orders. | Legacy compatibility |

---

## 2. Security & `CRON_SECRET` Authentication

All cron endpoints require a cryptographically secure token configured via `CRON_SECRET`.

### How Authentication Works:
- **Authorization Header**: `Authorization: Bearer <CRON_SECRET>`
- **Custom Header**: `x-cron-secret: <CRON_SECRET>`
- **Timing-Safe Verification**: Evaluated using Node.js `timingSafeEqual` to prevent timing attacks.
- **Fail-Closed**: Requests without a valid secret immediately return `401 Unauthorized` before accessing the database.

### Environment Variable Setup:
In `.env.local` (local) and Vercel Dashboard (Production):
```env
CRON_SECRET=your_high_entropy_random_32_byte_secret
```

---

## 3. Vercel Plan Limitations & Scheduling Strategy

### Vercel Hobby Plan Limits
- **Execution Limit**: Vercel restricts cron jobs on Hobby accounts to **daily intervals only** (once per 24 hours per cron job).
- **Rule**: Expressions like `* * * * *` or `*/5 * * * *` will trigger deployment rejection on Hobby:
  ```text
  Hobby accounts are limited to daily cron jobs. This cron expression (* * * * *) would run more than once per day.
  ```

### Current `vercel.json` Configuration (Hobby Compatible)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/all", "schedule": "0 0 * * *" },
    { "path": "/api/cron/telegram", "schedule": "0 12 * * *" }
  ]
}
```

### High-Frequency Polling on Hobby (Free External Scheduler)
To run automated reconciliation every 1 to 5 minutes on a Hobby plan without upgrading:
1. Use a free external scheduler like [cron-job.org](https://cron-job.org) or a GitHub Actions scheduled workflow.
2. Target URL: `https://saksuuu-topup.vercel.app/api/cron/all`
3. Request Method: `GET`
4. Request Header: `Authorization: Bearer <YOUR_CRON_SECRET>`
5. Interval: Every 1 minute or 5 minutes.

### Upgrading to Vercel Pro
If your project is upgraded to Vercel Pro, you can update `vercel.json` directly to high-frequency schedules:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/all", "schedule": "*/5 * * * *" }
  ]
}
```

---

## 4. Concurrency Protection, Locking & Idempotency

### Two-Tier Locking Mechanism:
1. **Global Distributed Job Lease** (`BackgroundJobLease` collection):
   - Atomically acquired before starting any worker.
   - Prevents overlapping invocations across multiple serverless instances.
   - Automatically expires after 60 seconds if a serverless instance crashes.
2. **Per-Record Token Fencing** (`Order` collection):
   - Each order is claimed using `findOneAndUpdate` with a unique UUID `pollToken` and a lock timestamp (`lockedUntil: +120s`).
   - Competing workers cannot touch the same order simultaneously.
   - Updates include token checking to prevent stale writes.

### Exponential Backoff:
- Orders that are still pending or encounter transient network errors back off exponentially (60s, 120s, 240s... up to 3600s).
- Settled orders (`PAID`, `FAILED`, `completed`) are marked with distant poll dates to exclude them from high-frequency queries.

---

## 5. Reliability & Error Safety Rules

1. **Never Mark Pending Orders Failed on Timeout**:
   - Network errors, DNS timeouts, or HTTP 503 from payment providers/suppliers leave orders in their current status (`PENDING` or `processing`).
   - Only authoritative confirmation from provider APIs can settle an order.
2. **Business Status Isolation**:
   - Telegram notification failures never alter payment or fulfillment statuses.
3. **Batch Sizing & Time Budgeting**:
   - Each worker operates with strict time checks (`Date.now() - started < 20,000ms`) and batch caps (default 10 records) to stay within Vercel's serverless execution window.

---

## 6. Structured Logging & Monitoring

All cron activities emit structured JSON logs tagged by worker:
```json
[CRON][CRON_PAYMENTS] {"timestamp":"2026-10-31T12:00:00.000Z","tag":"CRON_PAYMENTS","event":"summary","durationMs":342,"stats":{"checked":2,"paid":1,"failed":0,"expired":0,"pending":1}}
[CRON][CRON_SUPPLIER] {"timestamp":"2026-10-31T12:00:00.000Z","tag":"CRON_SUPPLIER","event":"summary","durationMs":415,"stats":{"checked":1,"completed":1,"failed":0,"processing":0}}
[CRON][CRON_TELEGRAM] {"timestamp":"2026-10-31T12:00:00.000Z","tag":"CRON_TELEGRAM","event":"summary","durationMs":1120,"stats":{"scannedOrders":1,"attempted":1,"sent":1}}
```

Inspect these real-time in the Vercel Dashboard under **Logs** by filtering for `[CRON]`.

