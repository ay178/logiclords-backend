const express   = require('express');
const mongoose  = require('mongoose');
const { protect } = require('../middleware/auth');

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

/* ─────────────────────────────────────────────
   GET /api/github/branches?repo=owner/reponame
───────────────────────────────────────────── */
router.get('/branches', async (req, res, next) => {
  try {
    const { repo } = req.query;
    if (!repo) return res.status(422).json({ error: 'repo parameter required' });

    // GitHub API se branches fetch karo
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/branches?per_page=100`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LogicLords-App',
          ...(process.env.GITHUB_TOKEN && {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
          }),
        },
      }
    );

    if (!ghRes.ok) {
      const msg = ghRes.status === 404
        ? 'Repository nahi mili — check karo URL sahi hai aur public hai'
        : `GitHub API error: ${ghRes.status}`;
      return res.status(ghRes.status).json({ error: msg });
    }

    const githubBranches = await ghRes.json();

    // DB se assignments fetch karo
    const assignments = await Branch.find({ repoUrl: repo })
      .populate('assignedTo', 'name role avatar email');

    // Merge GitHub data + DB assignments
    const branches = githubBranches.map(b => {
      const asgn = assignments.find(a => a.branchName === b.name);
      return {
        name:        b.name,
        sha:         b.commit.sha,
        url:         `https://github.com/${repo}/tree/${b.name}`,
        compareUrl:  `https://github.com/${repo}/compare/main...${b.name}`,
        assignedTo:  asgn?.assignedTo || null,
        status:      asgn?.status     || 'available',
        assignedAt:  asgn?.assignedAt || null,
        dbId:        asgn?._id        || null,
      };
    });

    res.json({ branches, repo, total: branches.length });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/github/assign — Branch apne naam karo
───────────────────────────────────────────── */
router.post('/assign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    if (!repoUrl || !branchName) {
      return res.status(422).json({ error: 'repoUrl aur branchName required hai' });
    }

    // Check — koi aur already is branch pe kaam kar raha hai?
    const existing = await Branch.findOne({ repoUrl, branchName });
    if (existing?.assignedTo && String(existing.assignedTo) !== String(req.user._id)) {
      return res.status(409).json({ error: 'Yeh branch already kisi aur ke naam hai' });
    }

    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      {
        repoUrl,
        branchName,
        assignedTo: req.user._id,
        status:     status || 'in-progress',
        assignedAt: new Date(),
      },
      { upsert: true, new: true }
    ).populate('assignedTo', 'name role avatar email');

    res.json({ branch, message: `Branch "${branchName}" tumhare naam ho gayi!` });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/github/unassign — Branch release karo
───────────────────────────────────────────── */
router.delete('/unassign', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName } = req.body;
    const branch = await Branch.findOne({ repoUrl, branchName });

    if (branch && String(branch.assignedTo) !== String(req.user._id) && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sirf tumhare naam wali branch release kar sakte ho' });
    }

    await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      { assignedTo: null, status: 'available', assignedAt: null },
    );

    res.json({ message: 'Branch release ho gayi' });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   PATCH /api/github/status — Status update karo
───────────────────────────────────────────── */
router.patch('/status', protect, async (req, res, next) => {
  try {
    const { repoUrl, branchName, status } = req.body;
    if (!['available','in-progress','merged'].includes(status)) {
      return res.status(422).json({ error: 'Invalid status' });
    }

    const branch = await Branch.findOneAndUpdate(
      { repoUrl, branchName },
      { status },
      { new: true }
    ).populate('assignedTo', 'name role avatar');

    res.json({ branch });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   GET /api/github/assignments — Saari assignments dekho
───────────────────────────────────────────── */
router.get('/assignments', async (req, res, next) => {
  try {
    const { repo } = req.query;
    const filter = repo ? { repoUrl: repo } : {};
    const assignments = await Branch.find(filter)
      .populate('assignedTo', 'name role avatar email')
      .sort({ updatedAt: -1 });
    res.json({ assignments });
  } catch (err) { next(err); }
});

module.exports = router;
