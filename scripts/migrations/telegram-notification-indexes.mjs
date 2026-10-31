import "../lib/register-typescript.mjs";
import mongoose from "mongoose";
import { connectDB } from "../../src/lib/mongodb.ts";

// Additive and idempotent: no data deletion, status rewrites, or historical sends.
const indexes = [
  [{ "telegramNotifications.state": 1, "telegramNotifications.nextAttemptAt": 1 }, "telegram_notification_outbox_due"],
  [{ "telegramNotifications.state": 1, "telegramNotifications.lockedAt": 1 }, "telegram_notification_stale"],
  [{ supplierNextPollAt: 1, createdAt: 1 }, "supplier_status_poll_due"],
];
try {
  if (!process.argv.includes("--apply")) {
    console.log("Dry run: create three order outbox/poll indexes. No historical notifications will be queued. Use --apply to create indexes.");
  } else {
    await connectDB();
    for (const [keys, name] of indexes) await mongoose.connection.db.collection("orders").createIndex(keys, { name });
    console.log("Notification indexes created. Existing orders and history preserved.");
  }
} catch {
  console.error("Notification index migration failed; verify database access.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
