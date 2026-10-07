// Read-only Atlas backup for the package audit. Produces mongorestore-compatible
// BSON streams and metadata, then validates every saved document and checksum.
// The destination is gitignored; this script never inserts, updates, or deletes.
import { MongoClient } from "mongodb";
import { BSON, EJSON } from "bson";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { join, resolve } from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing");
const dbName = process.env.MONGODB_DB_NAME || "test";
const host = new URL(uri).host;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const root = resolve(process.cwd(), ".local-backups");
const name = `package-audit-${stamp}-${randomBytes(3).toString("hex")}`;
const partial = join(root, `${name}.partial`);
const destination = join(root, name);
const dumpDirectory = join(partial, "dump", dbName);
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  readPreference: "secondaryPreferred",
});

await mkdir(partial, { recursive: false }).catch(async (error) => {
  if (error.code !== "ENOENT") throw error;
  await mkdir(root, { recursive: true });
  await mkdir(partial);
});
await mkdir(dumpDirectory, { recursive: true });

try {
  await client.connect();
  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();
  const manifest = {
    format: "mongorestore-bson-and-metadata-v1",
    dumpDirectory: "dump",
    source: { host, database: db.databaseName },
    startedAt: new Date().toISOString(),
    collections: {},
  };

  for (const info of collections) {
    if (info.type !== "collection") continue;
    const collection = db.collection(info.name);
    const indexes = await collection.listIndexes().toArray();
    await writeFile(join(dumpDirectory, `${info.name}.metadata.json`),
      EJSON.stringify({ options: info.options || {}, indexes }, null, 2));

    const file = join(dumpDirectory, `${info.name}.bson`);
    const stream = createWriteStream(file, { flags: "wx" });
    const digest = createHash("sha256");
    let count = 0;
    let bytes = 0;
    try {
      for await (const raw of collection.find({}, { raw: true, batchSize: 100 })) {
        if (!Buffer.isBuffer(raw)) throw new Error(`Raw BSON unavailable for ${info.name}`);
        if (raw.length < 5 || raw.readInt32LE(0) !== raw.length || raw[raw.length - 1] !== 0)
          throw new Error(`Invalid BSON from ${info.name}`);
        const doc = BSON.deserialize(raw);
        if (doc._id === undefined) throw new Error(`Document missing _id in ${info.name}`);
        digest.update(raw);
        if (!stream.write(raw)) await once(stream, "drain");
        count += 1;
        bytes += raw.length;
      }
    } finally {
      stream.end();
      await finished(stream);
    }
    manifest.collections[info.name] = {
      count, bytes, sha256: digest.digest("hex"), indexes: indexes.length,
    };
  }

  // Verify the persisted files, including document boundaries, BSON decoding,
  // unique _ids, per-collection counts, and SHA-256 checksums.
  for (const [name, expected] of Object.entries(manifest.collections)) {
    const data = await readFile(join(dumpDirectory, `${name}.bson`));
    if (data.length !== expected.bytes) throw new Error(`Byte count mismatch: ${name}`);
    if (createHash("sha256").update(data).digest("hex") !== expected.sha256)
      throw new Error(`Checksum mismatch: ${name}`);
    EJSON.parse(await readFile(join(dumpDirectory, `${name}.metadata.json`), "utf8"));
    const ids = new Set();
    let offset = 0;
    let count = 0;
    while (offset < data.length) {
      const length = data.readInt32LE(offset);
      if (length < 5 || offset + length > data.length)
        throw new Error(`Truncated BSON in ${name} at ${offset}`);
      const doc = BSON.deserialize(data.subarray(offset, offset + length));
      const id = EJSON.stringify(doc._id);
      if (ids.has(id)) throw new Error(`Duplicate _id in backup: ${name}`);
      ids.add(id);
      count += 1;
      offset += length;
    }
    if (count !== expected.count) throw new Error(`Document count mismatch: ${name}`);
    const sourceCount = await db.collection(name).countDocuments();
    if (sourceCount !== count) throw new Error(`Source count changed during backup: ${name}`);
  }
  manifest.verifiedAt = new Date().toISOString();
  manifest.verification = "Persisted BSON decoded; boundaries, unique IDs, counts, metadata, and SHA-256 verified";
  await writeFile(join(partial, "manifest.json"), JSON.stringify(manifest, null, 2));
  await rename(partial, destination);
  console.log(JSON.stringify({ backup: destination, ...manifest }, null, 2));
} finally {
  await client.close();
}
