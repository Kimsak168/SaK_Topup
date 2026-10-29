import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
const outputPath = resolve(outputArg || "artifacts/smm-catalog-cleanup/report.json");
const confirmationHash = args.find((arg) => arg.startsWith("--confirm-hash="))?.slice("--confirm-hash=".length) || "";
const backupArg = args.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length);
const backupPath = backupArg ? resolve(backupArg) : "";
const applyRequested = args.includes("--apply");
const maxRecords = 10000;
const platforms = new Set(["tiktok", "telegram", "facebook", "instagram", "youtube", "other"]);

function cleanText(value) {
  return typeof value === "string" ? value.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() : "";
}

function normalizePlatform(value, name, category) {
  const explicit = cleanText(value).toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = new Map([
    ["tiktok", "tiktok"], ["tik tok", "tiktok"],
    ["telegram", "telegram"], ["tg", "telegram"],
    ["facebook", "facebook"], ["fb", "facebook"],
    ["instagram", "instagram"], ["ig", "instagram"],
    ["youtube", "youtube"], ["yt", "youtube"],
  ]);
  const canonical = aliases.get(explicit);
  if (canonical) return { platform: canonical, uncertain: false };
  if (explicit && platforms.has(explicit)) return { platform: explicit, uncertain: false };
  const text = `${cleanText(name)} ${cleanText(category)}`.toLowerCase();
  const inferred = ["tiktok", "telegram", "facebook", "instagram", "youtube"].find((item) => text.includes(item));
  return { platform: inferred || "other", uncertain: Boolean(explicit) || !inferred };
}

function normalizeCategory(value, name, description) {
  const source = `${cleanText(value)} ${cleanText(name)} ${cleanText(description)}`.toLowerCase();
  if (/follower|member|subscriber/.test(source)) return "Followers / Members / Subscribers";
  if (/like|reaction|favorite|favourite/.test(source)) return "Likes / Reactions";
  if (/view|impression/.test(source)) return "Views";
  if (/comment/.test(source)) return "Comments";
  if (/share|save|bookmark/.test(source)) return "Shares / Saves";
  return "Other Services";
}

function getServiceId(record) {
  for (const field of ["supplierServiceId", "service", "serviceId", "supplierProductCode", "service_id", "id"]) {
    const value = record[field];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getPrice(record) {
  const value = record.rate ?? record.price ?? record.wholesaleRate;
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return Number.NaN;
}

function getFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  if (["true", "yes", "1", "active", "enabled", "available"].includes(value.trim().toLowerCase())) return true;
  if (["false", "no", "0", "inactive", "disabled", "unavailable", "paused"].includes(value.trim().toLowerCase())) return false;
  return undefined;
}

function classifyRecords(records, collection) {
  const ids = new Map();
  const names = new Map();
  for (const record of records) {
    const supplier = cleanText(record.supplier || record.provider).toLowerCase() || "unknown";
    const id = getServiceId(record);
    const name = cleanText(record.name ?? record.title);
    const platform = normalizePlatform(record.platform, name, record.category);
    if (id) {
      const key = `${supplier}:${id}`;
      ids.set(key, [...(ids.get(key) || []), record]);
    }
    if (name) {
      const key = `${supplier}:${platform.platform}:${normalizeCategory(record.category, name, record.description)}:${name.toLowerCase()}`;
      names.set(key, [...(names.get(key) || []), record]);
    }
  }

  const result = records.map((record) => {
    const id = getServiceId(record);
    const name = cleanText(record.name ?? record.title);
    const description = cleanText(record.description ?? record.desc);
    const category = cleanText(record.category);
    const supplier = cleanText(record.supplier || record.provider).toLowerCase() || "unknown";
    const { platform, uncertain: platformNeedsReview } = normalizePlatform(record.platform, name, category);
    const price = getPrice(record);
    const min = Number(record.min ?? record.minimum);
    const max = Number(record.max ?? record.maximum);
    const status = cleanText(record.status).toLowerCase();
    const rawId = record.supplierServiceId ?? record.service ?? record.serviceId ?? record.supplierProductCode ?? record.service_id ?? record.id;
    const idHasWhitespace = typeof rawId === "string" && rawId !== rawId.trim();
    const supplierActive = getFlag(record.supplierAvailable ?? record.available ?? record.active ?? record.isActive ?? record.enabled ?? status);
    const duplicateId = id ? (ids.get(`${supplier}:${id}`)?.length || 0) > 1 : false;
    const duplicateName = name ? (names.get(`${supplier}:${platform}:${normalizeCategory(category, name, description)}:${name.toLowerCase()}`)?.length || 0) > 1 : false;
    const issues = [];
    if (supplier === "unknown") issues.push("missing_supplier_identifier_manual_review");
    else if (supplier !== "vngzz2") issues.push("unrecognized_supplier_identifier_manual_review");
    const proposed = {};
    if (!id) issues.push("missing_supplier_service_id");
    if (!name) issues.push("missing_name");
    if (!Number.isFinite(price) || price <= 0) issues.push("invalid_price");
    if (!Number.isSafeInteger(min) || min <= 0) issues.push("invalid_minimum");
    if (!Number.isSafeInteger(max) || max < min) issues.push("invalid_maximum");
    if (!category) issues.push("missing_category");
    if (platformNeedsReview) issues.push("platform_manual_review");
    if (supplierActive === false) issues.push("inactive_or_unavailable");
    if (supplierActive === undefined) issues.push("availability_manual_review");
    if (duplicateId) issues.push("duplicate_supplier_id");
    if (duplicateName) issues.push("possible_duplicate_name_manual_review");

    if (name && name !== (record.name ?? record.title)) proposed.name = name;
    if (description && description !== (record.description ?? record.desc)) proposed.description = description;
    const normalizedCategory = normalizeCategory(category, name, description);
    if (normalizedCategory !== category) proposed.category = normalizedCategory;
    if (platform !== cleanText(record.platform).toLowerCase()) proposed.platform = platform;

    const fatal = issues.some((issue) => ["missing_supplier_service_id", "missing_name", "invalid_price", "invalid_minimum", "invalid_maximum"].includes(issue));
    if (idHasWhitespace) issues.push("supplier_service_id_manual_review");
    const statusLabel = duplicateId ? "duplicate" : fatal ? "invalid" : issues.some((issue) => issue.includes("manual_review")) ? "manual_review" : supplierActive === false ? "inactive" : "valid";

    return {
      recordId: record._id ? String(record._id) : null,
      updatedAt: record.updatedAt || null,
      collection,
      supplier,
      supplierServiceId: id || null,
      name: name || null,
      platform,
      category: normalizedCategory,
      rate: Number.isFinite(price) ? price : null,
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
      supplierActive: supplierActive ?? null,
      status: statusLabel,
      issues,
      proposedChanges: proposed,
      orderReferences: 0,
      paymentReferences: 0,
      safeToAutoNormalize: supplier === "vngzz2" && !duplicateId && !duplicateName && !fatal && !platformNeedsReview && !idHasWhitespace && Object.keys(proposed).length > 0,
    };
  });
  return result;
}

async function main() {
  if (applyRequested && args.includes("--dry-run")) throw new Error("Choose either --dry-run or --apply, not both.");
  if (applyRequested && (!/^[a-f\d]{64}$/i.test(confirmationHash) || !backupPath)) {
    throw new Error("Apply requires --confirm-hash=<dry-run plan hash> and --backup=<path> before any database write.");
  }
  if (backupPath && backupPath === outputPath) throw new Error("The backup and report must use different output paths.");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing; no database was inspected.");

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || "test",
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 2,
    autoIndex: false,
  });

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection opened without a database handle.");
    const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name).sort();
    const databaseCollections = await Promise.all(collectionNames.map(async (name) => ({
      name,
      records: await db.collection(name).countDocuments(),
    })));
    const supplierRecordCollections = collectionNames.filter((name) => /^(suppliers?|supplieraccounts?)$/i.test(name));
    const catalogCollections = collectionNames.filter((name) => /smm|social.?media.?service|service.?catalog/i.test(name) && !/audit|backup|log|order|payment/i.test(name));
    const candidateCollections = [...new Set([...catalogCollections, ...collectionNames.filter((name) => name.toLowerCase() === "services")])];
    const records = [];
    const collectionInventory = [];

    for (const name of candidateCollections) {
      const collection = db.collection(name);
      const total = await collection.countDocuments();
      const sampled = await collection.find({}, { projection: {
        supplier: 1, supplierServiceId: 1, service: 1, serviceId: 1, supplierProductCode: 1, service_id: 1, id: 1,
        name: 1, title: 1, platform: 1, category: 1, type: 1, description: 1, desc: 1,
        rate: 1, price: 1, wholesaleRate: 1, min: 1, max: 1, minimum: 1, maximum: 1,
        active: 1, isActive: 1, enabled: 1, available: 1, supplierAvailable: 1, status: 1, updatedAt: 1,
      } }).limit(maxRecords).toArray();
      collectionInventory.push({ name, total, inspected: sampled.length, truncated: total > sampled.length });
      records.push(...classifyRecords(sampled, name));
    }

    const orders = db.collection("orders");
    const smmOrderFilter = { $or: [{ serviceType: "smm" }, { gameSlug: "smm-service" }] };
    const [smmOrderCount, orderGroups] = await Promise.all([
      orders.countDocuments(smmOrderFilter),
      orders.aggregate([
        { $match: smmOrderFilter },
        { $group: {
          _id: { $ifNull: ["$supplierProductCode", "$packageId"] },
          count: { $sum: 1 },
          orderNumbers: { $addToSet: "$orderNumber" },
          paidOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", ["PAID", "paid", "successful", "SUCCESSFUL"]] }, 1, 0] } },
        } },
        { $project: { serviceId: "$_id", count: 1, orderNumbers: 1, paidOrders: 1, _id: 0 } },
      ]).toArray(),
    ]);
    const referencedServiceIds = new Map();
    for (const group of orderGroups) {
      if (group.serviceId !== null && group.serviceId !== undefined) referencedServiceIds.set(String(group.serviceId), group);
    }
    const orderNumbers = orderGroups.flatMap((group) => group.orderNumbers || []).filter(Boolean);
    const payments = db.collection("payments");
    const paymentGroups = orderNumbers.length
      ? await payments.aggregate([
          { $match: { orderNumber: { $in: orderNumbers } } },
          { $group: { _id: "$orderNumber", count: { $sum: 1 } } },
        ]).toArray()
      : [];
    const paymentCounts = new Map(paymentGroups.map((group) => [String(group._id), group.count]));
    for (const record of records) {
      const reference = referencedServiceIds.get(record.supplierServiceId || "");
      if (reference) {
        record.orderReferences = reference.count;
        record.paymentReferences = (reference.orderNumbers || []).reduce((count, orderNumber) => count + (paymentCounts.get(String(orderNumber)) || 0), 0);
        record.safeToAutoNormalize = false;
        if (!record.issues.includes("existing_order_reference")) record.issues.push("existing_order_reference");
        if (record.status === "valid") record.status = "manual_review";
      }
    }

    const planItems = records
      .filter((record) => record.collection === "smmservices" && record.safeToAutoNormalize && Object.keys(record.proposedChanges || {}).length > 0)
      .map((record) => ({ collection: record.collection, recordId: record.recordId, updatedAt: record.updatedAt, supplierServiceId: record.supplierServiceId, proposedChanges: record.proposedChanges }))
      .sort((a, b) => `${a.collection}:${a.recordId}`.localeCompare(`${b.collection}:${b.recordId}`));
    const planHash = createHash("sha256").update(JSON.stringify(planItems)).digest("hex");

    const counts = Object.fromEntries(["valid", "duplicate", "invalid", "manual_review", "inactive"].map((status) => [status, records.filter((record) => record.status === status).length]));
    const packages = db.collection("gamepackages");
    const [gamePackageCount, duplicatePackageKeys, invalidGamePackageCounts] = await Promise.all([
      packages.countDocuments(),
      packages.aggregate([
        { $group: { _id: { supplier: "$supplier", gameSlug: "$gameSlug", supplierProductCode: "$supplierProductCode" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 } } },
        { $project: { supplier: "$_id.supplier", gameSlug: "$_id.gameSlug", supplierProductCode: "$_id.supplierProductCode", count: 1, ids: { $slice: ["$ids", 5] }, _id: 0 } },
        { $limit: 1000 },
      ]).toArray(),
      packages.aggregate([
        { $group: {
          _id: null,
          missingIds: { $sum: { $cond: [{ $or: [{ $eq: ["$supplierProductCode", null] }, { $eq: ["$supplierProductCode", ""] }] }, 1, 0] } },
          missingNames: { $sum: { $cond: [{ $or: [{ $eq: ["$name", null] }, { $eq: ["$name", ""] }] }, 1, 0] } },
          invalidSellingPrices: { $sum: { $cond: [{ $and: [{ $ne: ["$sellingPrice", null] }, { $lte: ["$sellingPrice", 0] }] }, 1, 0] } },
          invalidBuyingPrices: { $sum: { $cond: [{ $and: [{ $ne: ["$buyingPrice", null] }, { $lt: ["$buyingPrice", 0] }] }, 1, 0] } },
          missingCurrency: { $sum: { $cond: [{ $or: [{ $eq: ["$currency", null] }, { $eq: ["$currency", ""] }] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
          unavailable: { $sum: { $cond: [{ $eq: ["$supplierAvailable", false] }, 1, 0] } },
        } },
        { $project: { _id: 0, missingIds: 1, missingNames: 1, invalidSellingPrices: 1, invalidBuyingPrices: 1, missingCurrency: 1, inactive: 1, unavailable: 1 } },
      ]).toArray(),
    ]);
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "read_only_dry_run",
      planHash,
      database: mongoose.connection.name,
      schemaFindings: {
        mongooseModels: ["Game", "GamePackage", "Order", "Payment", "Admin", "SmmService", "SmmCatalogAudit", "SmmCatalogBackup"],
        hasSmmServiceModel: true,
        catalogSource: "The public /api/smm/services route reads active, validated SmmService records; supplier sync is an explicit admin preview/apply operation. SMM orders remain in orders with serviceType=smm.",
        orderRecordsAreReadOnly: true,
      },
      databaseCollections,
      serviceCollections: collectionInventory,
      supplierRecordAudit: {
        collections: supplierRecordCollections,
        dedicatedSupplierRecordsFound: supplierRecordCollections.length > 0,
        note: supplierRecordCollections.length ? "Supplier records are stored separately; review their identifiers before any supplier cleanup." : "No dedicated supplier-record collection exists in this database; supplier IDs are stored on catalog records and were not changed.",
      },
      serviceRecordCounts: counts,
      records,
      gamePackageAudit: {
        collection: "gamepackages",
        total: gamePackageCount,
        duplicateKeys: duplicatePackageKeys,
        invalidCounts: invalidGamePackageCounts[0] || {
          missingIds: 0,
          missingNames: 0,
          invalidSellingPrices: 0,
          invalidBuyingPrices: 0,
          missingCurrency: 0,
          inactive: 0,
          unavailable: 0,
        },
        modified: false,
        note: "Game top-up packages are a separate catalog and are report-only in this SMM cleanup operation.",
      },
      orderReferences: {
        smmOrderCount,
        referencedServices: [...referencedServiceIds.entries()].map(([serviceId, group]) => ({
          serviceId,
          orderCount: group.count,
          paidOrderCount: group.paidOrders,
          paymentRecordCount: (group.orderNumbers || []).reduce((count, orderNumber) => count + (paymentCounts.get(String(orderNumber)) || 0), 0),
        })),
      },
      safety: {
        databaseWrites: 0,
        deletedRecords: 0,
        ordersChanged: 0,
        paymentsChanged: 0,
        note: "Duplicate, invalid, unavailable, and order-referenced records are report-only until an admin reviews and confirms an apply operation.",
      },
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

    if (applyRequested) {
      if (confirmationHash !== planHash) {
        throw new Error(`Cleanup plan changed after preview. No database changes were made. Current plan hash: ${planHash}`);
      }

      const safeEntries = records.filter((record) => record.collection === "smmservices" && record.safeToAutoNormalize && Object.keys(record.proposedChanges || {}).length > 0);
      if (safeEntries.length > 0) {
        const collection = db.collection("smmservices");
        const backupRows = await collection.find({}).toArray();
        await mkdir(dirname(backupPath), { recursive: true });
        await writeFile(backupPath, JSON.stringify({ generatedAt: new Date().toISOString(), database: mongoose.connection.name, collection: "smmservices", records: backupRows }, null, 2), "utf8");
        const allowedFields = new Set(["name", "description", "category", "platform"]);

        for (const record of safeEntries) {
          const update = Object.fromEntries(Object.entries(record.proposedChanges).filter(([field]) => allowedFields.has(field)));
          if (!Object.keys(update).length) continue;
          const updateFilter = { _id: new mongoose.Types.ObjectId(record.recordId), supplierServiceId: record.supplierServiceId };
          if (record.updatedAt) updateFilter.updatedAt = record.updatedAt;
          const result = await collection.updateOne(
            updateFilter,
            { $set: update }
          );
          if (result.modifiedCount) report.safety.databaseWrites += 1;
        }
        report.safety.backupPath = backupPath;
      }
      report.mode = "confirmed_display_normalization";
      report.safety.note = "A local SMM collection backup was written before changing safe display fields. No records were deleted; supplier IDs, orders, and payments were not changed.";
      await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    }

    console.log(JSON.stringify({
      generatedAt: report.generatedAt,
      database: report.database,
      mode: report.mode,
      planHash,
      serviceCollections: report.serviceCollections,
      supplierRecordAudit: report.supplierRecordAudit,
      serviceRecordCounts: report.serviceRecordCounts,
      databaseCollections,
      gamePackageAudit: {
        total: gamePackageCount,
        duplicateKeyGroups: duplicatePackageKeys.length,
        invalidCounts: report.gamePackageAudit.invalidCounts,
      },
      smmOrderCount,
      referencedServices: report.orderReferences.referencedServices.length,
      databaseWrites: report.safety.databaseWrites,
      reportPath: outputPath,
      ...(report.safety.backupPath ? { backupPath: report.safety.backupPath } : {}),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "Read-only SMM inspection failed.");
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
