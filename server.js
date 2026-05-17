require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);

/* ── Socket.io ── */
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
});
app.set('io', io);

/* ── Security ── */
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 300, message: { error: 'Too many requests' } }));

/* ── CORS ── */
app.use(cors({ origin: '*', credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));

/* ── Webhook needs raw body — BEFORE express.json ── */
app.use('/api/github/webhook', express.raw({ type: 'application/json' }));

/* ── Body parsers ── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ── Static files ── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ── MongoDB ── */
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/logiclords')
  .then(() => {
    console.log('✅ MongoDB connected');
    // EMAIL TEST
    console.log('GMAIL_USER:', process.env.GMAIL_USER);
    console.log('GMAIL_PASS exists:', !!process.env.GMAIL_APP_PASSWORD);
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    transporter.verify((err, success) => {
      if (err) console.error('❌ Email error:', err.message);
      else console.log('✅ Email ready!');
    });
  })
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });
/* ── Load Models first (order matters) ── */
require('./models/Member');
require('./models/Message');
require('./models/Project');
require('./models/Task');

/* ── Routes ── */
const authRoutes    = require('./routes/auth');
const memberRoutes  = require('./routes/members');
const projectRoutes = require('./routes/projects');
const taskRoutes    = require('./routes/tasks');
const githubRoutes  = require('./routes/github');
const chatRoutes    = require('./routes/chat');

app.use('/api/auth',     authRoutes);
app.use('/api/members',  memberRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks',    taskRoutes);
app.use('/api/github',   githubRoutes);
app.use('/api/chat',     chatRoutes);

/* ── Health check ── */
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  uptime: Math.floor(process.uptime()),
  timestamp: new Date().toISOString(),
}));

/* ── 404 ── */
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

/* ── Global error handler ── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
});

/* ══════════════════════════════════════════════════
   SOCKET.IO — Real-time Chat + Notifications
══════════════════════════════════════════════════ */
const Member = require('./models/Member');
const Message = require('./models/Message');
const onlineUsers = new Map();

/* JWT Auth for sockets */
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('No token'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'logiclords_super_secret_change_me_in_production');
    const member  = await Member.findById(decoded.id).select('-password');
    if (!member) return next(new Error('User not found'));
    socket.user = member;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`💬 ${user.name} connected`);

  /* Track online users */
  onlineUsers.set(socket.id, {
    _id:     user._id,
    name:    user.name,
    role:    user.role,
    avatar:  user.avatar,
    isAdmin: user.isAdmin,
  });
  socket.join('general');
  io.emit('online_users', Array.from(onlineUsers.values()));
  socket.to('general').emit('user_joined', { user: { name: user.name, role: user.role }, timestamp: new Date() });

  /* Send message */
  socket.on('send_message', async (data) => {
    try {
      const { text, room = 'general' } = data;
      if (!text?.trim()) return;
      const message = await Message.create({ sender: user._id, text: text.trim().slice(0, 2000), room });
      await message.populate('sender', 'name role avatar isAdmin');
      io.to(room).emit('new_message', {
        _id:       message._id,
        text:      message.text,
        room:      message.room,
        sender:    message.sender,
        createdAt: message.createdAt,
      });
    } catch (err) { console.error('send_message error:', err.message); }
  });

  /* Typing indicators */
  socket.on('typing_start', (data) => socket.to(data.room || 'general').emit('user_typing', { name: user.name, isTyping: true }));
  socket.on('typing_stop',  (data) => socket.to(data.room || 'general').emit('user_typing', { name: user.name, isTyping: false }));

  /* Delete message */
  socket.on('delete_message', async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg) return;
      if (String(msg.sender) !== String(user._id) && !user.isAdmin) return;
      await msg.deleteOne();
      io.to(data.room || 'general').emit('message_deleted', { messageId: data.messageId });
    } catch (err) {}
  });

  /* Project room subscriptions */
  socket.on('join_project',  (id) => socket.join(`project:${id}`));
  socket.on('leave_project', (id) => socket.leave(`project:${id}`));

  /* Disconnect */
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(onlineUsers.values()));
    socket.to('general').emit('user_left', { user: { name: user.name }, timestamp: new Date() });
    console.log(`👋 ${user.name} disconnected`);
  });
});

/* ── Start ── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 LogicLords running on http://localhost:${PORT}`));

module.exports = app;
