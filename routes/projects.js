const express  = require('express');
const Project  = require('../models/Project');
const Task     = require('../models/Task');
const Member   = require('../models/Member');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/* ─────────────────────────────────────────────
   GET /api/projects
───────────────────────────────────────────── */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { status, archived } = req.query;
    const filter = {};
    if (!req.user?.isAdmin) filter.isArchived = false;
    else if (archived !== 'true') filter.isArchived = false;
    if (status) filter.status = status;

    const projects = await Project.find(filter)
      .populate('members', 'name role avatar email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    /* Attach task progress for each project */
    const enriched = await Promise.all(projects.map(async (p) => {
      const [total, done] = await Promise.all([
        Task.countDocuments({ project: p._id }),
        Task.countDocuments({ project: p._id, status: 'done' }),
      ]);
      return { ...p.toObject(), taskCount: total, completedTasks: done };
    }));

    res.json({ projects: enriched });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/projects/:id
───────────────────────────────────────────── */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('members', 'name role avatar email skills github linkedin')
      .populate('createdBy', 'name email');

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = await Task.find({ project: project._id })
      .populate('assignee', 'name role avatar')
      .populate('createdBy', 'name')
      .sort({ order: 1, createdAt: 1 });

    res.json({ project, tasks });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/projects     — auth required
───────────────────────────────────────────── */
router.post('/', protect, async (req, res, next) => {
  try {
    const {
      title, description, color, deadline, tags,
      members, problem, solution, features, futureScope, demoUrl, repoUrl,
    } = req.body;

    if (!title?.trim()) return res.status(422).json({ error: 'Project title required' });

    const project = await Project.create({
      title: title.trim(),
      description: description?.trim() || '',
      color: color || '#00f5d4',
      deadline: deadline ? new Date(deadline) : undefined,
      tags:    Array.isArray(tags)    ? tags.slice(0, 10)    : [],
      members: Array.isArray(members) ? members.slice(0, 20) : [],
      createdBy: req.user._id,
      problem:   problem   || '',
      solution:  solution  || '',
      features:  Array.isArray(features)    ? features    : [],
      futureScope: Array.isArray(futureScope) ? futureScope : [],
      demoUrl: demoUrl || '',
      repoUrl: repoUrl || '',
    });

    await project.populate('members', 'name role avatar');
    await project.populate('createdBy', 'name email');

    res.status(201).json({ project });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PUT /api/projects/:id   — creator or admin
───────────────────────────────────────────── */
router.put('/:id', protect, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isOwner = project.createdBy.toString() === req.user._id.toString();
    if (!isOwner && !req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const fields = ['title','description','color','deadline','tags','members',
                    'status','problem','solution','features','futureScope','demoUrl','repoUrl'];
    fields.forEach(k => { if (req.body[k] !== undefined) project[k] = req.body[k]; });
    if (req.user.isAdmin && req.body.isArchived !== undefined) project.isArchived = req.body.isArchived;

    await project.save();
    await project.populate('members', 'name role avatar');
    res.json({ project });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/projects/:id  — admin only
───────────────────────────────────────────── */
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await Task.deleteMany({ project: req.params.id });
    res.json({ message: `Project "${project.title}" and all its tasks deleted` });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/projects/stats/overview  — admin
───────────────────────────────────────────── */
router.get('/stats/overview', protect, adminOnly, async (req, res, next) => {
  try {
    const [total, byStatus, tasksByStatus] = await Promise.all([
      Project.countDocuments({ isArchived: false }),
      Project.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    res.json({ total, byStatus, tasksByStatus });
  } catch (err) { next(err); }
});

module.exports = router;
