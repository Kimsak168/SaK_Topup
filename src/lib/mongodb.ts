import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "test";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = (globalThis as unknown as { mongooseCache?: MongooseCache }).mongooseCache || {
  conn: null,
  promise: null,
};

if (!(globalThis as unknown as { mongooseCache?: MongooseCache }).mongooseCache) {
  (globalThis as unknown as { mongooseCache?: MongooseCache }).mongooseCache = cached;
}

/**
 * Sanitizes MongoDB URI for logging (masks credentials)
 */
export function getMaskedMongoUri(uri?: string): string {
  const target = uri || process.env.MONGODB_URI || "";
  return target.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Please set it in your environment variables.");
  }

  // 1. If connection already active, reuse immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // 2. If disconnected or stale, reset cache
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    cached.conn = null;
    cached.promise = null;
  }

  // 3. Initiate connection if no in-flight promise exists
  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000, // Fail fast (5s) instead of stalling requests for 30s
      connectTimeoutMS: 5000,
      socketTimeoutMS: 20000,
      maxPoolSize: 10,
      minPoolSize: 0,
      dbName: MONGODB_DB_NAME,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((m) => {
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        cached.conn = null;
        console.error(
          `[MongoDB] Connection error (${getMaskedMongoUri(MONGODB_URI)}):`,
          err instanceof Error ? err.message : String(err)
        );
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.conn = null;
    throw e;
  }

  return cached.conn;
}