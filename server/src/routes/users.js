// User administration (Phase 8.8). Manager-only CRUD over users and their roles
// (agent / manager / auditor). Passwords are bcrypt-hashed; hashes are never returned.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { fail } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import User from '../models/User.js';

const BCRYPT_ROUNDS = 10;
const ROLES = ['agent', 'manager', 'auditor'];

export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.use(requireRole('manager'));

// GET /api/users → list users (no password hashes).
usersRouter.get('/', async (_req, res) => {
  const users = await User.find().select('username role created_at -_id').sort({ username: 1 }).lean();
  res.json(users);
});

const createSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Letters, digits, dot, underscore or hyphen only'),
  role: z.enum(ROLES),
  password: z.string().min(6).max(200),
});

// POST /api/users → create a user.
usersRouter.post('/', validateBody(createSchema), async (req, res) => {
  const { username, role, password } = req.body;
  const exists = await User.findOne({ username }).lean();
  if (exists) fail('INVALID_STATE', `User ${username} already exists`);
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const doc = await User.create({ username, role, password_hash });
  res.status(201).json({ username: doc.username, role: doc.role, created_at: doc.created_at });
});

const patchSchema = z.object({ role: z.enum(ROLES) });

// PATCH /api/users/:username → change a user's role (not your own).
usersRouter.patch('/:username', validateBody(patchSchema), async (req, res) => {
  if (req.params.username === req.user.sub) fail('INVALID_STATE', 'You cannot change your own role');
  const user = await User.findOne({ username: req.params.username });
  if (!user) fail('NOT_FOUND', `User ${req.params.username} not found`);
  user.role = req.body.role;
  await user.save();
  res.json({ username: user.username, role: user.role });
});

// DELETE /api/users/:username → remove a user (not your own account).
usersRouter.delete('/:username', async (req, res) => {
  if (req.params.username === req.user.sub) fail('INVALID_STATE', 'You cannot delete your own account');
  const r = await User.deleteOne({ username: req.params.username });
  if (r.deletedCount === 0) fail('NOT_FOUND', `User ${req.params.username} not found`);
  res.json({ ok: true });
});
