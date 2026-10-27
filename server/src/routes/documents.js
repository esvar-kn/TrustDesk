import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

import { fail } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { search, resetCategoryDocMap } from '../services/retrieval/retriever.js';
import { parseKbContent, trustLevelFor } from '../seed/parseKb.js';
import KnowledgeDocument from '../models/KnowledgeDocument.js';
import KbChunk from '../models/KbChunk.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// GET /api/documents/search?q=&k=&categoryHint=
// Returns ranked trusted results; untrusted matches are reported separately as
// `quarantined` (never part of `results`).
documentsRouter.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) fail('VALIDATION_ERROR', 'query parameter q is required');
  const k = Math.min(Math.max(parseInt(req.query.k, 10) || 5, 1), 25);
  const categoryHint = req.query.categoryHint ? req.query.categoryHint.toString() : null;

  const { context, quarantined } = await search(q, { k, categoryHint });
  res.json({ query: q, results: context, quarantined });
});

// GET /api/documents/:id → a document with its chunks (for citation snippets).
documentsRouter.get('/:id', async (req, res) => {
  const doc = await KnowledgeDocument.findOne({ doc_id: req.params.id })
    .select('doc_id title audience version trust_level -_id')
    .lean();
  if (!doc) fail('NOT_FOUND', `Document ${req.params.id} not found`);
  const chunks = await KbChunk.find({ doc_id: req.params.id })
    .select('heading text -_id')
    .sort({ chunk_id: 1 })
    .lean();
  res.json({ ...doc, chunks });
});

const ingestSchema = z.object({
  documents: z
    .array(
      z.object({
        doc_id: z.string().min(1).optional(),
        title: z.string().optional(),
        content: z.string().min(1),
        source_path: z.string().optional(),
        audience: z.string().optional(),
        version: z.string().optional(),
      }),
    )
    .min(1),
});

// POST /api/documents/ingest (manager only)
// Upserts each document by doc_id and rebuilds its chunks. When the content is
// KB-formatted markdown, metadata (doc_id, audience→trust_level, version,
// chunks) is parsed from it; body fields override title/source_path/doc_id.
documentsRouter.post(
  '/ingest',
  requireRole('manager'),
  validateBody(ingestSchema),
  async (req, res) => {
    const ids = [];
    for (const input of req.body.documents) {
      let parsed = null;
      try {
        parsed = parseKbContent(input.content, { sourcePath: input.source_path });
      } catch {
        parsed = null; // not KB-formatted markdown; fall back to body fields
      }

      const doc_id = input.doc_id || parsed?.document.doc_id;
      if (!doc_id) fail('VALIDATION_ERROR', 'each document needs a doc_id (in body or content)');

      const title = input.title || parsed?.document.title || doc_id;
      const audience = parsed?.document.audience ?? input.audience ?? null;
      const trust_level = parsed?.document.trust_level ?? trustLevelFor(input.audience);
      const docFields = {
        doc_id,
        title,
        audience,
        version: parsed?.document.version ?? input.version ?? null,
        trust_level,
        checksum:
          parsed?.document.checksum ??
          crypto.createHash('sha256').update(input.content, 'utf8').digest('hex'),
        source_path: input.source_path || parsed?.document.source_path || null,
        content: input.content,
        updated_at: new Date(),
      };

      // Chunks: parsed sections if available, else the whole content as one chunk.
      // Realign to the final doc_id/title/trust_level.
      const rawChunks =
        parsed && parsed.chunks.length
          ? parsed.chunks
          : [{ chunk_id: `${doc_id}#1`, heading: null, text: input.content }];
      const chunks = rawChunks.map((c, i) => ({
        chunk_id: `${doc_id}#${i + 1}`,
        doc_id,
        title,
        heading: c.heading ?? null,
        text: c.text,
        trust_level,
      }));

      await KnowledgeDocument.updateOne({ doc_id }, { $set: docFields }, { upsert: true });
      await KbChunk.deleteMany({ doc_id }); // rebuild chunks
      await KbChunk.insertMany(chunks);
      ids.push(doc_id);
    }

    resetCategoryDocMap(); // titles/trust may have changed
    res.status(201).json({ ingested: ids.length, document_ids: ids });
  },
);
