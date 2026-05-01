const express = require('express');
const Task    = require('../models/Task');
const Project = require('../models/Project');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/* ── Auth guard helper ── */
const requireProjectAccess = async (req, res) => {
  const project = await Project.findById(req.params.projectId || req.body.project);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return null; }
  const isMember  = project.members.map(String).includes(req.user._id.toString());
  const isCreator = project.createdBy.toString() === req.user._id.toString();
  if (!isMember && !isCreator && !req.user.isAdmin) {
    res.status(403).json({ error: 'Not a project member' }); return null;
  }
  return project;
};

/* ─────────────────────────────────────────────
   GET /api/tasks?project=id
───────────────────────────────────────────── */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { project, status, assignee } = req.query;
    const filter = {};
    if (project)  filter.project  = project;
    if (status)   filter.status   = status;
    if (assignee) filter.assignee = assignee;

    const tasks = await Task.find(filter)
      .populate('assignee', 'name role avatar')
      .populate('createdBy', 'name')
      .sort({ order: 1, createdAt: 1 });

    res.json({ tasks });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/tasks/:id
───────────────────────────────────────────── */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignee', 'name role avatar skills')
      .populate('createdBy', 'name')
      .populate('comments.author', 'name role avatar');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/tasks
───────────────────────────────────────────── */
router.post('/', protect, async (req, res, next) => {
  try {
    const { title, description, project, assignee, status, priority, dueDate, tags } = req.body;
    if (!title?.trim())   return res.status(422).json({ error: 'Task title required' });
    if (!project)         return res.status(422).json({ error: 'Project ID required' });

    const proj = await requireProjectAccess(req, res);
    if (!proj) return;

    /* Count existing tasks to set order */
    const count = await Task.countDocuments({ project });

    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || '',
      project,
      assignee:    assignee || null,
      createdBy:   req.user._id,
      status:      status   || 'todo',
      priority:    priority || 'medium',
      dueDate:     dueDate  ? new Date(dueDate) : undefined,
      tags:        Array.isArray(tags) ? tags : [],
      order:       count,
    });

    await task.populate('assignee', 'name role avatar');
    await task.populate('createdBy', 'name');
    res.status(201).json({ task });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/tasks/:id   — partial update (status, assignee, etc.)
───────────────────────────────────────────── */
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allowed = ['title','description','assignee','status','priority','dueDate','tags','order'];
    allowed.forEach(k => { if (req.body[k] !== undefined) task[k] = req.body[k]; });

    await task.save();
    await task.populate('assignee', 'name role avatar');
    res.json({ task });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/tasks/:id/status   — quick status toggle
───────────────────────────────────────────── */
router.patch('/:id/status', protect, async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['todo','inprogress','done'];
    if (!valid.includes(status)) return res.status(422).json({ error: 'Invalid status' });

    const task = await Task.findByIdAndUpdate(
      req.params.id, { status }, { new: true, runValidators: true }
    ).populate('assignee', 'name role avatar');

    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/tasks/:id/comments
───────────────────────────────────────────── */
router.post('/:id/comments', protect, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(422).json({ error: 'Comment text required' });

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: { author: req.user._id, text: text.trim() } } },
      { new: true }
    ).populate('comments.author', 'name role avatar');

    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json({ comments: task.comments });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/tasks/reorder   — update order for drag-and-drop
   body: [{ id, order, status }]
───────────────────────────────────────────── */
router.patch('/reorder/bulk', protect, async (req, res, next) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(422).json({ error: 'Expected array' });

    await Promise.all(
      updates.map(({ id, order, status }) =>
        Task.findByIdAndUpdate(id, { order, ...(status && { status }) })
      )
    );
    res.json({ message: 'Tasks reordered' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/tasks/:id   — creator or admin
───────────────────────────────────────────── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isCreator = task.createdBy?.toString() === req.user._id.toString();
    if (!isCreator && !req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    await task.deleteOne();
    res.json({ message: 'Task deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
