const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');

const r = express.Router();

function mapLeadRow(row) {
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    type: row.type || 'general',
    message: row.message || '',
    source: row.source || 'website',
    status: row.status || 'new',
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

r.post('/', async (req, res) => {
  try {
    const { name, phone, email, type, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ success: false, message: 'Name and message required' });
    }

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO contact_leads (mongo_id, name, phone, email, type, message, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'website', 'new', NOW(), NOW())`,
      [mongoId, name, phone || '', email || '', type || 'general', message]
    );

    res.status(201).json({
      success: true,
      message: 'Message received! We will contact you shortly.',
      leadId: mongoId,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

r.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const whereClauses = ['1=1'];
    const params = [];

    if (status) {
      whereClauses.push('cl.status = ?');
      params.push(status);
    }

    if (search) {
      whereClauses.push('(cl.name LIKE ? OR cl.phone LIKE ? OR cl.email LIKE ? OR cl.message LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const offset = (numericPage - 1) * numericLimit;

    const [leads, totalRows] = await Promise.all([
      query(
        `SELECT cl.* FROM contact_leads cl WHERE ${whereClauses.join(' AND ')} ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`,
        [...params, numericLimit, offset]
      ),
      query(
        `SELECT COUNT(*) AS total FROM contact_leads cl WHERE ${whereClauses.join(' AND ')}`,
        params
      ),
    ]);

    res.json({ success: true, total: Number(totalRows[0]?.total || 0), leads: leads.map(mapLeadRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

r.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const updateFields = [];
    const updateParams = [];

    if (req.body.status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(req.body.status);
    }

    if (req.body.adminNote !== undefined) {
      updateFields.push('admin_note = ?');
      updateParams.push(req.body.adminNote);
    }

    if (!updateFields.length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    updateFields.push('updated_at = NOW()');
    updateParams.push(req.params.id, Number(req.params.id) || 0);

    const result = await query(
      `UPDATE contact_leads SET ${updateFields.join(', ')} WHERE (mongo_id = ? OR id = ?)`,
      updateParams
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Contact lead not found' });
    }

    const rows = await query(
      'SELECT * FROM contact_leads WHERE (mongo_id = ? OR id = ?) LIMIT 1',
      [req.params.id, Number(req.params.id) || 0]
    );

    res.json({ success: true, message: 'Contact lead updated', lead: mapLeadRow(rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = r;
