import { MongoClient } from 'mongodb';

async function check() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const games = await db.collection('games').find({}).toArray();

  console.log(`Found ${games.length} games in DB.`);
  for (const g of games) {
    for (const field of ['image', 'customImage', 'banner']) {
      const url = g[field];
      if (url && url.startsWith('http')) {
        try {
          const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
          const contentType = res.headers.get('content-type') || '';
          const contentLength = res.headers.get('content-length') || 'unknown';
          const isImage = contentType.startsWith('image/');
          console.log(`[${g.slug}] ${field}: ${url} -> status=${res.status}, type=${contentType}, size=${contentLength}, validImage=${isImage}`);
        } catch (e) {
          console.log(`[${g.slug}] ${field}: ${url} -> FETCH ERROR: ${e.message}`);
        }
      }
    }
  }

  await client.close();
}

check().catch(console.error);
