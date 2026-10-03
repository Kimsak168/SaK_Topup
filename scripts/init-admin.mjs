#!/usr/bin/env node

/**
 * SakSuuu One-Time Administrator Initialization Script
 *
 * Reads ADMIN_SETUP_USERNAME and ADMIN_SETUP_PASSWORD from .env.local.
 * Hashes the password using scrypt with a cryptographically secure 16-byte random salt.
 * Inserts the initial administrator account into MongoDB.
 * Does NOT overwrite existing administrators.
 * Plaintext passwords are never logged or stored.
 */

import { scryptSync, randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const setupUsername = (process.env.ADMIN_SETUP_USERNAME || "").trim().toLowerCase();
const setupPassword = process.env.ADMIN_SETUP_PASSWORD || "";

if (!MONGODB_URI) {
  console.error("\n❌ [ERROR] MONGODB_URI is not set. Ensure .env.local contains your MongoDB connection string.");
  process.exit(1);
}

// Scrypt password hashing matching adminService.ts
function hashPassword(password) {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  console.log("\n🔐 SakSuuu One-Time Administrator Initialization");
  console.log("-------------------------------------------------");

  if (!setupUsername || !setupPassword) {
    console.error("\n❌ [ERROR] Missing setup credentials in .env.local.");
    console.error("   Please ensure both variables are defined in .env.local:");
    console.error("     ADMIN_SETUP_USERNAME=your_username");
    console.error("     ADMIN_SETUP_PASSWORD=your_password\n");
    process.exit(1);
  }

  if (setupUsername.length < 3) {
    console.error("\n❌ [ERROR] ADMIN_SETUP_USERNAME must be at least 3 characters.");
    process.exit(1);
  }

  if (setupPassword.length < 6) {
    console.error("\n❌ [ERROR] ADMIN_SETUP_PASSWORD must be at least 6 characters.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const adminCollection = db.collection("admins");

    // 5. Do not overwrite an existing administrator.
    const existingAny = await adminCollection.countDocuments();
    if (existingAny > 0) {
      const existingUser = await adminCollection.findOne({ username: setupUsername });
      if (existingUser) {
        console.log(`\n⚠️  [SKIPPED] Administrator "${setupUsername}" already exists in MongoDB.`);
      } else {
        console.log(`\n⚠️  [SKIPPED] ${existingAny} administrator account(s) already exist in MongoDB.`);
      }
      console.log("   Existing administrator records were preserved and NOT overwritten.\n");
      await client.close();
      process.exit(0);
    }

    // 3. Hash the password before saving it to MongoDB
    const passwordHash = hashPassword(setupPassword);

    // 4. Insert initial administrator
    await adminCollection.insertOne({
      username: setupUsername,
      passwordHash,
      name: "SakSuuu Administrator",
      role: "super_admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Ensure unique index on username
    await adminCollection.createIndex({ username: 1 }, { unique: true });

    console.log(`\n✅ [SUCCESS] Initial administrator "${setupUsername}" created in MongoDB.`);
    console.log(`   Collection: "admins"`);
    console.log(`   Role: Super Admin`);
    console.log(`   Session Security: AUTH_SECRET`);
    console.log("-------------------------------------------------");
    console.log("\n⚠️  [IMPORTANT SECURITY STEP]");
    console.log("   Now remove ADMIN_SETUP_USERNAME and ADMIN_SETUP_PASSWORD from .env.local.");
    console.log("   Your credentials are now securely hashed and stored in MongoDB.");
    console.log("\n🚀 You can now log in at: http://localhost:3000/admin/login\n");
  } catch (err) {
    console.error("\n❌ [ERROR] Failed to initialize administrator:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Fatal initialization error:", err);
  process.exit(1);
});
