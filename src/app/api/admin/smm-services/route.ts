import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { escapeSearchRegex, getAdminPagination } from "@/lib/adminQuery";
import {
  applySmmCleanup,
  applySmmSupplierSync,
  getSmmAdminStats,
  getSmmCleanupPlan,
  isSmmServiceActivatable,
  previewSmmSupplierSync,
} from "@/lib/services/smmCatalogService";
import { SmmCatalogAudit } from "@/models/SmmCatalogAudit";
import { SmmService } from "@/models/SmmService";
import { invalidateSmmCatalogueCache } from "@/lib/services/cacheService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function responseError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function getDuplicateServiceRecordIds() {
  const [bySupplierId, byFingerprint] = await Promise.all([
    SmmService.aggregate([
      { $match: { supplier: "vngzz2", supplierServiceId: { $type: "string", $ne: "" } } },
      { $group: { _id: "$supplierServiceId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
      { $unwind: "$ids" },
      { $project: { _id: "$ids" } },
    ]),
    SmmService.aggregate([
      { $match: { supplier: "vngzz2", fingerprint: { $type: "string", $ne: "" } } },
      { $group: { _id: "$fingerprint", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
      { $unwind: "$ids" },
      { $project: { _id: "$ids" } },
    ]),
  ]);
  return [...new Set([...bySupplierId, ...byFingerprint].map((row: { _id: unknown }) => String(row._id)))];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const params = req.nextUrl.searchParams;
    const { page, limit } = getAdminPagination(params, 25, 100);
    const search = escapeSearchRegex((params.get("search") || "").trim().slice(0, 100));
    const platform = (params.get("platform") || "all").toLowerCase();
    const status = (params.get("status") || "all").toLowerCase();
    const filter: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    let duplicateCandidateIds: string[] | null = null;

    if (["tiktok", "telegram", "facebook", "instagram", "youtube", "other"].includes(platform)) filter.platform = platform;
    if (status === "active") filter.isActive = true;
    else if (status === "inactive") filter.isActive = false;
    else if (status === "unavailable") filter.supplierAvailable = false;
    else if (status === "review") and.push({ $or: [{ requiresReview: true }, { reviewFlags: { $ne: [] } }] });
    else if (status === "invalid") and.push({ $or: [
      { name: "" }, { name: { $exists: false } }, { rate: { $not: { $type: "number" } } }, { rate: { $lte: 0 } }, { rate: { $gt: Number.MAX_SAFE_INTEGER } },
      { min: { $not: { $type: "number" } } }, { min: { $lte: 0 } }, { min: { $not: { $mod: [1, 0] } } },
      { max: { $not: { $type: "number" } } }, { max: { $not: { $mod: [1, 0] } } },
      { supplierServiceId: "" }, { supplierServiceId: { $exists: false } },
      { $expr: { $lt: ["$max", "$min"] } },
    ] });
    else if (status === "duplicate") {
      duplicateCandidateIds = await getDuplicateServiceRecordIds();
      filter._id = { $in: duplicateCandidateIds };
    }
    if (search) and.push({ $or: [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
      { platform: { $regex: search, $options: "i" } },
      { supplierServiceId: { $regex: search, $options: "i" } },
    ] });
    if (and.length) filter.$and = and;

    const [total, rows, stats, audit] = await Promise.all([
      SmmService.countDocuments(filter),
      SmmService.find(filter).select("+rate +sourceCategory +sourceDescription").sort({ platform: 1, serviceType: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      getSmmAdminStats(),
      SmmCatalogAudit.find({}).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const invalidServiceFilter = { $or: [
      { name: "" }, { name: { $exists: false } }, { rate: { $not: { $type: "number" } } }, { rate: { $lte: 0 } }, { rate: { $gt: Number.MAX_SAFE_INTEGER } },
      { min: { $not: { $type: "number" } } }, { min: { $lte: 0 } }, { min: { $not: { $mod: [1, 0] } } },
      { max: { $not: { $type: "number" } } }, { max: { $not: { $mod: [1, 0] } } },
      { supplierServiceId: "" }, { supplierServiceId: { $exists: false } },
      { $expr: { $lt: ["$max", "$min"] } },
    ] } as never;
    const [duplicateIds, invalid] = await Promise.all([
      duplicateCandidateIds ? Promise.resolve(duplicateCandidateIds) : getDuplicateServiceRecordIds(),
      SmmService.countDocuments(invalidServiceFilter),
    ]);
    const needsReviewFilter = { $or: [
      { requiresReview: true }, { reviewFlags: { $ne: [] } },
      { name: "" }, { name: { $exists: false } }, { rate: { $not: { $type: "number" } } }, { rate: { $lte: 0 } }, { rate: { $gt: Number.MAX_SAFE_INTEGER } },
      { min: { $not: { $type: "number" } } }, { min: { $lte: 0 } }, { min: { $not: { $mod: [1, 0] } } },
      { max: { $not: { $type: "number" } } }, { max: { $not: { $mod: [1, 0] } } },
      { supplierServiceId: "" }, { supplierServiceId: { $exists: false } },
      { $expr: { $lt: ["$max", "$min"] } },
    ] } as never;
    const needsReview = await SmmService.countDocuments(needsReviewFilter);
    return NextResponse.json({
      success: true,
      stats: { ...stats, duplicateCandidates: duplicateIds.length, invalid, needsReview },
      services: rows.map((row) => ({
        id: String(row._id),
        supplierServiceId: row.supplierServiceId,
        name: row.name,
        platform: row.platform,
        serviceType: row.serviceType,
        category: row.category,
        description: row.description || "",
        sourceCategory: row.sourceCategory || "",
        sourceDescription: row.sourceDescription || "",
        rate: row.rate,
        min: row.min,
        max: row.max,
        refill: row.refill,
        supplierAvailable: row.supplierAvailable,
        isActive: row.isActive,
        isValid: isSmmServiceActivatable(row as never) && Boolean(
          row.category && ["tiktok", "telegram", "facebook", "instagram", "youtube", "other"].includes(row.platform) &&
          ["followers", "likes", "views", "comments", "shares", "other"].includes(row.serviceType) && row.fingerprint
        ),
        duplicateCandidate: duplicateIds.includes(String(row._id)),
        requiresReview: row.requiresReview,
        reviewFlags: row.reviewFlags || [],
        syncedAt: row.syncedAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      audit: audit.map((entry) => ({
        action: entry.action,
        actor: entry.actor,
        planHash: entry.planHash,
        summary: entry.summary,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error: unknown) {
    console.error("Admin SMM services GET error:", error);
    return responseError("Failed to load SMM service management data", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  let catalogueMayHaveChanged = false;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string") {
      return responseError("Invalid SMM catalog action.");
    }
    const actor = auth.session.username || auth.session.name || "admin";

    if (body.action === "preview-sync") {
      const plan = await previewSmmSupplierSync(true);
      return NextResponse.json({ success: true, plan });
    }
    if (body.action === "apply-sync") {
      if (body.confirmation !== "SYNC REAL SUPPLIER CATALOG" || typeof body.planHash !== "string" || !/^[a-f\d]{64}$/i.test(body.planHash)) {
        return responseError("Preview the sync and enter the exact confirmation phrase before applying.");
      }
      catalogueMayHaveChanged = true;
      const result = await applySmmSupplierSync(actor, body.planHash);
      return NextResponse.json({ success: !result.conflict, ...result }, { status: result.conflict ? 409 : 200 });
    }
    if (body.action === "preview-cleanup") {
      const plan = await getSmmCleanupPlan();
      return NextResponse.json({ success: true, plan });
    }
    if (body.action === "apply-cleanup") {
      if (body.confirmation !== "APPLY SMM CLEANUP" || typeof body.planHash !== "string" || !/^[a-f\d]{64}$/i.test(body.planHash)) {
        return responseError("Preview the cleanup and enter the exact confirmation phrase before applying.");
      }
      catalogueMayHaveChanged = true;
      const result = await applySmmCleanup(actor, body.planHash);
      return NextResponse.json({ success: !result.conflict, ...result }, { status: result.conflict ? 409 : 200 });
    }
    if (body.action === "bulk-status") {
      if (body.status !== "active" && body.status !== "inactive") return responseError("Choose active or inactive status.");
      if (!Array.isArray(body.serviceIds) || body.serviceIds.length < 1 || body.serviceIds.length > 250 ||
        body.serviceIds.some((id: unknown) => typeof id !== "string" || !mongoose.isValidObjectId(id))) {
        return responseError("Select between 1 and 250 valid catalog records.");
      }
      await connectDB();
      const ids = [...new Set(body.serviceIds as string[])];
      const selected = await SmmService.find({ _id: { $in: ids } }).select("+rate");
      if (selected.length !== ids.length) return responseError("One or more selected services no longer exist.", 409);
      if (body.status === "active" && selected.some((service) => !isSmmServiceActivatable(service as never))) {
        return responseError("Some selected services are unavailable, invalid, or need review. Resolve their issues before activation.", 409);
      }
      if (body.status === "active") {
        const duplicateFingerprints = await SmmService.aggregate([
          { $match: { fingerprint: { $in: selected.map((service) => service.fingerprint) } } },
          { $group: { _id: "$fingerprint", count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
        ]);
        if (duplicateFingerprints.length) return responseError("Duplicate service candidates must be resolved before activation.", 409);
      }
      catalogueMayHaveChanged = true;
      for (const service of selected) {
        service.isActive = body.status === "active";
        await service.save();
      }
      await SmmCatalogAudit.create({
        action: body.status === "active" ? "bulk_activate" : "bulk_deactivate",
        actor,
        summary: { selected: ids.length, changed: selected.length },
      });
      return NextResponse.json({ success: true, changed: selected.length });
    }
    return responseError("Unsupported SMM catalog action.");
  } catch (error: unknown) {
    console.error("Admin SMM services POST error:", error);
    return responseError(error instanceof Error ? error.message : "SMM catalog action failed", 500);
  } finally {
    // Bulk writes can partially succeed before an error. Expire public results
    // in that case too, so deactivated services and old rates aren't retained.
    if (catalogueMayHaveChanged) invalidateSmmCatalogueCache();
  }
}
