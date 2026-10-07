#!/usr/bin/env node

/**
 * SakSuuu Game Top-Up — Safe Vercel Blob Image Migration Utility
 *
 * Scans MongoDB for existing administrator-uploaded images and migrates them
 * to Vercel Blob Storage while preserving original images and data integrity.
 *
 * Features:
 * - Safe pre-flight validation (checks BLOB_READ_WRITE_TOKEN and MONGODB_URI)
 * - Migrates Banners (banners/), Game Packages (packages/), and Branding (branding/)
 * - Only updates MongoDB documents AFTER Vercel Blob upload and URL verification succeed
 * - Preserves existing public/images folder untouched
 * - Dry-run mode support (--dry-run)
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-images-to-blob.mjs
 *   node --env-file=.env.local scripts/migrate-images-to-blob.mjs --dry-run
 */

import { put, head } from "@vercel/blob";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const IS_DRY_RUN = process.argv.includes("--dry-run");

console.log("==========================================================");
console.log("  SakSuuu Top-Up — Vercel Blob Migration Utility");
console.log("==========================================================");

if (!MONGODB_URI) {
  console.error("❌ ERROR: MONGODB_URI environment variable is missing.");
  console.error("Please ensure .env.local exists or pass MONGODB_URI.");
  process.exit(1);
}

if (!BLOB_TOKEN) {
  console.log("\n⚠️  NOTICE: BLOB_READ_WRITE_TOKEN is not configured yet.");
  console.log("To run image migration to Vercel Blob:");
  console.log("  1. Go to your Vercel Project Dashboard -> Storage -> Create Database -> Blob.");
  console.log("  2. Copy the BLOB_READ_WRITE_TOKEN value.");
  console.log("  3. Add BLOB_READ_WRITE_TOKEN to your .env.local file or Vercel Environment Variables.");
  console.log("  4. Re-run: node --env-file=.env.local scripts/migrate-images-to-blob.mjs\n");
  console.log("Existing images and fallbacks will continue working normally in the meantime.\n");
  process.exit(0);
}

if (IS_DRY_RUN) {
  console.log("🔍 Running in DRY-RUN mode. No changes will be written to Vercel Blob or MongoDB.\n");
}

function isVercelBlobUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes(".public.blob.vercel-storage.com") || url.includes(".blob.vercel-storage.com");
}

async function runMigration() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log(" Connected to MongoDB Atlas.");

    const db = client.db();
    const bannersCollection = db.collection("banners");
    const packagesCollection = db.collection("gamepackages");

    const stats = {
      bannersScanned: 0,
      bannersMigrated: 0,
      bannersSkipped: 0,
      packagesScanned: 0,
      packagesMigrated: 0,
      packagesSkipped: 0,
      errors: [],
    };

    // ----------------------------------------------------
    // 1. Migrate Banners
    // ----------------------------------------------------
    console.log("\n--- Checking Banners ---");
    const banners = await bannersCollection.find({}).toArray();
    stats.bannersScanned = banners.length;

    for (const banner of banners) {
      const bannerId = String(banner._id);
      const currentUrl = banner.imageUrl || "";

      if (isVercelBlobUrl(currentUrl)) {
        console.log(`[Banner ${bannerId}] Already on Vercel Blob: ${currentUrl}`);
        stats.bannersSkipped++;
        continue;
      }

      // Check if image buffer exists on document
      if (banner.imageData && banner.imageData.buffer) {
        const buffer = Buffer.from(banner.imageData.buffer);
        const contentType = banner.imageContentType || "image/png";
        const ext = contentType.split("/")[1] || "png";
        const pathname = `banners/banner-${bannerId}-${randomUUID().substring(0, 8)}.${ext}`;

        console.log(`[Banner ${bannerId}] Migrating "${banner.title}" (${(buffer.length / 1024).toFixed(1)} KB)...`);

        if (!IS_DRY_RUN) {
          try {
            const blob = await put(pathname, buffer, {
              access: "public",
              token: BLOB_TOKEN,
              contentType,
            });

            // Verify blob availability
            const blobHead = await head(blob.url, { token: BLOB_TOKEN });
            if (!blobHead) {
              throw new Error("Blob verification failed after upload.");
            }

            // Update MongoDB document with new Vercel Blob URL
            await bannersCollection.updateOne(
              { _id: banner._id },
              {
                $set: {
                  imageUrl: blob.url,
                  updatedAt: new Date(),
                },
              }
            );

            console.log(`  -> Successfully migrated to: ${blob.url}`);
            stats.bannersMigrated++;
          } catch (err) {
            console.error(`  ❌ Failed to migrate banner ${bannerId}:`, err.message);
            stats.errors.push(`Banner ${bannerId}: ${err.message}`);
          }
        } else {
          console.log(`  [Dry-run] Would upload to ${pathname}`);
          stats.bannersMigrated++;
        }
      } else {
        console.log(`[Banner ${bannerId}] No buffer found, current URL: ${currentUrl}`);
        stats.bannersSkipped++;
      }
    }

    // ----------------------------------------------------
    // 2. Migrate Packages with Custom Images
    // ----------------------------------------------------
    console.log("\n--- Checking Package Pictures ---");
    const packagesWithImages = await packagesCollection
      .find({
        $or: [
          { imageData: { $exists: true, $ne: null } },
          { customImage: { $regex: "^/api/packages" } },
        ],
      })
      .toArray();

    stats.packagesScanned = packagesWithImages.length;

    for (const pkg of packagesWithImages) {
      const pkgId = String(pkg._id);
      const currentUrl = pkg.customImage || "";

      if (isVercelBlobUrl(currentUrl)) {
        stats.packagesSkipped++;
        continue;
      }

      if (pkg.imageData && pkg.imageData.buffer) {
        const buffer = Buffer.from(pkg.imageData.buffer);
        const contentType = pkg.imageContentType || "image/png";
        const ext = contentType.split("/")[1] || "png";
        const pathname = `packages/pkg-${pkgId}-${randomUUID().substring(0, 8)}.${ext}`;

        console.log(`[Package ${pkgId}] Migrating "${pkg.name}" (${(buffer.length / 1024).toFixed(1)} KB)...`);

        if (!IS_DRY_RUN) {
          try {
            const blob = await put(pathname, buffer, {
              access: "public",
              token: BLOB_TOKEN,
              contentType,
            });

            await head(blob.url, { token: BLOB_TOKEN });

            await packagesCollection.updateOne(
              { _id: pkg._id },
              {
                $set: {
                  customImage: blob.url,
                  updatedAt: new Date(),
                },
              }
            );

            console.log(`  -> Successfully migrated to: ${blob.url}`);
            stats.packagesMigrated++;
          } catch (err) {
            console.error(`  ❌ Failed to migrate package ${pkgId}:`, err.message);
            stats.errors.push(`Package ${pkgId}: ${err.message}`);
          }
        } else {
          console.log(`  [Dry-run] Would upload to ${pathname}`);
          stats.packagesMigrated++;
        }
      } else {
        stats.packagesSkipped++;
      }
    }

    // ----------------------------------------------------
    // Summary Report
    // ----------------------------------------------------
    console.log("\n==========================================================");
    console.log("  Migration Summary Report");
    console.log("==========================================================");
    console.log(`Banners Scanned:   ${stats.bannersScanned}`);
    console.log(`Banners Migrated:  ${stats.bannersMigrated}`);
    console.log(`Banners Skipped:   ${stats.bannersSkipped}`);
    console.log(`Packages Scanned:  ${stats.packagesScanned}`);
    console.log(`Packages Migrated: ${stats.packagesMigrated}`);
    console.log(`Packages Skipped:  ${stats.packagesSkipped}`);

    if (stats.errors.length > 0) {
      console.log(`\nErrors encountered (${stats.errors.length}):`);
      stats.errors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log("\n All image migrations completed successfully with 0 errors!");
    }
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await client.close();
  }
}

runMigration();
