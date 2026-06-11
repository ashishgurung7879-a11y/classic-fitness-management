require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const products = await mongoose.connection.db
    .collection('products')
    .find({})
    .limit(5)
    .toArray();

  for (const p of products) {
    console.log('PRODUCT:', p.name);
    console.log('imageUrl type:', typeof p.imageUrl);
    console.log('imageUrl length:', p.imageUrl ? String(p.imageUrl).length : 0);
    console.log('imageUrl preview:', String(p.imageUrl || '').slice(0, 120));
    console.log('----------------');
  }

  process.exit(0);
})();