// Tests for the production provisioning scripts: load-reference (idempotent KB +
// tool-catalog loader with stale-chunk pruning) and ensure-admin (non-destructive
// first-manager bootstrap). Both functions assume an open connection, which the
// shared test DB provides — the CLI connect/disconnect wrappers aren't exercised.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb.js';
import { loadReference } from '../src/scripts/load-reference.js';
import { ensureAdmin } from '../src/scripts/ensure-admin.js';
import KnowledgeDocument from '../src/models/KnowledgeDocument.js';
import KbChunk from '../src/models/KbChunk.js';
import ToolCatalog from '../src/models/ToolCatalog.js';
import User from '../src/models/User.js';

beforeAll(async () => {
  await startTestDb();
}, 120000);

afterAll(async () => {
  await stopTestDb();
});

describe('load-reference', () => {
  beforeEach(async () => {
    await Promise.all([
      KnowledgeDocument.deleteMany({}),
      KbChunk.deleteMany({}),
      ToolCatalog.deleteMany({}),
    ]);
  });

  it('loads the tool catalog and knowledge base', async () => {
    const counts = await loadReference();
    expect(counts.tool_catalog).toBe(6);
    expect(counts.knowledge_documents).toBe(8);
    expect(counts.kb_chunks).toBeGreaterThan(0);
    expect(counts.stale_chunks_pruned).toBe(0);
    // Reflected in the DB.
    expect(await ToolCatalog.countDocuments()).toBe(6);
    expect(await KnowledgeDocument.countDocuments()).toBe(8);
  });

  it('is idempotent: a second run changes nothing and prunes nothing', async () => {
    const first = await loadReference();
    const second = await loadReference();
    expect(second.tool_catalog).toBe(first.tool_catalog);
    expect(second.knowledge_documents).toBe(first.knowledge_documents);
    expect(second.kb_chunks).toBe(first.kb_chunks);
    expect(second.stale_chunks_pruned).toBe(0);
    // No duplicates created on re-run.
    expect(await KbChunk.countDocuments()).toBe(first.kb_chunks);
  });

  it('prunes stale chunks that no longer exist for a document', async () => {
    await loadReference();
    const doc = await KnowledgeDocument.findOne().lean();
    const staleId = `${doc.doc_id}#stale`;
    await KbChunk.create({ chunk_id: staleId, doc_id: doc.doc_id, text: 'orphaned section' });

    const counts = await loadReference();
    expect(counts.stale_chunks_pruned).toBeGreaterThanOrEqual(1);
    expect(await KbChunk.findOne({ chunk_id: staleId })).toBeNull();
  });

  it('does not touch transactional collections (only upserts reference data)', async () => {
    await User.create({ username: 'keep', role: 'agent', password_hash: 'x' });
    await loadReference();
    expect(await User.countDocuments()).toBe(1); // user survives a reference reload
    await User.deleteMany({});
  });
});

describe('ensure-admin', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('creates a manager when none exists', async () => {
    const res = await ensureAdmin({ username: 'admin', password: 'supersecret' });
    expect(res.created).toBe(true);
    expect(res.username).toBe('admin');
    expect(await User.countDocuments({ role: 'manager' })).toBe(1);
  });

  it('is a no-op (idempotent) when a manager already exists', async () => {
    await ensureAdmin({ username: 'admin', password: 'supersecret' });
    const res = await ensureAdmin({ username: 'someone-else', password: 'anotherpass' });
    expect(res.created).toBe(false);
    expect(res.reason).toBe('manager-exists');
    expect(await User.countDocuments({ role: 'manager' })).toBe(1);
    expect(await User.findOne({ username: 'someone-else' })).toBeNull();
  });

  it('refuses to clobber a non-manager with the same username', async () => {
    await User.create({ username: 'bob', role: 'agent', password_hash: 'x' });
    await expect(ensureAdmin({ username: 'bob', password: 'supersecret' })).rejects.toThrow(
      /already exists/i,
    );
    // bob is untouched and is still an agent.
    expect((await User.findOne({ username: 'bob' })).role).toBe('agent');
  });

  it('rejects a missing username or a too-short password', async () => {
    await expect(ensureAdmin({ username: '', password: 'supersecret' })).rejects.toThrow();
    await expect(ensureAdmin({ username: 'admin', password: '12345' })).rejects.toThrow();
  });
});
