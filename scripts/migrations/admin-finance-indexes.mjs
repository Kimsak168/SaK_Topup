import mongoose from "mongoose";

const INDEXES = [
  {
    collection: "orders",
    name: "uniq_order_idempotency_key",
    keys: { idempotencyKey: 1 },
    options: { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } },
    duplicateKey: "$idempotencyKey",
    match: { idempotencyKey: { $type: "string", $gt: "" } },
  },
  {
    collection: "orders",
    name: "uniq_supplier_order_id",
    keys: { supplier: 1, supplierOrderId: 1 },
    options: { unique: true, partialFilterExpression: { supplierOrderId: { $type: "string", $gt: "" } } },
    duplicateKey: { supplier: "$supplier", supplierOrderId: "$supplierOrderId" },
    match: { supplierOrderId: { $type: "string", $gt: "" } },
  },
  {
    collection: "payments",
    name: "uniq_gateway_payment_transaction",
    keys: { gateway: 1, transactionId: 1 },
    options: { unique: true, partialFilterExpression: { transactionId: { $type: "string", $gt: "" } } },
    duplicateKey: { gateway: "$gateway", transactionId: "$transactionId" },
    match: { transactionId: { $type: "string", $gt: "" } },
  },
  {
    collection: "refunds",
    name: "uniq_refund_idempotency_key",
    keys: { idempotencyKey: 1 },
    options: { unique: true },
    duplicateKey: "$idempotencyKey",
  },
];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required. No database was changed.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB_NAME || "test";
const rollback = process.argv.includes("--rollback");
const apply = process.argv.includes("--apply");

try {
  await mongoose.connect(uri, { dbName, autoIndex: false, serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database handle unavailable.");

  if (rollback) {
    for (const index of INDEXES) {
      try { await db.collection(index.collection).dropIndex(index.name); }
      catch (error) {
        if (error?.codeName !== "IndexNotFound" && error?.code !== 27) throw error;
      }
    }
    console.log("Removed finance/idempotency indexes. No records were changed.");
  } else {
    const duplicateCounts = {};
    for (const index of INDEXES) {
      const pipeline = [
        ...(index.match ? [{ $match: index.match }] : []),
        { $group: { _id: index.duplicateKey, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: "duplicates" },
      ];
      const found = await db.collection(index.collection).aggregate(pipeline).toArray();
      const count = Number(found[0]?.duplicates || 0);
      duplicateCounts[index.name] = count;
    }
    const conflicts = Object.entries(duplicateCounts).filter(([, count]) => count > 0);
    if (conflicts.length) {
      console.error("Index preflight found duplicate reference groups. No data or indexes were changed.");
      console.error(JSON.stringify(Object.fromEntries(conflicts)));
      process.exitCode = 2;
    } else if (!apply) {
      console.log("Preflight passed. Dry run only; rerun with --apply to create indexes.");
      console.log(JSON.stringify({ indexes: INDEXES.map(({ collection, name }) => ({ collection, name })), duplicateGroups: duplicateCounts }));
    } else {
      for (const index of INDEXES) {
        await db.collection(index.collection).createIndex(index.keys, { ...index.options, name: index.name });
      }
      console.log("Created finance/idempotency indexes. No records were changed.");
    }
  }
} catch {
  console.error("Finance index migration failed. No records were deleted; verify database access and retry.");
  process.exitCode = process.exitCode || 1;
} finally {
  await mongoose.disconnect().catch(() => undefined);
}
