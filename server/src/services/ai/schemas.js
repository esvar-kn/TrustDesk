// Zod schemas for the model's structured output. One schema validates the LLM
// JSON (and, in the real adapters, is the structured-output contract).
import { z } from 'zod';

export const TriageOut = z.object({
  category: z.enum(['shipping', 'refund', 'warranty', 'billing', 'account_security', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'worried', 'angry']),
  should_escalate: z.boolean(),
  // Model self-reported confidence in this classification (Phase 8.5). Optional so
  // older outputs still validate; a value below CONFIDENCE_THRESHOLD forces escalate.
  confidence: z.number().min(0).max(1).default(0.9),
  reason_summary: z.string().max(300),
});

export const DraftOut = z.object({
  decision: z.enum(['answer', 'escalate', 'refuse']),
  body: z.string().min(1).max(2000),
  citations: z.array(z.string().regex(/^KB-[A-Z]+-\d{3}$/)).max(5),
  recommended_actions: z
    .array(z.object({ tool_name: z.string(), reason: z.string().max(200) }))
    .max(3),
});
