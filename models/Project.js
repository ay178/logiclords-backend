const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  color:        { type: String, default: '#00f5d4' },
  deadline:     { type: Date },
  tags:         [{ type: String, trim: true, maxlength: 30 }],
  members:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  status:       { type: String, enum: ['planning','active','completed','paused'], default: 'active' },
  isArchived:   { type: Boolean, default: false },

  /* GitHub Integration */
  githubUrl:    { type: String, default: '' },
  githubRepo:   { type: String, default: '' },
  githubData: {
    stars:        { type: Number, default: 0 },
    forks:        { type: Number, default: 0 },
    openIssues:   { type: Number, default: 0 },
    openPRs:      { type: Number, default: 0 },
    lastCommit:   { type: String, default: '' },
    lastCommitAt: { type: Date },
    defaultBranch:{ type: String, default: 'main' },
    totalCommits: { type: Number, default: 0 },
  },
  recentActivity: [{
    type:      { type: String },
    title:     { type: String },
    author:    { type: String },
    branch:    { type: String },
    url:       { type: String },
    sha:       { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  githubProgress: { type: Number, default: 0 },

  /* Showcase */
  problem:     { type: String, maxlength: 1000, default: '' },
  solution:    { type: String, maxlength: 1000, default: '' },
  features:    [{ type: String, maxlength: 200 }],
  futureScope: [{ type: String, maxlength: 200 }],
  demoUrl:     { type: String, default: '' },
  repoUrl:     { type: String, default: '' },
}, { timestamps: true });

projectSchema.index({ createdBy: 1 });
projectSchema.index({ githubRepo: 1 });

module.exports = mongoose.model('Project', projectSchema);
