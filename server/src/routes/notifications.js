import { Router } from 'express';
import { fail } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// GET /api/notifications → recent human-queue notifications, newest first.
notificationsRouter.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const filter = unreadOnly ? { read: false } : {};
  const items = await Notification.find(filter)
    .select('-_id -__v')
    .sort({ created_at: -1 })
    .limit(50)
    .lean();
  const unread = await Notification.countDocuments({ read: false });
  res.json({ items, unread });
});

// POST /api/notifications/:id/read → mark one read.
notificationsRouter.post('/:id/read', async (req, res) => {
  const r = await Notification.updateOne({ notification_id: req.params.id }, { $set: { read: true } });
  if (r.matchedCount === 0) fail('NOT_FOUND', `Notification ${req.params.id} not found`);
  res.json({ ok: true });
});

// POST /api/notifications/read-all → mark everything read.
notificationsRouter.post('/read-all', async (_req, res) => {
  await Notification.updateMany({ read: false }, { $set: { read: true } });
  res.json({ ok: true });
});
