import { MongoClient } from "mongodb";

async function disableVngzz2() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();

    // 1. Disable all games from supplier vngzz2
    const gamesResult = await db.collection("games").updateMany(
      { supplier: "vngzz2" },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    console.log(`Disabled ${gamesResult.modifiedCount} VngZz2 games (matched ${gamesResult.matchedCount}).`);

    // 2. Disable all packages from supplier vngzz2
    const pkgsResult = await db.collection("gamepackages").updateMany(
      { supplier: "vngzz2" },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    console.log(`Disabled ${pkgsResult.modifiedCount} VngZz2 packages (matched ${pkgsResult.matchedCount}).`);

    // 3. Count remaining active games
    const activeGamesCount = await db.collection("games").countDocuments({ isActive: true });
    console.log(`Active games remaining on storefront: ${activeGamesCount}`);
  } finally {
    await client.close();
  }
}

disableVngzz2().catch(console.error);
