const jwt    = require('jsonwebtoken');
const Member = require('../models/Member');

/* ── Verify JWT ── */
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided — please login' });
    }
    const token   = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'logiclords_super_secret_change_me_in_production');
    const member  = await Member.findById(decoded.id).select('-password');

    if (!member)           return res.status(401).json({ error: 'User not found' });
    if (!member.isActive)  return res.status(403).json({ error: 'Account deactivated. Contact admin.' });
    if (member.approvalStatus === 'pending')  return res.status(403).json({ error: 'Account pending admin approval', code: 'PENDING_APPROVAL' });
    if (member.approvalStatus === 'rejected') return res.status(403).json({ error: 'Account not approved', code: 'REJECTED' });

    member.lastSeen = Date.now();
    await member.save({ validateBeforeSave: false });
    req.user = member;
    next();
  } catch (err) {
    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? 'Token expired — please login again' : 'Invalid token',
    });
  }
};

/* ── Admin only ── */
exports.adminOnly = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/* ── Optional auth — won't reject if no token ── */
exports.optionalAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'logiclords_super_secret_change_me_in_production');
      const member  = await Member.findById(decoded.id).select('-password');
      if (member?.isActive && member?.approvalStatus === 'approved') req.user = member;
    }
  } catch (_) {}
  next();
};

/* ── Sign JWT ── */
exports.signToken = (id) =>
  jwt.sign(
    { id },
    process.env.JWT_SECRET || 'logiclords_super_secret_change_me_in_production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
