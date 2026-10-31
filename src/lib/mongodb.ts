import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const isProduction = process.env.NODE_ENV === "production";
const INVALID_DATABASE_NAME_CHARACTERS = ["/", "\\", ".", '"', "$", "*", "<", ">", ":", "|", "?", "\0"];

function resolveDatabaseName(): string {
  const configuredDatabaseName = process.env.MONGODB_DB_NAME;
  if (!configuredDatabaseName || !configuredDatabaseName.trim()) {
    if (isProduction) {
      throw new Error(
        "MONGODB_DB_NAME is required in Production. Set it to the confirmed MongoDB database name."
      );
    }
    return "test";
  }

  const hasReservedCharacters = INVALID_DATABASE_NAME_CHARACTERS.some((character) =>
    configuredDatabaseName.includes(character)
  );
  if (
    configuredDatabaseName !== configuredDatabaseName.trim() ||
    hasReservedCharacters ||
    Buffer.byteLength(configuredDatabaseName, "utf8") >= 64
  ) {
    throw new Error(
      "MONGODB_DB_NAME is invalid. Use a MongoDB database name under 64 bytes without reserved characters or surrounding whitespace."
    );
  }

  return configuredDatabaseName;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = (globalThis as unknown as { mongooseCache?: MongooseCache }).mongooseCache || {
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
  const databaseName = resolveDatabaseName();

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Please set it in your environment variables.");
  }

  // 1. If connection already active, reuse immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // 2. If disconnected or stale, reset cache
  if (cached.conn && mongoose.connection.readyState === 0) {
    cached.conn = null;
    cached.promise = null;
  }

  // 3. Initiate connection if no in-flight promise exists
  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      autoIndex: false, // Indexes are maintained explicitly, never during a public request.
      serverSelectionTimeoutMS: 10000, // Allow cold Vercel functions time to establish Atlas connections.
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      maxPoolSize: 10,
      minPoolSize: 0,
      dbName: databaseName,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((m) => {
        return m;
      })
      .catch((error: unknown) => {
        cached.promise = null;
        cached.conn = null;
        // Log only safe error metadata; driver messages can contain connection details.
        const details = error && typeof error === "object"
          ? error as { name?: unknown; code?: unknown }
          : {};
        const name = typeof details.name === "string" ? details.name : "UnknownError";
        const code = typeof details.code === "string" || typeof details.code === "number"
          ? details.code
          : undefined;
        console.error("[MongoDB] Connection failed.", { name, ...(code === undefined ? {} : { code }) });
        throw new Error("MongoDB connection failed. Verify MONGODB_URI and Atlas Network Access.");
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
