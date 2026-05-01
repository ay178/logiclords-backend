const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Member   = require('../models/Member');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

/* ── Avatar upload config ── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../uploads/avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

/* ─────────────────────────────────────────────
   GET /api/members          — list all
   GET /api/members?role=AI/ML&q=arjun
───────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { role, q, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };
    if (role && role !== 'All') filter.role = role;
    if (q) filter.$or = [
      { name:  { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { skills:{ $elemMatch: { $regex: q, $options: 'i' } } },
    ];

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const [members, total] = await Promise.all([
      Member.find(filter)
        .select('-password')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Member.countDocuments(filter),
    ]);

    res.json({ members, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/members/:id
───────────────────────────────────────────── */
router.get('/:id', async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id).select('-password');
    if (!member || !member.isActive) return res.status(404).json({ error: 'Member not found' });
    res.json({ member });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/members/:id      — update own profile
───────────────────────────────────────────── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const isOwn   = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.isAdmin;

    if (!isOwn && !isAdmin) return res.status(403).json({ error: 'Cannot edit another member\'s profile' });

    const allowed = ['name','role','skills','github','linkedin','bio'];
    if (isAdmin) allowed.push('isAdmin','isActive');

    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const member = await Member.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    }).select('-password');

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
    const member = await Member.findByIdAndUpdate(
      req.params.id, { avatar: avatarUrl }, { new: true }
    ).select('-password');

    res.json({ member, avatarUrl });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/members/:id   — admin only
───────────────────────────────────────────── */
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    await Member.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Member deactivated' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/members/stats/overview  — admin
───────────────────────────────────────────── */
router.get('/stats/overview', protect, adminOnly, async (req, res, next) => {
  try {
    const [total, byRole, recent] = await Promise.all([
      Member.countDocuments({ isActive: true }),
      Member.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Member.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).select('name role avatar createdAt'),
    ]);
    res.json({ total, byRole, recent });
  } catch (err) { next(err); }
});

module.exports = router;
