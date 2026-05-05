require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes    = require('./routes/auth');
const memberRoutes  = require('./routes/members');
const projectRoutes = require('./routes/projects');
const taskRoutes    = require('./routes/tasks');
const githubRoutes  = require('./routes/github');

const app = express();

/* ── Security ── */
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests, slow down.' } }));

/* ── CORS ── */
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

/* ── Body / Static ── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ── DB ── */
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/logiclords', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

/* ── Routes ── */
app.use('/api/auth',     authRoutes);
app.use('/api/members',  memberRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks',    taskRoutes);
app.use('/api/github',   githubRoutes);

/* ── Health ── */
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development',
}));

/* ── 404 ── */
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

/* ── Global error handler ── */
app.use((err, _req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  console.error('[ERROR]', err.message);
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 LogicLords API running on http://localhost:${PORT}`));

module.exports = app;
