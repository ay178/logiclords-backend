const express  = require('express');
const { body, validationResult } = require('express-validator');
const Member   = require('../models/Member');
const { protect, signToken } = require('../middleware/auth');

const router = express.Router();

/* ── Helpers ── */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const sendTokenResponse = (member, statusCode, res) => {
  const token = signToken(member._id);
  res.status(statusCode).json({
    token,
    member: {
      _id:      member._id,
      name:     member.name,
      email:    member.email,
      role:     member.role,
      skills:   member.skills,
      avatar:   member.avatar,
      github:   member.github,
      linkedin: member.linkedin,
      isAdmin:  member.isAdmin,
      bio:      member.bio,
    },
  });
};

/* ─────────────────────────────────────────────
   POST /api/auth/signup
───────────────────────────────────────────── */
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min:2, max:80 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min:6 }).withMessage('Password min 6 chars'),
  body('role').optional().isIn(['Frontend','Backend','AI/ML','Designer','DevOps','Full Stack','Mobile']),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role, skills, github, linkedin, bio } = req.body;

    const exists = await Member.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const isFirstUser = (await Member.countDocuments()) === 0;

    const member = await Member.create({
      name, email, password,
      role:     role || 'Frontend',
      skills:   Array.isArray(skills) ? skills.slice(0,8) : [],
      github:   github  || '',
      linkedin: linkedin || '',
      bio:      bio || '',
      isAdmin:  isFirstUser,   // first user becomes admin
    });

    sendTokenResponse(member, 201, res);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/auth/login
───────────────────────────────────────────── */
router.post('/login', [
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const member = await Member.findOne({ email }).select('+password');

    if (!member || !(await member.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!member.isActive) {
      return res.status(403).json({ error: 'Account deactivated. Contact admin.' });
    }

    sendTokenResponse(member, 200, res);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/auth/me
───────────────────────────────────────────── */
router.get('/me', protect, async (req, res, next) => {
  try {
    const member = await Member.findById(req.user._id);
    res.json({ member: member.toPublic() });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/auth/change-password
───────────────────────────────────────────── */
router.patch('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min:6 }),
], validate, async (req, res, next) => {
  try {
    const member = await Member.findById(req.user._id).select('+password');
    const ok = await member.comparePassword(req.body.currentPassword);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });

    member.password = req.body.newPassword;
    await member.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/auth/logout  (client just deletes token; here for future blocklist)
───────────────────────────────────────────── */
router.post('/logout', protect, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
