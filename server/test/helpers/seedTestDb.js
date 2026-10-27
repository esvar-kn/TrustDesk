// Loads the full pack dataset into the already-connected in-memory Mongo.
// Mirrors src/seed/seed.js (expected_* split into seed_labels, bcrypt users,
// KB docs/chunks via the parser) but without connect/disconnect/exit, so tests
// can seed a fresh DB and query through the real services.
import path from 'node:path';
import bcrypt from 'bcryptjs';

import * as M from '../../src/models/index.js';
import { parseKbDir } from '../../src/seed/parseKb.js';
import { registry } from '../../src/services/tools/registry.js';
import { resetCategoryDocMap } from '../../src/services/retrieval/retriever.js';
import { DATA_DIR, readJson, readJsonl } from './data.js';

const BCRYPT_ROUNDS = 10;

export async function seedTestDb() {
  await Promise.all(Object.values(M).map((model) => model.deleteMany({})));
  await Promise.all(Object.values(M).map((model) => model.syncIndexes()));

  await M.Customer.insertMany(readJson('customers.json'));
  await M.Order.insertMany(readJson('orders.json'));

  // Tickets: strip expected_* into seed_labels (never on a ticket the AI reads).
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

  const cases = readJsonl('eval_cases.jsonl').map((c) => ({
    case_id: c.case_id,
    ticket_id: c.ticket_id,
    input: c.input,
    expected: c.expected,
  }));
  await M.EvalCase.insertMany(cases);

  await M.ToolCatalog.insertMany(readJson('tool_actions.json'));

  const { documents, chunks } = parseKbDir(path.join(DATA_DIR, 'knowledge_base'));
  await M.KnowledgeDocument.insertMany(documents);
  await M.KbChunk.insertMany(chunks);
  await M.KbChunk.syncIndexes(); // build the weighted $text index

  const userSpecs = [
    { username: 'agent', role: 'agent', password: 'agent-pass' },
    { username: 'agent2', role: 'agent', password: 'agent2-pass' },
    { username: 'manager', role: 'manager', password: 'manager-pass' },
    { username: 'manager2', role: 'manager', password: 'manager2-pass' },
  ];
  const users = await Promise.all(
    userSpecs.map(async ({ username, role, password }) => ({
      username,
      role,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    })),
  );
  await M.User.insertMany(users);

  // Caches that key off seeded data.
  registry.resetCache();
  resetCategoryDocMap();
}
