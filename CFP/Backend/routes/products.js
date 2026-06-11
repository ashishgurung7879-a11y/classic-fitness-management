// ============================================================
// PRODUCTS ROUTE — Full CRUD with validation
// ============================================================
const express = require('express');
const r = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');

// ── PRODUCT SCHEMA ────────────────────────────────────────────
const ProductSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  price:       { type: Number, required: true, min: 0 },
  salePrice:   { type: Number, default: null },
  description: { type: String, default: '' },
  category:    { type: String, enum: ['protein','vitamins','gear','apparel','drinks','other'], default: 'other' },
  emoji:       { type: String, default: '💊' },
  imageUrl:    { type: String, default: '' },
  badge:       { type: String, default: '' },
  stock:       { type: Number, default: 50 },
  isActive:    { type: Boolean, default: true },
  rating:      { avg: { type: Number, default: 4.5 }, count: { type: Number, default: 0 } },
  createdAt:   { type: Date, default: Date.now }
});

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

function normalizeProductPayload(body = {}) {
  const price = Number(body.price || 0);
  const salePrice = body.salePrice === '' || body.salePrice === null || body.salePrice === undefined ? null : Number(body.salePrice);
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
    rating: {
      avg: Number(body.rating?.avg ?? 4.5) || 4.5,
      count: Number(body.rating?.count ?? 0) || 0
    }
  };
}

// ── GET all products (public) ─────────────────────────────────
// GET all products (public)
r.get('/', async (req, res) => {
  try {
    const { cat, search } = req.query;

    const q = {
      $or: [
        { isActive: true },
        { isActive: { $exists: false } }
      ]
    };

    if (cat && cat !== 'all') {
      q.category = cat;
    }

    if (search) {
      q.name = { $regex: search, $options: 'i' };
    }

    const products = await Product.find(q);

    products.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    console.info(
      '[GET /api/products] returning',
      products.length,
      'active products'
    );

    res.json({
      success: true,
      products
    });
  } catch (err) {
    console.error('[GET /api/products] error', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
// ── GET single product (public) ───────────────────────────────
r.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
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
    const product = await Product.create(payload);
    console.info('[POST /api/products] created product', {
      id: product._id,
      name: product.name,
      isActive: product.isActive,
    });
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
    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    console.info('[PUT /api/products/:id] updated product', {
      id: product._id,
      name: product.name,
      isActive: product.isActive,
    });
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
    const product = await Product.findByIdAndUpdate(req.params.id, { stock }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    console.info('[PATCH /api/products/:id/stock] updated stock', {
      id: product._id,
      stock: product.stock,
    });
    res.json({ success: true, message: '✅ Stock updated!', product });
  } catch (err) {
    console.error('[PATCH /api/products/:id/stock] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE product (admin) ────────────────────────────────────
r.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    console.info('[DELETE /api/products/:id] deleted product', req.params.id);
    res.json({ success: true, message: '✅ Product deleted!' });
  } catch (err) {
    console.error('[DELETE /api/products/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = r;
