const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
  },
  color: {
    type: String,
    default: '#00f5d4',
    match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex'],
  },
  deadline: { type: Date },
  tags: [{ type: String, trim: true, maxlength: 30 }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true,
  },
  status: {
    type: String,
    enum: ['planning','active','completed','paused'],
    default: 'active',
  },
  isArchived: { type: Boolean, default: false },

  /* Showcase fields */
  problem:  { type: String, maxlength: 1000, default: '' },
  solution: { type: String, maxlength: 1000, default: '' },
  features: [{ type: String, maxlength: 200 }],
  futureScope: [{ type: String, maxlength: 200 }],
  demoUrl:  { type: String, default: '' },
  repoUrl:  { type: String, default: '' },
}, { timestamps: true });

/* Virtual: task count (populated from Task model when needed) */
projectSchema.virtual('taskCount', { ref: 'Task', localField: '_id', foreignField: 'project', count: true });

projectSchema.index({ createdBy: 1 });
projectSchema.index({ members: 1 });
projectSchema.index({ status: 1 });

module.exports = mongoose.model('Project', projectSchema);
