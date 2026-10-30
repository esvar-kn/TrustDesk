// Deterministic mock LLM provider for tests and keyless CI eval runs.
//
// It sees ONLY the prompt (system + messages) — never the seed_labels — so it
// cannot cheat. It applies naive keyword rules to produce schema-valid triage
// and draft JSON, and cites whatever KB doc ids the prompt actually contains
// (exactly what a real model does with the provided <policy_doc> blocks).
import { performance } from 'node:perf_hooks';
import { env } from '../../config/env.js';
import { TriageOut, DraftOut } from './schemas.js';

const DOC_ID_RE = /KB-[A-Z]+-\d{3}/g;
const INJECTION_RE = /ignore (all|previous|prior)|system override|print your|api[ _-]?key|system prompt|hidden (prompt|instruction)/i;

function promptText({ system, messages = [] }) {
  const parts = [system, ...messages.map((m) => (typeof m === 'string' ? m : m.content))];
  return parts.filter(Boolean).join('\n');
}

// The mock must classify on the CUSTOMER text only — not the system prompt /
// rubric, whose wording ("swelling", "refund", "override") would otherwise
// dominate its keyword rules. A real model reads the whole prompt fine.
function customerText(full) {
  // Require the newline that the real data block has (<customer_message>\n...),
  // so we don't match the tag NAME mentioned inline in the system preamble.
  const m = full.match(/<customer_message>\n([\s\S]*?)\n<\/customer_message>/i);
  return m ? m[1] : full;
}

function mockTriage(text) {
  const t = text.toLowerCase();
  let category = 'general';
  if (/refund|return|replace|damaged|cracked|broken|final sale/.test(t)) category = 'refund';
  else if (/shipping|delivery|tracking|package|transit|carrier/.test(t)) category = 'shipping';
  else if (/warranty|battery|swelling|overheat/.test(t)) category = 'warranty';
  else if (/double charge|duplicate charge|billing|invoice|payment/.test(t)) category = 'billing';
  else if (/account|change.*email|password|identity|system prompt|api key/.test(t))
    category = 'account_security';

  let priority = 'medium';
  if (/swelling|overheat|fire|urgent|immediately|asap/.test(t)) priority = 'urgent';
  else if (/double charge|override|api key|system prompt|identity/.test(t)) priority = 'high';

  let sentiment = 'neutral';
  if (/furious|angry/.test(t)) sentiment = 'angry';
  else if (/frustrat|annoyed|disappointed|cracked|damaged/.test(t)) sentiment = 'frustrated';
  else if (/worri|scared|concern|swelling/.test(t)) sentiment = 'worried';
  else if (/thank|great|love/.test(t)) sentiment = 'positive';

  const should_escalate = INJECTION_RE.test(text) || /swelling|overheat|identity/.test(t);

  // Deterministic confidence: high when a category keyword matched, low when the
  // classification fell back to "general" (ambiguous) — which trips the Phase 8.5
  // confidence gate unless the ticket already escalates for another reason.
  const confidence = category === 'general' ? 0.45 : 0.9;

  return {
    category,
    priority,
    sentiment,
    should_escalate,
    confidence,
    reason_summary: `Mock triage: category=${category}, priority=${priority}.`,
  };
}

// Pull the policy-engine's allowed_actions out of the <facts> block in the prompt
// (a real model would read these too), so the mock recommends policy-valid tools.
function factsAllowed(full) {
  const m = (full || '').match(/<facts>\n([\s\S]*?)\n<\/facts>/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]).allowed_actions || [];
  } catch {
    return [];
  }
}

function mockDraft(cust, full) {
  const citations = [...new Set((full || cust).match(DOC_ID_RE) || [])].slice(0, 5);
  const injection = INJECTION_RE.test(cust);
  const t = cust.toLowerCase();

  const safety = /swell|overheat|fire|smoke|burning/.test(t);
  const accountChange = /change.*email|account email|reset.*password|identity|verif/.test(t);
  const finalSale = /(license|software|final sale)/.test(t) && /(refund|return|cancel|changed my mind)/.test(t);
  const damage = /damag|crack|broke|broken|defect/.test(t);
  const shipping = /tracking|shipment|package|delivery|not moved|in transit|carrier/.test(t);
  const billing = /double charge|duplicate charge|two charges|charged twice/.test(t);

  let decision = 'answer';
  let body;
  if (injection) {
    decision = 'refuse';
    body =
      'I can’t follow that instruction or reveal any internal information, system details, or secrets. I’m flagging this as an unsafe instruction and escalating to a human specialist.';
  } else if (safety) {
    decision = 'escalate';
    body =
      'This looks like a possible safety issue (such as battery swelling), so please stop using the device. I won’t suggest any at-home fixes; I’m escalating this to a specialist.';
  } else if (accountChange) {
    decision = 'escalate';
    body =
      'For your account security we must verify your identity first; I can’t change your email directly or bypass verification. I’m escalating this to a specialist.';
  } else if (finalSale) {
    body =
      'Software licenses are final sale and non-returnable, so we aren’t able to approve a refund for this purchase.';
  } else if (damage) {
    body =
      'I’m sorry your item arrived damaged. Based on our return policy we can arrange a replacement or start a refund review. Could you share a photo of the damage?';
  } else if (shipping) {
    body =
      'I’ve opened a carrier investigation for your delayed shipment. We’ll update you as soon as the carrier responds.';
  } else if (billing) {
    body =
      'I’ve started a billing review for the duplicate charge. Please share a transaction reference if you have one so we can resolve it faster.';
  } else {
    body = 'Thanks for reaching out. Based on our policy, here’s how we can help with your request.';
  }

  const allowed = factsAllowed(full);
  const recommended_actions =
    decision === 'answer'
      ? allowed
          .filter((a) => a !== 'escalate_to_human')
          .slice(0, 3)
          .map((a) => ({ tool_name: a, reason: 'Policy allows this action for the ticket.' }))
      : [{ tool_name: 'escalate_to_human', reason: 'Requires human review.' }];

  return { decision, body, citations, recommended_actions };
}

export const mockProvider = {
  name: 'mock',
  async complete({ system, messages, schema, timeoutMs } = {}) {
    void timeoutMs; // the mock never times out
    const start = performance.now();
    const text = promptText({ system, messages });
    const cust = customerText(text);

    let json;
    if (schema === TriageOut) json = mockTriage(cust);
    else if (schema === DraftOut) json = mockDraft(cust, text);
    else json = {};

    if (schema) json = schema.parse(json); // guarantee schema-valid output

    if (env.MOCK_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, env.MOCK_DELAY_MS));
    }

    return {
      json,
      model: 'mock',
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      latency_ms: Math.round(performance.now() - start),
    };
  },
};
