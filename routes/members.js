const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Member   = require('../models/Member');
const { protect, adminOnly } = require('../middleware/auth');
const emailService = require('../utils/emailService');

const router = express.Router();

/* ── Avatar upload ── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../uploads/avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `avatar-${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } });

/* ─────────────────────────────────────────────
   GET /api/members — list approved members only
───────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { role, q, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true, approvalStatus: 'approved' };
    if (role && role !== 'All') filter.role = role;
    if (q) filter.$or = [
      { name:  { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { skills:{ $elemMatch: { $regex: q, $options: 'i' } } },
    ];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [members, total] = await Promise.all([
      Member.find(filter).select('-password').sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)),
      Member.countDocuments(filter),
    ]);
    res.json({ members, total, page: parseInt(page) });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/members/pending — Admin: list pending
───────────────────────────────────────────── */
router.get('/pending', protect, adminOnly, async (req, res, next) => {
  try {
    const members = await Member.find({ approvalStatus: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ members, total: members.length });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/members/:id
───────────────────────────────────────────── */
router.get('/:id', async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id).select('-password');
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ member });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/members/:id/approve — Admin only
───────────────────────────────────────────── */
router.patch('/:id/approve', protect, adminOnly, async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (member.approvalStatus === 'approved') {
      return res.status(400).json({ error: 'Member is already approved' });
    }

    member.approvalStatus = 'approved';
    member.approvedBy     = req.user._id;
    member.approvedAt     = new Date();
    member.isActive       = true;
    await member.save();

    // Send approval email
    try {
      await emailService.sendApprovalConfirmation({ to: member.email, name: member.name });
    } catch (e) {
      console.error('Approval email failed:', e.message);
    }

    // Real-time notification via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('member_approved', {
        memberId: member._id,
        name:     member.name,
        role:     member.role,
      });
    }

    res.json({ message: `${member.name} has been approved!`, member: member.toPublic() });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/members/:id/reject — Admin only
───────────────────────────────────────────── */
router.patch('/:id/reject', protect, adminOnly, async (req, res, next) => {
  try {
    const { reason = '' } = req.body;
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    member.approvalStatus = 'rejected';
    member.rejectedBy     = req.user._id;
    member.rejectedAt     = new Date();
    member.rejectReason   = reason;
    member.isActive       = false;
    await member.save();

    // Send rejection email
    try {
      await emailService.sendRejectionEmail({ to: member.email, name: member.name, reason });
    } catch (e) {
      console.error('Rejection email failed:', e.message);
    }

    res.json({ message: `${member.name}'s application has been rejected.` });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/members/:id — update profile
───────────────────────────────────────────── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const isOwn   = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.isAdmin;
    if (!isOwn && !isAdmin) return res.status(403).json({ error: 'Cannot edit another member\'s profile' });

    const allowed = ['name','role','skills','github','linkedin','bio'];
    if (isAdmin) allowed.push('isAdmin','isActive','approvalStatus');

    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const member = await Member.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ member });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/members/:id/avatar
───────────────────────────────────────────── */
router.post('/:id/avatar', protect, upload.single('avatar'), async (req, res, next) => {
  try {
    if (req.user._id.toString() !== req.params.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const member = await Member.findByIdAndUpdate(req.params.id, { avatar: avatarUrl }, { new: true }).select('-password');
    res.json({ member, avatarUrl });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/members/:id — Admin only
───────────────────────────────────────────── */
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }
    await Member.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Member deactivated' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/members/stats/overview — Admin
───────────────────────────────────────────── */
router.get('/stats/overview', protect, adminOnly, async (req, res, next) => {
  try {
    const [total, pending, byRole] = await Promise.all([
      Member.countDocuments({ isActive: true, approvalStatus: 'approved' }),
      Member.countDocuments({ approvalStatus: 'pending' }),
      Member.aggregate([
        { $match: { isActive: true, approvalStatus: 'approved' } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    res.json({ total, pending, byRole });
  } catch (err) { next(err); }
});

module.exports = router;
