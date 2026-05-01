const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const memberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 80,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false,
  },
  role: {
    type: String,
    enum: ['Frontend','Backend','AI/ML','Designer','DevOps','Full Stack','Mobile'],
    default: 'Frontend',
  },
  skills: [{ type: String, trim: true, maxlength: 40 }],
  avatar: { type: String, default: '' },
  github:   { type: String, default: '' },
  linkedin: { type: String, default: '' },
  isAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  bio: { type: String, maxlength: 280, default: '' },
  joinedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
}, { timestamps: true });

/* ── Pre-save: hash password ── */
memberSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/* ── Instance method: compare password ── */
memberSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/* ── Instance method: public profile ── */
memberSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

/* ── Indexes ── */
memberSchema.index({ email: 1 });
memberSchema.index({ role: 1 });

module.exports = mongoose.model('Member', memberSchema);
