const express  = require('express');
const Message  = require('../models/Message');
const { protect } = require('../middleware/auth');

const router = express.Router();

/* ─────────────────────────────────────────────
   GET /api/chat/messages?room=general&limit=50
───────────────────────────────────────────── */
router.get('/messages', protect, async (req, res, next) => {
  try {
    const { room = 'general', limit = 50, before } = req.query;
    const filter = { room };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .populate('sender', 'name role avatar isAdmin')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ messages: messages.reverse() });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   POST /api/chat/messages  — Save message to DB
───────────────────────────────────────────── */
router.post('/messages', protect, async (req, res, next) => {
  try {
    const { text, room = 'general' } = req.body;
    if (!text?.trim()) return res.status(422).json({ error: 'Message text required' });

    const message = await Message.create({
      sender: req.user._id,
      text:   text.trim(),
      room,
    });

    await message.populate('sender', 'name role avatar isAdmin');
    res.status(201).json({ message });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
   DELETE /api/chat/messages/:id  — Admin only
───────────────────────────────────────────── */
router.delete('/messages/:id', protect, async (req, res, next) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const isOwner = String(msg.sender) === String(req.user._id);
    if (!isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Cannot delete this message' });
    }

    await msg.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
