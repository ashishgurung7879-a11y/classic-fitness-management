const jwt = require('jsonwebtoken');
const { query } = require('../db/mysql');

exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized - please login' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const rows = await query(
      'SELECT id, mongo_id, role, is_active FROM users WHERE mongo_id = ? OR id = ? LIMIT 1',
      [decoded?.id || null, Number(decoded?.id) || 0]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated' });
    }

    req.user = {
      id: user.mongo_id || String(user.id),
      role: user.role,
      internalId: user.id,
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token - please login again' });
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: `Access denied for role: ${req.user.role}` });
  }
  next();
};
