import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI is not defined in environment variables.");
  process.exit(1);
}

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== Database Normalization Audit: ${isApply ? "APPLY MODE" : "DRY-RUN MODE"} ===\n`);

  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  const ordersCollection = db.collection("orders");

  const lowercaseOrders = await ordersCollection.find({
    $or: [
      { paymentStatus: { $in: ["pending", "paid", "failed"] } },
      { fulfillmentStatus: { $in: ["pending", "completed", "failed", "processing"] } },
    ],
  }).toArray();

  console.log(`Found ${lowercaseOrders.length} order(s) with lowercase status values:`);
  for (const ord of lowercaseOrders) {
    console.log(`  - Order: ${ord.orderNumber} (ID: ${ord._id})`);
    console.log(`    Current: paymentStatus="${ord.paymentStatus}", fulfillmentStatus="${ord.fulfillmentStatus}"`);
    console.log(`    Proposed: paymentStatus="${String(ord.paymentStatus).toUpperCase()}", fulfillmentStatus="${String(ord.fulfillmentStatus).toUpperCase()}"`);
  }

  if (!isApply) {
    console.log("\n[DRY RUN] No records were modified.");
    console.log("Run with '--apply' ONLY after explicit user authorization.");
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const ord of lowercaseOrders) {
    await ordersCollection.updateOne(
      { _id: ord._id },
      {
        $set: {
          paymentStatus: String(ord.paymentStatus).toUpperCase(),
          fulfillmentStatus: String(ord.fulfillmentStatus).toUpperCase(),
          updatedAt: new Date(),
        },
      }
    );
    console.log(`[APPLIED] Successfully normalized order ${ord.orderNumber}`);
  }

  console.log("\nNormalization complete.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Error during normalization:", err);
  process.exit(1);
});
