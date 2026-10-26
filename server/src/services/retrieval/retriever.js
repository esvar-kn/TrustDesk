// Deterministic retrieval over the knowledge base.
//
// kb_chunks carries a weighted text index (title 5 / heading 3 / text 1). We
// search chunks, GROUP BY doc_id keeping each document's best chunk score, then
// (2.3) apply a category boost and split results into trusted `context` vs
// `quarantined` (untrusted) lists.
import KbChunk from '../../models/KbChunk.js';
import KnowledgeDocument from '../../models/KnowledgeDocument.js';

const SNIPPET_LEN = 200;
const CATEGORY_BOOST = 1.5;

function makeSnippet(heading, text) {
  const body = (text || '').trim().slice(0, SNIPPET_LEN);
  return heading ? `${heading} — ${body}` : body;
}

// Derive a triage category from a document TITLE (never from eval labels).
// Coupon / security-playbook / adversarial titles map to nothing — no boost.
export function titleToCategory(title = '') {
  const t = title.toLowerCase();
  if (/refund|return/.test(t)) return 'refund';
  if (/shipping|delivery/.test(t)) return 'shipping';
  if (/warranty/.test(t)) return 'warranty';
  if (/billing|payment|charge/.test(t)) return 'billing';
  if (/account/.test(t)) return 'account_security';
  return null;
}

// category -> doc_id, built once from trusted documents' titles at first use
// (equivalent to building it at ingest). Call resetCategoryDocMap() in tests.
let categoryDocMapCache = null;
export async function getCategoryDocMap() {
  if (categoryDocMapCache) return categoryDocMapCache;
  const docs = await KnowledgeDocument.find({ trust_level: 'trusted' })
    .select('doc_id title -_id')
    .lean();
  const map = {};
  for (const d of docs) {
    const category = titleToCategory(d.title);
    if (category && !map[category]) map[category] = d.doc_id;
  }
  categoryDocMapCache = map;
  return map;
}
export function resetCategoryDocMap() {
  categoryDocMapCache = null;
}

// Rank documents for a query: one row per doc (best chunk score), score desc.
async function rankDocs(query) {
  const chunks = await KbChunk.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' }, doc_id: 1, title: 1, heading: 1, text: 1, trust_level: 1 },
  )
    .sort({ score: { $meta: 'textScore' } })
    .lean();

  const byDoc = new Map();
  for (const c of chunks) {
    if (!byDoc.has(c.doc_id)) {
      byDoc.set(c.doc_id, {
        doc_id: c.doc_id,
        title: c.title,
        snippet: makeSnippet(c.heading, c.text),
        score: c.score,
        trust_level: c.trust_level,
      });
    }
  }
  return [...byDoc.values()];
}

// search(query, { k, categoryHint }) -> { context, quarantined }
//   context     — trusted docs, top k by (boosted) score
//   quarantined  — untrusted docs that matched, top k (kept for the trace;
//                  never fed to a prompt)
// When categoryHint is set, the matching category's doc gets a ×1.5 boost.
export async function search(query, { k = 5, categoryHint = null } = {}) {
  if (!query || !query.trim()) return { context: [], quarantined: [] };

  const ranked = await rankDocs(query);

  if (categoryHint) {
    const map = await getCategoryDocMap();
    const boostDocId = map[categoryHint];
    if (boostDocId) {
      for (const d of ranked) {
        if (d.doc_id === boostDocId) {
          d.score *= CATEGORY_BOOST;
          d.boosted = true;
        }
      }
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  const context = ranked.filter((d) => d.trust_level !== 'untrusted').slice(0, k);
  const quarantined = ranked.filter((d) => d.trust_level === 'untrusted').slice(0, k);
  return { context, quarantined };
}

export const retriever = { search, getCategoryDocMap, resetCategoryDocMap, titleToCategory };
