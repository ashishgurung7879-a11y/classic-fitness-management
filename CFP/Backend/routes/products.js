// ============================================================
// PRODUCTS ROUTE — Full CRUD with validation (MySQL only)
// ============================================================
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const express = require('express');
const r = express.Router();
const { protect, authorize } = require('../middleware/auth');

function normalizeProductPayload(body = {}) {
  const price = Number(body.price || 0);
  const salePrice = body.salePrice === '' || body.salePrice === null || body.salePrice === undefined
    ? null : Number(body.salePrice);
  const stock = Number(body.stock ?? 0);
  return {
    name: String(body.name || '').trim(),
    price,
    salePrice: Number.isFinite(salePrice) ? salePrice : null,
    description: String(body.description || '').trim(),
    category: body.category || 'other',
    emoji: String(body.emoji || '💊').trim() || '💊',
    imageUrl: String(body.imageUrl || '').trim(),
    badge: String(body.badge || '').trim(),
    stock: Number.isFinite(stock) ? stock : 0,
    isActive: body.isActive === false || body.isActive === 'false' ? false : true,
    ratingAvg: Number(body.rating?.avg ?? 4.5) || 4.5,
    ratingCount: Number(body.rating?.count ?? 0) || 0,
  };
}

function mapProductRow(row) {
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    name: row.name || '',
    price: Number(row.price || 0),
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    description: row.description || '',
    category: row.category || 'other',
    emoji: row.emoji || '💊',
    imageUrl: row.image_url || '',
    badge: row.badge || '',
    stock: Number(row.stock || 0),
    isActive: !!row.is_active,
    rating: {
      avg: Number(row.rating_avg || 4.5),
      count: Number(row.rating_count || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET all products (public) ─────────────────────────────────
r.get('/', async (req, res) => {
  try {
    const { cat, search } = req.query;
    const whereClauses = ['p.is_active = 1'];
    const params = [];

    if (cat && cat !== 'all') {
      whereClauses.push('p.category = ?');
      params.push(cat);
    }

    if (search) {
      whereClauses.push('p.name LIKE ?');
      params.push(`%${search}%`);
    }

    const rows = await query(
      `SELECT * FROM products p WHERE ${whereClauses.join(' AND ')} ORDER BY p.created_at DESC`,
      params
    );

    console.info('[GET /api/products] returning', rows.length, 'active products');
    res.json({ success: true, products: rows.map(mapProductRow) });
  } catch (err) {
    console.error('[GET /api/products] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET all products (admin) ──────────────────────────────────
r.get('/admin/all', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ success: true, products: rows.map(mapProductRow) });
  } catch (err) {
    console.error('[GET /api/products/admin/all] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET single product (public) ───────────────────────────────
r.get('/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM products WHERE (mongo_id = ? OR id = ?) LIMIT 1',
      [req.params.id, Number(req.params.id) || 0]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: mapProductRow(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST add product (admin) ──────────────────────────────────
r.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    const { name, price, category, salePrice, stock } = payload;
    if (!name || !price || !category) {
      return res.status(400).json({ success: false, message: 'Name, price and category are required' });
    }
    if (salePrice !== null && salePrice >= price) {
      return res.status(400).json({ success: false, message: 'Sale price must be lower than regular price' });
    }
    if (stock < 0) {
      return res.status(400).json({ success: false, message: 'Stock cannot be negative' });
    }

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO products (mongo_id, name, price, sale_price, description, category, emoji, image_url, badge, stock, is_active, rating_avg, rating_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [mongoId, payload.name, payload.price, payload.salePrice, payload.description, payload.category,
       payload.emoji, payload.imageUrl, payload.badge, payload.stock, payload.isActive ? 1 : 0,
       payload.ratingAvg, payload.ratingCount]
    );

    const rows = await query('SELECT * FROM products WHERE mongo_id = ? LIMIT 1', [mongoId]);
    const product = mapProductRow(rows[0]);

    console.info('[POST /api/products] created product', { id: product._id, name: product.name, isActive: product.isActive });
    res.status(201).json({ success: true, message: '✅ Product added!', product });
  } catch (err) {
    console.error('[POST /api/products] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT update product (admin) ────────────────────────────────
r.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    if (payload.salePrice !== null && payload.salePrice >= payload.price) {
      return res.status(400).json({ success: false, message: 'Sale price must be lower than regular price' });
    }
    if (payload.stock < 0) {
      return res.status(400).json({ success: false, message: 'Stock cannot be negative' });
    }

    const result = await query(
      `UPDATE products SET name=?, price=?, sale_price=?, description=?, category=?, emoji=?, image_url=?,
       badge=?, stock=?, is_active=?, rating_avg=?, rating_count=?, updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [payload.name, payload.price, payload.salePrice, payload.description, payload.category,
       payload.emoji, payload.imageUrl, payload.badge, payload.stock, payload.isActive ? 1 : 0,
       payload.ratingAvg, payload.ratingCount, req.params.id, Number(req.params.id) || 0]
    );

    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Product not found' });

    const rows = await query(
      'SELECT * FROM products WHERE (mongo_id=? OR id=?) LIMIT 1',
      [req.params.id, Number(req.params.id) || 0]
    );
    const product = mapProductRow(rows[0]);

    console.info('[PUT /api/products/:id] updated product', { id: product._id, name: product.name, isActive: product.isActive });
    res.json({ success: true, message: '✅ Product updated!', product });
  } catch (err) {
    console.error('[PUT /api/products/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH update stock (admin) ────────────────────────────────
r.patch('/:id/stock', protect, authorize('admin'), async (req, res) => {
  try {
    const stock = Number(req.body?.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      return res.status(400).json({ success: false, message: 'Stock must be a non-negative number' });
    }

    const result = await query(
      'UPDATE products SET stock=?, updated_at=NOW() WHERE (mongo_id=? OR id=?)',
      [stock, req.params.id, Number(req.params.id) || 0]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Product not found' });

    const rows = await query(
      'SELECT * FROM products WHERE (mongo_id=? OR id=?) LIMIT 1',
      [req.params.id, Number(req.params.id) || 0]
    );
    const product = mapProductRow(rows[0]);

    console.info('[PATCH /api/products/:id/stock] updated stock', { id: product._id, stock: product.stock });
    res.json({ success: true, message: '✅ Stock updated!', product });
  } catch (err) {
    console.error('[PATCH /api/products/:id/stock] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE product (admin) ────────────────────────────────────
r.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await query(
      'DELETE FROM products WHERE (mongo_id=? OR id=?)',
      [req.params.id, Number(req.params.id) || 0]
    );
    console.info('[DELETE /api/products/:id] deleted product', req.params.id);
    res.json({ success: true, message: '✅ Product deleted!' });
  } catch (err) {
    console.error('[DELETE /api/products/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = r;
