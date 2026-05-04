const express = require('express');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Branch assignments store karne ke liye (in-memory + DB)
const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  repoUrl:    { type: String, required: true },
  repoName:   { type: String },
  branchName: { type: String, required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
  projectId:  { type: String },
  status:     { type: String, enum: ['available','in-progress','merged'], default: 'available' },
  lastCommit: { type: String },
  assignedAt: { type: Date },
}, { timestamps: true });

const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

/* ── GET /api/github/branches?repo=owner/reponame ── */
router.get('/branches', async (req, res, next) => {
  try {
    const { repo } = req.query;
    if (!repo) return res.status(422).json({ error: 'repo parameter required' });

    // GitHub API se branches fetch karo
    const response = await fetch(
      `https://api.github.com/repos/${repo}/branches`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LogicLords-App',
          ...(process.env.GITHUB_TOKEN && {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
          })
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'GitHub API error — check repo URL' });
    }

    const githubBranches = await response.json();

    // DB se assignments fetch karo
    const assignments = await Branch.find({ repoUrl: repo })
      .populate('assignedTo', 'name role avatar email');

    // Merge karo
    const branches = githubBranches.map(b => {
      const assignment = assignments.find(a => a.branchName === b.name);
      return {
        name:       b.name,
        sha:        b.commit.sha,
        url:        `https://github.com/${repo}/tree/${b.name}`,
        compareUrl: `https://github.com/${repo}/compare/main...${b.name}`,
        assignedTo: assignment?.assignedTo || null,
        status:     assignment?.status || 'available',
        assignedAt: assignment?.assignedAt || null,
        dbId:       assignment?._id || null,
      };
    });

    res.json({ branches, repo });
  } catch (err) { next(err); }
});

/* ── POST /api/github/assign — Branch apne naam karo ── */
router.post('/assign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    if (!repoUrl || !branchName) return res.status(422).json({ error: 'repoUrl and branchName required' });

    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      {
        repoUrl, branchName,
        assignedTo: req.user._id,
        status: status || 'in-progress',
        assignedAt: new Date(),
      },
      { upsert: true, new: true }
    ).populate('assignedTo', 'name role avatar email');

    res.json({ branch });
  } catch (err) { next(err); }
});

/* ── DELETE /api/github/unassign — Branch release karo ── */
router.delete('/unassign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName } = req.body;
    await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      { assignedTo: null, status: 'available', assignedAt: null },
      { new: true }
    );
    res.json({ message: 'Branch release ho gayi' });
  } catch (err) { next(err); }
});

/* ── PATCH /api/github/status — Status update karo ── */
router.patch('/status', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      { status },
      { new: true }
    ).populate('assignedTo', 'name role avatar');
    res.json({ branch });
  } catch (err) { next(err); }
});

module.exports = router;