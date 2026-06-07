const express = require('express');

const attendanceRouter = express.Router();

attendanceRouter.all('*', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'Online attendance has been disabled. Please mark attendance at the gym counter.'
  });
});

module.exports = { attendanceRouter };
