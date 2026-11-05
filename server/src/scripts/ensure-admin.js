// Non-destructive bootstrap: guarantees at least one manager account exists so
// someone can log in and manage the rest through the Users Admin UI. Unlike the
// demo seeder, this NEVER clears or overwrites data — it is safe to run against a
// live production database, and safe to re-run (idempotent).
//
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm --prefix server run ensure-admin
//
// Behaviour (returns { created, username, reason? }):
//   - a manager already exists                 -> no-op (created:false)
//   - ADMIN_USERNAME is taken by a non-manager -> throws (won't clobber)
//   - otherwise                                -> create the manager (created:true)
//
// ensureAdmin() assumes an open mongoose connection; the CLI wrapper below owns
// connect/disconnect so the function stays importable and testable.
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';

import { logger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import User from '../models/User.js';

const BCRYPT_ROUNDS = 10;

export async function ensureAdmin({
  username = (process.env.ADMIN_USERNAME || '').trim(),
  password = process.env.ADMIN_PASSWORD || '',
} = {}) {
  if (!username || password.length < 6) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (min 6 chars) before running ensure-admin.');
  }

  // If any manager already exists, the bootstrap is done — do nothing.
  const existingManager = await User.findOne({ role: 'manager' }).lean();
  if (existingManager) {
    logger.info({ username: existingManager.username }, 'a manager already exists — nothing to do');
    return { created: false, reason: 'manager-exists', username: existingManager.username };
  }

  // No manager yet. Don't clobber a username already taken by another role.
  const clash = await User.findOne({ username }).lean();
  if (clash) {
    throw new Error(
      `cannot create manager "${username}": a ${clash.role} with that username already exists. ` +
        'Promote it via the Users Admin UI, or choose a different ADMIN_USERNAME.',
    );
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await User.create({ username, role: 'manager', password_hash });
  logger.info({ username }, 'bootstrap manager created');
  return { created: true, username };
}

// Run only when invoked directly as a CLI (not when imported, e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDb()
    .then(() => ensureAdmin())
    .then(() => disconnectDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error({ err: err.message }, 'ensure-admin failed');
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
