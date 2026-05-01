const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    minlength: 2,
    maxlength: 200,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true,
  },
  status: {
    type: String,
    enum: ['todo', 'inprogress', 'done'],
    default: 'todo',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  dueDate: { type: Date },
  completedAt: { type: Date },
  tags: [{ type: String, trim: true, maxlength: 30 }],
  order: { type: Number, default: 0 },   // for drag-and-drop ordering
  comments: [{
    author:    { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    text:      { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

/* Auto-set completedAt when status transitions to done */
taskSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.completedAt = this.status === 'done' ? new Date() : null;
  }
  next();
});

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ assignee: 1 });

module.exports = mongoose.model('Task', taskSchema);
