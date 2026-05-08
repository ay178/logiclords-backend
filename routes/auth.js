const express  = require('express');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');
const Member   = require('../models/Member');
const { protect, signToken } = require('../middleware/auth');
const emailService = require('../utils/emailService');

const router = express.Router();

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
      _id:            member._id,
      name:           member.name,
      email:          member.email,
      role:           member.role,
      skills:         member.skills,
      avatar:         member.avatar,
      github:         member.github,
      linkedin:       member.linkedin,
      isAdmin:        member.isAdmin,
      bio:            member.bio,
      isEmailVerified: member.isEmailVerified,
      approvalStatus: member.approvalStatus,
    },
  });
};

/* ─────────────────────────────────────────────
   POST /api/auth/signup
   Step 1: Register → send verification email
───────────────────────────────────────────── */
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min:2, max:80 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min:6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['Frontend','Backend','AI/ML','Designer','DevOps','Full Stack','Mobile']),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role, skills, github, linkedin, bio } = req.body;

    const exists = await Member.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email is already registered' });

    // Generate email verification token
    const verifyToken   = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const isFirstUser = (await Member.countDocuments()) === 0;

    const member = await Member.create({
      name, email, password,
      role:     role || 'Frontend',
      skills:   Array.isArray(skills) ? skills.slice(0, 8) : [],
      github:   github   || '',
      linkedin: linkedin || '',
      bio:      bio      || '',
      isAdmin:  isFirstUser,
      isEmailVerified:    false,
      emailVerifyToken:   verifyToken,
      emailVerifyExpires: verifyExpires,
      approvalStatus:     isFirstUser ? 'approved' : 'pending',
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail({
        to:    email,
        name:  name,
        token: verifyToken,
      });
    } catch (emailErr) {
      console.error('Verification email failed:', emailErr.message);
      // Don't block registration if email fails
    }

    // If first user (admin), also auto-approve and notify
    if (isFirstUser) {
      member.isEmailVerified = true;
      member.approvalStatus  = 'approved';
      member.approvedAt      = new Date();
      await member.save();
      return sendTokenResponse(member, 201, res);
    }

    // For normal users — notify admin about the new request
    try {
      const admin = await Member.findOne({ isAdmin: true });
      if (admin) {
        await emailService.sendAdminApprovalRequest({
          adminEmail: admin.email,
          adminName:  admin.name,
          applicant:  { _id: member._id, name, email, role: member.role, skills: member.skills },
        });
      }
    } catch (adminEmailErr) {
      console.error('Admin notification email failed:', adminEmailErr.message);
    }

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account. Your application will be reviewed by the admin.',
      requiresVerification: true,
      requiresApproval:     true,
    });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/auth/verify?token=xxx
   Step 2: Verify email
───────────────────────────────────────────── */
router.get('/verify', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(422).json({ error: 'Verification token is required' });

    const member = await Member.findOne({
      emailVerifyToken:   token,
      emailVerifyExpires: { $gt: new Date() },
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!member) {
      return res.status(400).json({ error: 'Invalid or expired verification link. Please register again.' });
    }

    member.isEmailVerified    = true;
    member.emailVerifyToken   = undefined;
    member.emailVerifyExpires = undefined;
    await member.save();

    res.json({
      message: 'Email verified successfully! Your application is now pending admin approval. You will receive an email once approved.',
      verified: true,
      approvalStatus: member.approvalStatus,
    });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/auth/login
───────────────────────────────────────────── */
router.post('/login', [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const member = await Member.findOne({ email }).select('+password');

    if (!member || !(await member.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check email verification
    if (!member.isEmailVerified) {
      return res.status(403).json({
        error: 'Please verify your email first. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Check admin approval
    if (member.approvalStatus === 'pending') {
      return res.status(403).json({
        error: 'Your account is pending admin approval. You will receive an email once approved.',
        code: 'PENDING_APPROVAL',
      });
    }

    if (member.approvalStatus === 'rejected') {
      return res.status(403).json({
        error: `Your application was not approved. ${member.rejectReason ? 'Reason: ' + member.rejectReason : ''}`,
        code: 'REJECTED',
      });
    }

    if (!member.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Contact admin.' });
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
  body('newPassword').isLength({ min: 6 }),
], validate, async (req, res, next) => {
  try {
    const member = await Member.findById(req.user._id).select('+password');
    const ok = await member.comparePassword(req.body.currentPassword);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    member.password = req.body.newPassword;
    await member.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/auth/resend-verification
───────────────────────────────────────────── */
router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body;
    const member = await Member.findOne({ email }).select('+emailVerifyToken +emailVerifyExpires');
    if (!member) return res.status(404).json({ error: 'Email not found' });
    if (member.isEmailVerified) return res.status(400).json({ error: 'Email is already verified' });

    const verifyToken   = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    member.emailVerifyToken   = verifyToken;
    member.emailVerifyExpires = verifyExpires;
    await member.save();

    await emailService.sendVerificationEmail({ to: email, name: member.name, token: verifyToken });
    res.json({ message: 'Verification email resent! Please check your inbox.' });
  } catch (err) { next(err); }
});

module.exports = router;
