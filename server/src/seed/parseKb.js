// Parses the knowledge-base markdown files into documents + section chunks.
// Pure (no DB): the seeder (Phase 1.4) persists what this returns.
//
// Each file looks like:
//   # Title
//   Doc ID: KB-REFUND-001
//   Audience: Customer support agents
//   Version: 2026.07
//   ## Section heading
//   body...
//
// Trust is decided by PROVENANCE (the Audience line), never by scanning content —
// KB-SECURITY-001 legitimately quotes injection phrases, so content scanning would
// wrongly quarantine a doc the eval cases must cite.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Only these audiences are trusted; anything else is untrusted (e.g. the
// "Imported vendor documentation" of KB-ADVERSARIAL-001).
export const TRUSTED_AUDIENCES = [
  'Customer support agents',
  'Engineering and support administrators',
];

function firstMatch(content, re) {
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

export function trustLevelFor(audience) {
  return TRUSTED_AUDIENCES.includes((audience || '').trim()) ? 'trusted' : 'untrusted';
}

// Split the body into { heading, text } blocks, one per `## ` (h2) section.
// The title/header preamble before the first h2 is not emitted as a chunk.
function splitSections(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/); // h2 only — `### ` does not match
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, text: s.body.join('\n').trim() }));
}

export function parseKbContent(content, { sourcePath = null } = {}) {
  const title = firstMatch(content, /^#\s+(.+?)\s*$/m);
  const doc_id = firstMatch(content, /^Doc ID:\s*(.+?)\s*$/m);
  const audience = firstMatch(content, /^Audience:\s*(.+?)\s*$/m);
  const version = firstMatch(content, /^Version:\s*(.+?)\s*$/m);

  if (!doc_id) throw new Error(`KB document missing "Doc ID:" line${sourcePath ? ` (${sourcePath})` : ''}`);

  const trust_level = trustLevelFor(audience);
  const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  const document = {
    doc_id,
    title,
    audience,
    version,
    trust_level,
    checksum,
    source_path: sourcePath,
    content,
  };

  const chunks = splitSections(content).map((section, i) => ({
    chunk_id: `${doc_id}#${i + 1}`,
    doc_id,
    title, // denormalized so the weighted text index can rank it
    heading: section.heading,
    text: section.text,
    trust_level,
  }));

  return { document, chunks };
}

export function parseKbFile(filePath, { baseDir = null } = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourcePath = baseDir ? path.relative(baseDir, filePath) : path.basename(filePath);
  return parseKbContent(content, { sourcePath });
}

// Parse every .md file in a directory (sorted for deterministic output).
// `baseDir` is what source_path is made relative to (defaults to the repo root
// one level above the knowledge_base dir).
export function parseKbDir(dir, { baseDir = path.resolve(dir, '..') } = {}) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const documents = [];
  const chunks = [];
  for (const file of files) {
    const parsed = parseKbFile(path.join(dir, file), { baseDir });
    documents.push(parsed.document);
    chunks.push(...parsed.chunks);
  }
  return { documents, chunks };
}
