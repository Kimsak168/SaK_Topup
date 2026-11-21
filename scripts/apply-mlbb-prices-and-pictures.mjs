import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mongoose from 'mongoose';

async function updateDb() {
  await mongoose.connect(process.env.MONGODB_URI);

  const updates = [
    {
      code: 'MLBB_Diamond_Pass',
      name: 'Diamond Pass',
      buyingPrice: 0.80,
      sellingPrice: 0.88,
      customImage: '/images/packages/mlbb-diamond-pass.webp'
    },
    {
      code: 'MLBB_Weekly',
      name: 'Weekly',
      buyingPrice: 1.50,
      sellingPrice: 1.76,
      customImage: '/images/packages/mlbb-weekly.webp'
    },
    {
      code: 'MLBB_Weekly_Elite_Pack',
      name: 'Weekly Elite Pack',
      buyingPrice: 0.79,
      sellingPrice: 0.88,
      customImage: '/images/packages/mlbb-weekly-elite-pack.webp'
    },
    {
      code: 'MLBB_Monthly_Elite_Pack',
      name: 'Monthly Elite Pack',
      buyingPrice: 3.85,
      sellingPrice: 4.33,
      customImage: '/images/packages/mlbb-monthly-elite-pack.webp'
    },
    {
      code: 'MLBB_Twilight',
      name: 'Twilight',
      buyingPrice: 7.91,
      sellingPrice: 9.02,
      customImage: '/images/packages/mlbb-twilight.webp'
    },
    {
      code: 'MLBB_275',
      name: '275 Diamonds',
      buyingPrice: 3.70,
      sellingPrice: 4.33,
      customImage: '/images/mlbb-diamond.webp'
    },
    {
      code: 'MLBB_565',
      name: '565 Diamonds',
      buyingPrice: 7.59,
      sellingPrice: 8.86,
      customImage: '/images/mlbb-diamond.webp'
    }
  ];

  for (const dbName of ['Sak_Topup', 'test']) {
    console.log(`Updating DB: ${dbName}...`);
    const db = mongoose.connection.client.db(dbName);

    for (const u of updates) {
      const res = await db.collection('gamepackages').updateOne(
        { supplierProductCode: u.code },
        {
          $set: {
            buyingPrice: u.buyingPrice,
            sellingPrice: u.sellingPrice,
            customImage: u.customImage,
            adminConfigured: true,
            updatedAt: new Date()
          }
        }
      );
      console.log(`  Updated ${u.code} (${u.name}): matched=${res.matchedCount}, modified=${res.modifiedCount}, sellPrice=$${u.sellingPrice}`);
    }

    // Set fallback customImage for any remaining MLBB package without customImage
    const fallbackRes = await db.collection('gamepackages').updateMany(
      {
        gameSlug: 'mlbb',
        isActive: true,
        $or: [
          { customImage: null },
          { customImage: { $exists: false } },
          { customImage: '' }
        ]
      },
      {
        $set: {
          customImage: '/images/mlbb-diamond.webp',
          updatedAt: new Date()
        }
      }
    );
    console.log(`  Fallback customImage set for ${fallbackRes.modifiedCount} MLBB packages.`);
  }

  await mongoose.disconnect();
  console.log('Database updates complete!');
}

updateDb().catch(err => {
  console.error('Update error:', err);
  process.exit(1);
});
