const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');

const router = express.Router();

function mapNoticeRow(row) {
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    type: row.type || 'announcement',
    title: row.title || '',
    message: row.message || '',
    content: row.message || '',
    color: row.color || '#CC0000',
    emoji: row.emoji || '📢',
    icon: row.emoji || '📢',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM notices ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ success: true, notices: rows.map(mapNoticeRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { type, title, message, color, emoji } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO notices (mongo_id, type, title, message, color, emoji, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [mongoId, type || 'announcement', String(title).trim(), String(message).trim(), color || '#CC0000', emoji || '📢']
    );

    const rows = await query('SELECT * FROM notices WHERE mongo_id = ? LIMIT 1', [mongoId]);
    const notice = mapNoticeRow(rows[0]);

    res.status(201).json({ success: true, message: 'Notice posted successfully', notice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM notices WHERE (mongo_id = ? OR id = ?)',
      [req.params.id, Number(req.params.id) || 0]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    res.json({ success: true, message: 'Notice removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
