import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { env } from '../config/env.js';
import { fail } from '../errors.js';
import { validateBody } from '../middleware/validate.js';
import User from '../models/User.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

// POST /api/auth/login → { token, role, username, expiresIn }
// 8-hour JWT with a `role` claim. Generic 401 on any credential failure
// (no user-enumeration signal).
authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  if (!env.AUTH_JWT_SECRET) fail('INTERNAL', 'AUTH_JWT_SECRET not configured');

  const user = await User.findOne({ username });
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) fail('UNAUTHENTICATED', 'Invalid credentials');

  const token = jwt.sign({ sub: user.username, role: user.role }, env.AUTH_JWT_SECRET, {
    expiresIn: env.AUTH_TOKEN_TTL,
  });
  res.json({ token, role: user.role, username: user.username, expiresIn: env.AUTH_TOKEN_TTL });
});
