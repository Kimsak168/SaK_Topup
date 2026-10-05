import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || "test");
  const banners = await db.collection("banners")
    .find({}, { projection: { title: 1, imageUrl: 1, isActive: 1, sortOrder: 1 } })
    .sort({ sortOrder: 1, createdAt: -1 })
    .toArray();

  console.log(`Banner records: ${banners.length}; active: ${banners.filter((banner) => banner.isActive === true).length}`);

  for (const banner of banners) {
    const label = `slot=${banner.sortOrder} id=${banner._id} active=${banner.isActive === true}`;
    if (!banner.imageUrl) {
      console.log(`${label} imageUrl=missing`);
      continue;
    }

    const imageUrl = new URL(banner.imageUrl, process.env.NEXT_PUBLIC_APP_URL);
    try {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      const type = response.headers.get("content-type") || "unknown";
      await response.body?.cancel();
      console.log(`${label} imageHost=${imageUrl.host} status=${response.status} type=${type}`);
    } catch (error) {
      console.log(`${label} imageHost=${imageUrl.host} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await client.close();
}
