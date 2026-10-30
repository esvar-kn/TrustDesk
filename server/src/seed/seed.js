// Seeder: clears and reloads every collection from the pack's data/ files.
//
// Safety-critical step: the ticket `expected_*` labels are split out into the
// `seed_labels` collection so they never sit on a ticket the AI path reads.
// (The Ticket schema also strips them, but splitting is the primary guard.)
//
//   npm --prefix server run seed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import * as M from '../models/index.js';
import { parseKbDir } from './parseKb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Repo data dir: server/src/seed -> repo root is three up, then /data.
const dataDir = env.DATA_DIR
  ? path.resolve(here, '../..', env.DATA_DIR)
  : path.resolve(here, '../../../data');

const BCRYPT_ROUNDS = 10;

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
const readJsonl = (file) =>
  fs
    .readFileSync(path.join(dataDir, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

async function seed() {
  if (!env.DEMO_AGENT_PASSWORD || !env.DEMO_MANAGER_PASSWORD) {
    throw new Error('Set DEMO_AGENT_PASSWORD and DEMO_MANAGER_PASSWORD in .env before seeding.');
  }

  await connectDb();
  logger.info(`seeding from ${dataDir}`);

  // Reset: clear documents but keep the synced indexes, then ensure indexes exist
  // (so unique constraints are enforced during insert).
  await Promise.all(Object.values(M).map((model) => model.deleteMany({})));
  await Promise.all(Object.values(M).map((model) => model.syncIndexes()));

  // --- Customers & orders ---
  await M.Customer.insertMany(readJson('customers.json'));
  await M.Order.insertMany(readJson('orders.json'));

  // --- Tickets: split expected_* into seed_labels ---
  const rawTickets = readJson('tickets.json');
  const tickets = [];
  const labels = [];
  for (const t of rawTickets) {
    const {
      expected_category,
      expected_priority,
      expected_sentiment,
      expected_escalation,
      expected_actions,
      ...ticket
    } = t;
    tickets.push(ticket);
    labels.push({
      ticket_id: t.ticket_id,
      expected_category,
      expected_priority,
      expected_sentiment,
      expected_escalation,
      expected_actions,
    });
  }
  await M.Ticket.insertMany(tickets);
  await M.SeedLabel.insertMany(labels);

  // --- Eval cases (reference, read only by the eval runner) ---
  const cases = readJsonl('eval_cases.jsonl').map((c) => ({
    case_id: c.case_id,
    ticket_id: c.ticket_id,
    input: c.input,
    expected: c.expected,
  }));
  await M.EvalCase.insertMany(cases);

  // --- Tool catalog ---
  await M.ToolCatalog.insertMany(readJson('tool_actions.json'));

  // --- Knowledge base: documents + chunks via the parser ---
  const { documents, chunks } = parseKbDir(path.join(dataDir, 'knowledge_base'));
  await M.KnowledgeDocument.insertMany(documents);
  await M.KbChunk.insertMany(chunks);

  // --- Demo users (bcrypt-hashed passwords) ---
  const userSpecs = [
    { username: 'agent', role: 'agent', password: env.DEMO_AGENT_PASSWORD },
    { username: 'manager', role: 'manager', password: env.DEMO_MANAGER_PASSWORD },
  ];
  // Optional read-only auditor demo account (seeded only when a password is set).
  if (env.DEMO_AUDITOR_PASSWORD) {
    userSpecs.push({ username: 'auditor', role: 'auditor', password: env.DEMO_AUDITOR_PASSWORD });
  }
  const users = await Promise.all(
    userSpecs.map(async ({ username, role, password }) => ({
      username,
      role,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    })),
  );
  await M.User.insertMany(users);

  // --- Summary + safety check ---
  const counts = {
    customers: await M.Customer.countDocuments(),
    orders: await M.Order.countDocuments(),
    tickets: await M.Ticket.countDocuments(),
    seed_labels: await M.SeedLabel.countDocuments(),
    eval_cases: await M.EvalCase.countDocuments(),
    tool_catalog: await M.ToolCatalog.countDocuments(),
    knowledge_documents: await M.KnowledgeDocument.countDocuments(),
    kb_chunks: await M.KbChunk.countDocuments(),
    users: await M.User.countDocuments(),
  };
  const leak = await M.Ticket.countDocuments({ expected_category: { $exists: true } });
  const untrusted = await M.KnowledgeDocument.distinct('doc_id', { trust_level: 'untrusted' });

  logger.info({ counts, leak, untrusted }, 'seed complete');
  if (leak !== 0) throw new Error(`label leak: ${leak} ticket(s) carry expected_* fields`);

  await disconnectDb();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
