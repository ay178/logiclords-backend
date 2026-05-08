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
  skills:   [{ type: String, trim: true, maxlength: 40 }],
  avatar:   { type: String, default: '' },
  github:   { type: String, default: '' },
  linkedin: { type: String, default: '' },
  bio:      { type: String, maxlength: 280, default: '' },
  isAdmin:  { type: Boolean, default: false },

  /* Email Verification */
  isEmailVerified:    { type: Boolean, default: false },
  emailVerifyToken:   { type: String, select: false },
  emailVerifyExpires: { type: Date,   select: false },

  /* Admin Approval */
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
  approvedAt:   { type: Date, default: null },
  rejectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
  rejectedAt:   { type: Date, default: null },
  rejectReason: { type: String, default: '' },

  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

memberSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

memberSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

memberSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.emailVerifyExpires;
  return obj;
};

memberSchema.index({ email: 1 });
memberSchema.index({ approvalStatus: 1 });

module.exports = mongoose.model('Member', memberSchema);
