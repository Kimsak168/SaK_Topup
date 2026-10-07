// Read-only target check. Never writes to MongoDB or prints credentials.
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing");
const target = new URL(uri);
const dbName = process.env.MONGODB_DB_NAME || "test";
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  readPreference: "secondaryPreferred",
});

console.log(JSON.stringify({
  host: target.host,
  uriDatabase: target.pathname.slice(1) || null,
  applicationDatabase: dbName,
}));

try {
  await client.connect();
  const db = client.db(dbName);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  for (const collection of collections) {
    counts[collection.name] = await db.collection(collection.name).estimatedDocumentCount();
  }
  console.log(JSON.stringify({ connectedDatabase: db.databaseName, collections: counts }));
  const raw = await db.collection("games").findOne({}, { raw: true });
  console.log(JSON.stringify({ rawBsonAvailable: Buffer.isBuffer(raw), sampleBytes: Buffer.isBuffer(raw) ? raw.length : null }));
} finally {
  await client.close();
}
