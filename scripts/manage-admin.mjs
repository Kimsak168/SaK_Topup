#!/usr/bin/env node

/**
 * SakSuuu Administrator Account CLI Management Tool
 *
 * Secure CLI to create initial administrator credentials or reset forgotten passwords in MongoDB.
 * Passwords are securely hashed using scrypt with a cryptographically random salt.
 * Plaintext passwords are never logged or stored.
 *
 * Usage:
 *   node --env-file=.env.local scripts/manage-admin.mjs
 *   node --env-file=.env.local scripts/manage-admin.mjs --username=admin --password=YourSecurePassword
 *   node --env-file=.env.local scripts/manage-admin.mjs --reset --username=admin --password=NewSecurePassword
 */

import readline from "node:readline";
import { scryptSync, randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("\n❌ [ERROR] MONGODB_URI is not set. Please ensure .env.local exists with your database connection string.");
  process.exit(1);
}

// Scrypt password hashing
function hashPassword(password) {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    reset: false,
    username: "",
    password: "",
    help: false,
  };

  for (const arg of args) {
    if (arg === "--reset" || arg === "-r") {
      options.reset = true;
    } else if (arg.startsWith("--username=")) {
      options.username = arg.slice("--username=".length).trim();
    } else if (arg.startsWith("-u=")) {
      options.username = arg.slice(3).trim();
    } else if (arg.startsWith("--password=")) {
      options.password = arg.slice("--password=".length);
    } else if (arg.startsWith("-p=")) {
      options.password = arg.slice(3);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

// Interactive prompt helper
function promptQuestion(rl, questionText) {
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
SakSuuu Administrator Management Tool
======================================
Usage:
  Interactive Mode:
    node --env-file=.env.local scripts/manage-admin.mjs

  Non-Interactive Setup:
    node --env-file=.env.local scripts/manage-admin.mjs --username=admin --password=YourPassword

  Reset Password:
    node --env-file=.env.local scripts/manage-admin.mjs --reset --username=admin --password=YourNewPassword
    `);
    process.exit(0);
  }

  console.log("\n🔐 SakSuuu Admin Security Manager");
  console.log("----------------------------------");

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const adminCollection = db.collection("admins");

    // Check existing accounts
    const existingAdmins = await adminCollection.find({}, { projection: { passwordHash: 0 } }).toArray();
    const adminCount = existingAdmins.length;

    console.log(`📡 Connected to MongoDB database: "${db.databaseName}"`);
    console.log(`👤 Existing administrator accounts: ${adminCount}`);

    if (adminCount > 0) {
      console.log(`   Found users: ${existingAdmins.map((a) => `"${a.username}" (${a.role || "super_admin"})`).join(", ")}`);
    }

    let rl;
    if (!options.username || !options.password) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }

    let username = options.username;
    let password = options.password;
    let isReset = options.reset;

    if (!username) {
      if (adminCount > 0 && !isReset) {
        const action = await promptQuestion(
          rl,
          "\nChoose action:\n  [1] Create a new administrator\n  [2] Reset an existing administrator password\nSelect (1 or 2): "
        );
        if (action === "2") {
          isReset = true;
        }
      }

      username = await promptQuestion(rl, `\nEnter Administrator Username (min 3 chars): `);
    }

    username = username.toLowerCase().trim();
    if (!username || username.length < 3) {
      console.error("\n❌ [ERROR] Username must be at least 3 characters.");
      if (rl) rl.close();
      await client.close();
      process.exit(1);
    }

    const existingUser = await adminCollection.findOne({ username });

    if (existingUser && !isReset) {
      if (!options.password) {
        const shouldReset = await promptQuestion(
          rl,
          `\n⚠️  User "${username}" already exists. Would you like to reset their password instead? (y/n): `
        );
        if (shouldReset.toLowerCase() !== "y" && shouldReset.toLowerCase() !== "yes") {
          console.log("\nAborted. Existing account left unchanged.");
          if (rl) rl.close();
          await client.close();
          process.exit(0);
        }
        isReset = true;
      } else {
        console.error(`\n❌ [ERROR] Administrator "${username}" already exists. Use --reset to update their password.`);
        if (rl) rl.close();
        await client.close();
        process.exit(1);
      }
    }

    if (!existingUser && isReset) {
      console.error(`\n❌ [ERROR] Cannot reset password: User "${username}" does not exist in the database.`);
      if (rl) rl.close();
      await client.close();
      process.exit(1);
    }

    if (!password) {
      password = await promptQuestion(rl, `Enter Password for "${username}" (min 6 chars): `);
      const confirmPass = await promptQuestion(rl, `Confirm Password: `);

      if (password !== confirmPass) {
        console.error("\n❌ [ERROR] Passwords do not match. Please try again.");
        if (rl) rl.close();
        await client.close();
        process.exit(1);
      }
    }

    if (!password || password.length < 6) {
      console.error("\n❌ [ERROR] Password must be at least 6 characters.");
      if (rl) rl.close();
      await client.close();
      process.exit(1);
    }

    if (rl) rl.close();

    // Securely hash password using scrypt
    const passwordHash = hashPassword(password);

    if (isReset) {
      // Update existing admin
      await adminCollection.updateOne(
        { username },
        {
          $set: {
            passwordHash,
            updatedAt: new Date(),
          },
        }
      );
      console.log(`\n✅ [SUCCESS] Password for administrator "${username}" has been successfully updated.`);
      console.log(`   You can now log in at: http://localhost:3000/admin/login`);
    } else {
      // Create new admin
      await adminCollection.insertOne({
        username,
        passwordHash,
        name: "SakSuuu Administrator",
        role: "super_admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`\n✅ [SUCCESS] Initial administrator "${username}" created successfully in MongoDB.`);
      console.log(`   Role: Super Admin`);
      console.log(`   You can now log in at: http://localhost:3000/admin/login`);
    }

    console.log("----------------------------------");
    console.log("🔒 Credentials hashed with scrypt. Plaintext passwords were not logged.");
    console.log("");
  } catch (err) {
    console.error("\n❌ [ERROR] Database operation failed:", err.message);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
