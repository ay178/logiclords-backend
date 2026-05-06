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
const Member     = require('./models/Member');
const Message    = require('./models/Message');

const authRoutes    = require('./routes/auth');
const memberRoutes  = require('./routes/members');
const projectRoutes = require('./routes/projects');
const taskRoutes    = require('./routes/tasks');
const githubRoutes  = require('./routes/github');
const chatRoutes    = require('./routes/chat');

const app    = express();
const server = http.createServer(app);

/* ── Socket.io setup ── */
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

/* ── Security ── */
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: 'Too many requests' } }));

/* ── CORS ── */
app.use(cors({ origin: '*', credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));

/* ── Body / Static ── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ── MongoDB ── */
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/logiclords')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

/* ── REST Routes ── */
app.use('/api/auth',     authRoutes);
app.use('/api/members',  memberRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks',    taskRoutes);
app.use('/api/github',   githubRoutes);
app.use('/api/chat',     chatRoutes);

/* ── Health ── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));

/* ── 404 ── */
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

/* ── Error handler ── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
});

/* ══════════════════════════════════════════════════
   SOCKET.IO — Real-time Chat
══════════════════════════════════════════════════ */

// Track online users: { socketId -> { memberId, name, role, avatar } }
const onlineUsers = new Map();

/* ── Auth middleware for sockets ── */
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'logiclords_super_secret_change_me_in_production');
    const member  = await Member.findById(decoded.id).select('-password');
    if (!member || !member.isActive) return next(new Error('User not found'));

    socket.user = member;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`💬 ${user.name} connected (${socket.id})`);

  /* ── User joins ── */
  onlineUsers.set(socket.id, {
    _id:    user._id,
    name:   user.name,
    role:   user.role,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
  });

  // Join general room
  socket.join('general');

  // Broadcast updated online users list
  io.emit('online_users', Array.from(onlineUsers.values()));

  // Notify others
  socket.to('general').emit('user_joined', {
    user: { name: user.name, role: user.role },
    timestamp: new Date(),
  });

  /* ── Send message ── */
  socket.on('send_message', async (data) => {
    try {
      const { text, room = 'general' } = data;
      if (!text?.trim()) return;

      // Save to DB
      const message = await Message.create({
        sender: user._id,
        text:   text.trim().slice(0, 2000),
        room,
      });
      await message.populate('sender', 'name role avatar isAdmin');

      // Broadcast to room
      io.to(room).emit('new_message', {
        _id:       message._id,
        text:      message.text,
        room:      message.room,
        sender:    message.sender,
        createdAt: message.createdAt,
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  /* ── Typing indicator ── */
  socket.on('typing_start', (data) => {
    socket.to(data.room || 'general').emit('user_typing', {
      name: user.name,
      isTyping: true,
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.room || 'general').emit('user_typing', {
      name: user.name,
      isTyping: false,
    });
  });

  /* ── Delete message ── */
  socket.on('delete_message', async (data) => {
    try {
      const { messageId, room = 'general' } = data;
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const isOwner = String(msg.sender) === String(user._id);
      if (!isOwner && !user.isAdmin) return;

      await msg.deleteOne();
      io.to(room).emit('message_deleted', { messageId });
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  /* ── Disconnect ── */
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(onlineUsers.values()));
    socket.to('general').emit('user_left', {
      user: { name: user.name },
      timestamp: new Date(),
    });
    console.log(`👋 ${user.name} disconnected`);
  });
});

/* ── Start server ── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 LogicLords API + Chat running on http://localhost:${PORT}`));

module.exports = app;
