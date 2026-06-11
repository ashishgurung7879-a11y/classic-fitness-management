require('dotenv').config();
const { Product } = require('./models/models');
const { pool } = require('./db/mysql');

(async () => {
  try {
    const products = await Product.find({}).limit(5);

    for (const product of products) {
      console.log('PRODUCT:', product.name);
      console.log('imageUrl type:', typeof product.imageUrl);
      console.log('imageUrl length:', product.imageUrl ? String(product.imageUrl).length : 0);
      console.log('imageUrl preview:', String(product.imageUrl || '').slice(0, 120));
      console.log('----------------');
    }
  } finally {
    await pool.end().catch(() => {});
  }
})();
