// Retrieval regression test against an in-memory Mongo (real $text index).
// Asserts: every must-cite doc ranks in the top 3 (built query + category hint),
// and KB-ADVERSARIAL-001 never enters a context set.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { startTestDb, stopTestDb } from './helpers/testDb.js';
import { DATA_DIR, readJson, readJsonl, indexBy } from './helpers/data.js';
import KnowledgeDocument from '../src/models/KnowledgeDocument.js';
import KbChunk from '../src/models/KbChunk.js';
import { parseKbDir } from '../src/seed/parseKb.js';
import { search, resetCategoryDocMap } from '../src/services/retrieval/retriever.js';
import { buildQuery } from '../src/services/retrieval/queryBuilder.js';

const customers = indexBy(readJson('customers.json'), 'customer_id');
const orders = indexBy(readJson('orders.json'), 'order_id');
const tickets = readJson('tickets.json');
const expectedByTicket = Object.fromEntries(
  readJsonl('eval_cases.jsonl').map((c) => [c.ticket_id, c.expected || {}]),
);

const contextFor = async (ticket, { k }) => {
  const exp = expectedByTicket[ticket.ticket_id] || {};
  const query = buildQuery({
    ticket,
    customer: customers[ticket.customer_id],
    order: orders[ticket.order_id] || null,
  });
  return search(query, { k, categoryHint: exp.category || null });
};

beforeAll(async () => {
  await startTestDb();
  const { documents, chunks } = parseKbDir(path.join(DATA_DIR, 'knowledge_base'));
  await KnowledgeDocument.insertMany(documents);
  await KbChunk.insertMany(chunks);
  await KbChunk.syncIndexes(); // build the weighted text index
  resetCategoryDocMap();
}, 120000);

afterAll(stopTestDb);

describe('retrieval', () => {
  it('every must-cite doc ranks in the top 3', async () => {
    let hits = 0;
    let denom = 0;
    for (const ticket of tickets) {
      const need = (expectedByTicket[ticket.ticket_id] || {}).must_cite_doc_ids || [];
      if (!need.length) continue;
      denom += 1;
      const { context } = await contextFor(ticket, { k: 3 });
      const ids = context.map((d) => d.doc_id);
      if (need.every((d) => ids.includes(d))) hits += 1;
    }
    expect(hits).toBe(denom); // 8/8
  });

  it('KB-ADVERSARIAL-001 never enters a context set', async () => {
    for (const ticket of tickets) {
      const { context } = await contextFor(ticket, { k: 5 });
      expect(context.map((d) => d.doc_id)).not.toContain('KB-ADVERSARIAL-001');
    }
  });

  it('untrusted matches are reported in the quarantined list instead', async () => {
    // At least one ticket surfaces the adversarial doc as quarantined (never context).
    let sawQuarantinedAdversarial = false;
    for (const ticket of tickets) {
      const { quarantined } = await contextFor(ticket, { k: 5 });
      if (quarantined.some((d) => d.doc_id === 'KB-ADVERSARIAL-001')) sawQuarantinedAdversarial = true;
    }
    expect(sawQuarantinedAdversarial).toBe(true);
  });
});
