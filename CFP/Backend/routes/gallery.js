const express = require('express');
const r = express.Router();
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');

function mapGalleryRow(req, row) {
  const imageUrl = toPublicGalleryUrl(req, row.image_url || '');

  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    title: row.title || '',
    imageUrl,
    category: row.category || 'gym',
    isActive: !!row.is_active,
    addedBy: row.added_by_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicGalleryUrl(req, imageUrl = '') {
  if (!imageUrl) return '';

  if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  const normalized = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${req.protocol}://${req.get('host')}${normalized}`;
}

r.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    const where = ['g.is_active = 1'];
    const params = [];

    if (category && category !== 'all') {
      where.push('g.category = ?');
      params.push(category);
    }

    const rows = await query(
      `SELECT g.*, u.mongo_id AS added_by_mongo_id
       FROM gallery_images g
       LEFT JOIN users u ON u.id = g.added_by
       WHERE ${where.join(' AND ')}
       ORDER BY g.created_at DESC`,
      params
    );

    res.json({
      success: true,
      photos: rows.map(row => mapGalleryRow(req, row))
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

r.post('/', protect, authorize('admin'), async (req, res) => {
  try {

    const imageUrl = String(req.body.imageUrl || '').trim();

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    const users = await query(
      `SELECT id
       FROM users
       WHERE mongo_id=? OR id=?
       LIMIT 1`,
      [req.user.id, Number(req.user.id) || 0]
    );

    const addedBy = users[0]?.id || null;

    const mongoId = generatePublicId();

    await query(
      `INSERT INTO gallery_images
      (
        mongo_id,
        title,
        image_url,
        category,
        is_active,
        added_by,
        created_at,
        updated_at
      )
      VALUES
      (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        mongoId,
        req.body.title || '',
        imageUrl,
        req.body.category || 'gym',
        req.body.isActive === false ? 0 : 1,
        addedBy
      ]
    );

    const rows = await query(
      `SELECT g.*, u.mongo_id AS added_by_mongo_id
       FROM gallery_images g
       LEFT JOIN users u ON u.id=g.added_by
       WHERE g.mongo_id=?
       LIMIT 1`,
      [mongoId]
    );

    res.status(201).json({
      success: true,
      photo: mapGalleryRow(req, rows[0])
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

r.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {

    await query(
      `DELETE FROM gallery_images
       WHERE mongo_id=? OR id=?`,
      [req.params.id, Number(req.params.id) || 0]
    );

    res.json({
      success: true,
      message: 'Photo deleted'
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = r;