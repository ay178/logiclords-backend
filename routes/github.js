const express   = require('express');
const mongoose  = require('mongoose');
const crypto    = require('crypto');
const { protect } = require('../middleware/auth');
const Project   = require('../models/Project');

const router = express.Router();

/* ── Branch Assignment Schema ── */
const branchSchema = new mongoose.Schema({
  repoUrl:    { type: String, required: true },
  branchName: { type: String, required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
  status:     { type: String, enum: ['available','in-progress','merged'], default: 'available' },
  assignedAt: { type: Date },
}, { timestamps: true });
branchSchema.index({ repoUrl: 1, branchName: 1 }, { unique: true });
const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

/* ── GitHub fetch helper ── */
const ghFetch = (url) => fetch(url, {
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LogicLords-App',
    ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
  },
});

/* ── Fetch and update repo data ── */
const syncRepoData = async (project, io) => {
  try {
    const repo = project.githubRepo;
    if (!repo) return;

    const [repoRes, prsRes, commitsRes] = await Promise.all([
      ghFetch(`https://api.github.com/repos/${repo}`),
      ghFetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`),
      ghFetch(`https://api.github.com/repos/${repo}/commits?per_page=1`),
    ]);

    if (!repoRes.ok) return;

    const [repoData, prsData, commitsData] = await Promise.all([
      repoRes.json(), prsRes.json(), commitsRes.json(),
    ]);

    const lastCommit = commitsData[0];

    project.githubData = {
      stars:        repoData.stargazers_count || 0,
      forks:        repoData.forks_count || 0,
      openIssues:   repoData.open_issues_count || 0,
      openPRs:      Array.isArray(prsData) ? prsData.length : 0,
      lastCommit:   lastCommit?.commit?.message?.split('\n')[0] || '',
      lastCommitAt: lastCommit?.commit?.author?.date ? new Date(lastCommit.commit.author.date) : null,
      defaultBranch: repoData.default_branch || 'main',
      totalCommits: project.githubData?.totalCommits || 0,
    };

    await project.save();

    // Emit real-time update
    if (io) {
      io.emit('project_github_updated', {
        projectId: project._id,
        githubData: project.githubData,
        githubProgress: project.githubProgress,
      });
    }
  } catch (e) {
    console.error('syncRepoData error:', e.message);
  }
};

/* ─────────────────────────────────────────────
   GET /api/github/branches?repo=owner/repo
───────────────────────────────────────────── */
router.get('/branches', async (req, res, next) => {
  try {
    const { repo } = req.query;
    if (!repo) return res.status(422).json({ error: 'repo parameter required' });

    const ghRes = await ghFetch(`https://api.github.com/repos/${repo}/branches?per_page=100`);
    if (!ghRes.ok) {
      const msg = ghRes.status === 404
        ? 'Repository not found — check the URL and make sure it is public'
        : `GitHub API error: ${ghRes.status}`;
      return res.status(ghRes.status).json({ error: msg });
    }

    const githubBranches = await ghRes.json();
    const assignments = await Branch.find({ repoUrl: repo }).populate('assignedTo', 'name role avatar email');

    const branches = githubBranches.map(b => {
      const asgn = assignments.find(a => a.branchName === b.name);
      return {
        name:       b.name,
        sha:        b.commit.sha,
        url:        `https://github.com/${repo}/tree/${b.name}`,
        compareUrl: `https://github.com/${repo}/compare/main...${b.name}`,
        assignedTo: asgn?.assignedTo || null,
        status:     asgn?.status || 'available',
        assignedAt: asgn?.assignedAt || null,
      };
    });

    res.json({ branches, repo, total: branches.length });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/github/repo-data?repo=owner/repo
   Fetch repo stats for a project
───────────────────────────────────────────── */
router.get('/repo-data', async (req, res, next) => {
  try {
    const { repo } = req.query;
    if (!repo) return res.status(422).json({ error: 'repo required' });

    const [repoRes, prsRes, commitsRes, releasesRes] = await Promise.all([
      ghFetch(`https://api.github.com/repos/${repo}`),
      ghFetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`),
      ghFetch(`https://api.github.com/repos/${repo}/commits?per_page=5`),
      ghFetch(`https://api.github.com/repos/${repo}/releases?per_page=3`),
    ]);

    if (!repoRes.ok) return res.status(repoRes.status).json({ error: 'GitHub API error' });

    const [repoData, prsData, commitsData, releasesData] = await Promise.all([
      repoRes.json(), prsRes.json(), commitsRes.json(), releasesRes.json(),
    ]);

    res.json({
      repo: {
        name:          repoData.name,
        fullName:      repoData.full_name,
        description:   repoData.description,
        stars:         repoData.stargazers_count,
        forks:         repoData.forks_count,
        openIssues:    repoData.open_issues_count,
        language:      repoData.language,
        defaultBranch: repoData.default_branch,
        url:           repoData.html_url,
        updatedAt:     repoData.updated_at,
      },
      openPRs:  Array.isArray(prsData) ? prsData.length : 0,
      prs:      Array.isArray(prsData) ? prsData.slice(0,5).map(p=>({ title:p.title, user:p.user?.login, url:p.html_url, createdAt:p.created_at })) : [],
      commits:  Array.isArray(commitsData) ? commitsData.map(c=>({
        sha:     c.sha?.slice(0,7),
        message: c.commit?.message?.split('\n')[0],
        author:  c.commit?.author?.name,
        date:    c.commit?.author?.date,
        url:     c.html_url,
      })) : [],
      releases: Array.isArray(releasesData) ? releasesData.map(r=>({ name:r.name||r.tag_name, url:r.html_url, date:r.published_at })) : [],
    });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/github/webhook
   GitHub sends events here automatically
───────────────────────────────────────────── */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['x-hub-signature-256'];
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(req.body).digest('hex');
      if (sig !== digest) return res.status(401).json({ error: 'Invalid signature' });
    }

    const event   = req.headers['x-github-event'];
    const payload = JSON.parse(req.body.toString());
    const repoFullName = payload.repository?.full_name;

    console.log(`📨 GitHub webhook: ${event} for ${repoFullName}`);

    // Find project with this repo
    const project = await Project.findOne({ githubRepo: repoFullName });
    if (!project) return res.json({ message: 'No project linked to this repo' });

    const io = req.app.get('io');
    const activity = {
      type:      event,
      author:    payload.sender?.login || 'unknown',
      url:       payload.compare || payload.pull_request?.html_url || '',
      createdAt: new Date(),
    };

    /* ── Push event ── */
    if (event === 'push') {
      const branch   = payload.ref?.replace('refs/heads/', '') || '';
      const commits  = payload.commits || [];
      const lastMsg  = commits[commits.length - 1]?.message?.split('\n')[0] || '';

      activity.title  = lastMsg || `${commits.length} commit(s) pushed`;
      activity.branch = branch;
      activity.sha    = payload.after?.slice(0, 7);

      project.githubData.lastCommit   = lastMsg;
      project.githubData.lastCommitAt = new Date();
      project.githubData.totalCommits += commits.length;

      // Auto-update task if branch name matches a task
      if (branch !== project.githubData.defaultBranch) {
        const { Task } = require('./tasks');
        // Try to find a task matching the branch name
        await require('../models/Task').updateMany(
          { project: project._id, title: { $regex: branch.replace(/[-_]/g, '.*'), $options: 'i' }, status: 'todo' },
          { status: 'inprogress' }
        );
      }
    }

    /* ── Pull Request event ── */
    if (event === 'pull_request') {
      const pr     = payload.pull_request;
      const action = payload.action;

      activity.title  = pr?.title;
      activity.branch = pr?.head?.ref;
      activity.url    = pr?.html_url;

      if (action === 'closed' && pr?.merged) {
        // PR merged! Update progress
        activity.type = 'merged';
        activity.title = `✅ Merged: ${pr.title}`;

        // Count merged PRs to calculate progress
        const mergedCount = (project.recentActivity || []).filter(a => a.type === 'merged').length + 1;
        const totalEstimate = Math.max(mergedCount, 5);
        project.githubProgress = Math.min(100, Math.round((mergedCount / totalEstimate) * 100));

        // Auto-complete related tasks
        const branchName = pr?.head?.ref || '';
        await require('../models/Task').updateMany(
          { project: project._id, status: { $ne: 'done' }, title: { $regex: branchName.replace(/[-_]/g, '.*'), $options: 'i' } },
          { status: 'done' }
        );

        // If all tasks done → mark project completed
        const totalTasks = await require('../models/Task').countDocuments({ project: project._id });
        const doneTasks  = await require('../models/Task').countDocuments({ project: project._id, status: 'done' });
        if (totalTasks > 0 && doneTasks === totalTasks) {
          project.status = 'completed';
          project.githubProgress = 100;
        }
      }

      if (action === 'opened') {
        project.githubData.openPRs = (project.githubData.openPRs || 0) + 1;
      }
    }

    /* ── Issues event ── */
    if (event === 'issues') {
      const issue  = payload.issue;
      const action = payload.action;
      activity.title = `${action}: ${issue?.title}`;
      activity.url   = issue?.html_url;

      if (action === 'closed') {
        project.githubData.openIssues = Math.max(0, (project.githubData.openIssues || 1) - 1);
      } else if (action === 'opened') {
        project.githubData.openIssues = (project.githubData.openIssues || 0) + 1;
      }
    }

    /* ── Create release event ── */
    if (event === 'release' && payload.action === 'published') {
      activity.title = `🚀 Released: ${payload.release?.name || payload.release?.tag_name}`;
      project.githubProgress = 100;
      project.status = 'completed';
    }

    // Save activity (keep last 20)
    project.recentActivity = [activity, ...(project.recentActivity || [])].slice(0, 20);
    await project.save();

    // Emit real-time update to all connected clients
    if (io) {
      io.emit('project_github_updated', {
        projectId:      project._id,
        githubData:     project.githubData,
        githubProgress: project.githubProgress,
        status:         project.status,
        recentActivity: project.recentActivity.slice(0, 5),
        activity,
      });

      // Also emit a notification
      io.emit('github_activity', {
        projectId:   project._id,
        projectName: project.title,
        activity,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   POST /api/github/sync/:projectId
   Manually sync GitHub data for a project
───────────────────────────────────────────── */
router.post('/sync/:projectId', protect, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.githubRepo) return res.status(422).json({ error: 'No GitHub repo linked to this project' });

    const io = req.app.get('io');
    await syncRepoData(project, io);

    res.json({ message: 'GitHub data synced!', githubData: project.githubData });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/github/assign
───────────────────────────────────────────── */
router.post('/assign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    if (!repoUrl || !branchName) return res.status(422).json({ error: 'repoUrl and branchName required' });

    const existing = await Branch.findOne({ repoUrl, branchName });
    if (existing?.assignedTo && String(existing.assignedTo) !== String(req.user._id)) {
      return res.status(409).json({ error: 'This branch is already taken by another member' });
    }

    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      { repoUrl, branchName, assignedTo: req.user._id, status: status || 'in-progress', assignedAt: new Date() },
      { upsert: true, new: true }
    ).populate('assignedTo', 'name role avatar email');

    res.json({ branch, message: `Branch "${branchName}" assigned to you!` });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/github/unassign
───────────────────────────────────────────── */
router.delete('/unassign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName } = req.body;
    await Branch.findOneAndUpdate({ repoUrl, branchName }, { assignedTo: null, status: 'available', assignedAt: null });
    res.json({ message: 'Branch released' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/github/status
───────────────────────────────────────────── */
router.patch('/status', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName }, { status }, { new: true }
    ).populate('assignedTo', 'name role avatar');
    res.json({ branch });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.syncRepoData = syncRepoData;
