import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import { Admin, IAdmin } from "@/models/Admin";

const HASH_KEY_LENGTH = 64;

/**
 * Hash a plain password using scrypt with a cryptographically secure random salt
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== "string" || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, HASH_KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain password against a stored scrypt hash using timing-safe comparison
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!password || !storedHash) return false;
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;

    const [salt, keyHex] = parts;
    const key = Buffer.from(keyHex, "hex");
    const derivedKey = scryptSync(password, salt, key.length);

    return timingSafeEqual(key, derivedKey);
  } catch {
    return false;
  }
}

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  name: string;
  role: string;
}

/**
 * Check whether any administrator account exists in MongoDB
 */
export async function hasAnyAdmin(): Promise<boolean> {
  try {
    await connectDB();
    const count = await Admin.countDocuments({ isActive: true });
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Authenticate administrator credentials against MongoDB with environment fallback
 */
export async function authenticateAdmin(
  username?: string,
  password?: string
): Promise<{ success: boolean; user?: AuthenticatedAdmin; error?: string }> {
  if (!username || !password) {
    return { success: false, error: "Username and password are required" };
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  try {
    await connectDB();
    const adminDoc: IAdmin | null = await Admin.findOne({
      username: cleanUser,
      isActive: true,
    });

    if (adminDoc) {
      const isMatch = verifyPassword(cleanPass, adminDoc.passwordHash);
      if (isMatch) {
        // Record last login timestamp (non-blocking)
        Admin.updateOne({ _id: adminDoc._id }, { $set: { lastLoginAt: new Date() } }).exec().catch(() => {});

        return {
          success: true,
          user: {
            id: String(adminDoc._id),
            username: adminDoc.username,
            name: adminDoc.name || "SakSuuu Administrator",
            role: adminDoc.role === "super_admin" ? "Super Admin" : "Admin",
          },
        };
      }
      return { success: false, error: "Invalid username or password" };
    }
  } catch (err) {
    console.error("MongoDB admin authentication check error:", err);
  }

  // Fallback to environment variables if no database admin exists yet
  const envUser = (process.env.ADMIN_USERNAME || "admin").toLowerCase().trim();
  const envPass = process.env.ADMIN_PASSWORD || "saksuuu2025!";

  const isEnvUserMatch = cleanUser === envUser;
  const isEnvPassMatch = cleanPass === envPass;

  if (isEnvUserMatch && isEnvPassMatch) {
    return {
      success: true,
      user: {
        id: "env-admin",
        username: envUser,
        name: "SakSuuu Administrator",
        role: "Super Admin",
      },
    };
  }

  return { success: false, error: "Invalid username or password" };
}

/**
 * Create a new administrator account in MongoDB
 */
export async function createAdminAccount(data: {
  username: string;
  password: string;
  name?: string;
  role?: "super_admin" | "admin";
}): Promise<AuthenticatedAdmin> {
  await connectDB();

  const cleanUser = data.username.trim().toLowerCase();
  if (cleanUser.length < 3) {
    throw new Error("Username must be at least 3 characters long");
  }

  const existing = await Admin.findOne({ username: cleanUser });
  if (existing) {
    throw new Error(`Administrator username "${cleanUser}" already exists`);
  }

  const passwordHash = hashPassword(data.password);
  const created = await Admin.create({
    username: cleanUser,
    passwordHash,
    name: data.name?.trim() || "SakSuuu Administrator",
    role: data.role || "super_admin",
    isActive: true,
  });

  return {
    id: String(created._id),
    username: created.username,
    name: created.name,
    role: created.role === "super_admin" ? "Super Admin" : "Admin",
  };
}

/**
 * Reset an existing administrator's password in MongoDB
 */
export async function resetAdminPassword(
  username: string,
  newPassword: string
): Promise<{ success: boolean; username: string }> {
  await connectDB();

  const cleanUser = username.trim().toLowerCase();
  const adminDoc = await Admin.findOne({ username: cleanUser });

  if (!adminDoc) {
    throw new Error(`Administrator "${cleanUser}" not found in database`);
  }

  const passwordHash = hashPassword(newPassword);
  await Admin.updateOne(
    { _id: adminDoc._id },
    {
      $set: {
        passwordHash,
        updatedAt: new Date(),
      },
    }
  );

  return { success: true, username: cleanUser };
}
