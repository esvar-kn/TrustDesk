// Idempotent reference-data loader: the operational content the app needs to
// function in ANY environment — the knowledge base (documents + chunks the
// guarded draft pipeline cites) and the tool catalog (the enforceable registry
// the approval flow checks). Unlike the demo seeder it only upserts; it never
// clears tickets, actions, users, or any transactional collection, so it is
// safe to run on a live database whenever your policies or tools change.
//
//   npm --prefix server run load-reference
//
// DATA_DIR (default: repo-root /data) points at the source files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import KnowledgeDocument from '../models/KnowledgeDocument.js';
import KbChunk from '../models/KbChunk.js';
import ToolCatalog from '../models/ToolCatalog.js';
import { parseKbDir } from '../seed/parseKb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src/scripts -> same depth as server/src/seed, so resolve data the same way.
const defaultDataDir = env.DATA_DIR
  ? path.resolve(here, '../..', env.DATA_DIR)
  : path.resolve(here, '../../../data');

const upserts = (docs, key) =>
  docs.map((doc) => ({ updateOne: { filter: { [key]: doc[key] }, update: { $set: doc }, upsert: true } }));

// Assumes an open mongoose connection; the CLI wrapper below owns connect/
// disconnect so the function stays importable and testable. Returns the counts.
export async function loadReference({ dataDir = defaultDataDir } = {}) {
  logger.info(`loading reference data from ${dataDir}`);

  // Indexes first, so unique constraints (doc_id / chunk_id / tool_name) and the
  // KB text index are in place before writes.
  await Promise.all([
    KnowledgeDocument.syncIndexes(),
    KbChunk.syncIndexes(),
    ToolCatalog.syncIndexes(),
  ]);

  // --- Tool catalog (upsert by tool_name) ---
  const tools = JSON.parse(fs.readFileSync(path.join(dataDir, 'tool_actions.json'), 'utf8'));
  await ToolCatalog.bulkWrite(upserts(tools, 'tool_name'));

  // --- Knowledge base: documents (by doc_id) + chunks (by chunk_id) ---
  const { documents, chunks } = parseKbDir(path.join(dataDir, 'knowledge_base'));
  await KnowledgeDocument.bulkWrite(upserts(documents, 'doc_id'));
  await KbChunk.bulkWrite(upserts(chunks, 'chunk_id'));

  // Prune chunks that no longer exist after an edit (e.g. a policy lost a section),
  // scoped to each document we just loaded — other collections are untouched.
  const liveByDoc = new Map();
  for (const c of chunks) {
    if (!liveByDoc.has(c.doc_id)) liveByDoc.set(c.doc_id, []);
    liveByDoc.get(c.doc_id).push(c.chunk_id);
  }
  let pruned = 0;
  for (const [doc_id, ids] of liveByDoc) {
    const r = await KbChunk.deleteMany({ doc_id, chunk_id: { $nin: ids } });
    pruned += r.deletedCount || 0;
  }

  const counts = {
    tool_catalog: await ToolCatalog.countDocuments(),
    knowledge_documents: await KnowledgeDocument.countDocuments(),
    kb_chunks: await KbChunk.countDocuments(),
  };
  logger.info({ ...counts, stale_chunks_pruned: pruned }, 'reference data loaded');
  // Note: a KB file deleted from disk is not removed here (its doc_id simply
  // stops being refreshed). Remove a retired doc explicitly if you need to.
  return { ...counts, stale_chunks_pruned: pruned };
}

// Run only when invoked directly as a CLI (not when imported, e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDb()
    .then(() => loadReference())
    .then(() => disconnectDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error({ err: err.message }, 'load-reference failed');
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
