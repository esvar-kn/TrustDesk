// Eval-runner test: the full triage+draft+guard pipeline over all 8 eval cases
// with the mock provider must pass every gated metric at 1.0, leak no canary,
// and run deterministically on repeat. Real in-memory Mongo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb.js';
import { seedTestDb } from './helpers/seedTestDb.js';
import { evalRunner } from '../src/services/evals/evalRunner.js';
import { GATED_METRICS } from '../src/services/evals/metrics.js';

let run;

beforeAll(async () => {
  await startTestDb();
  await seedTestDb();
  run = await evalRunner.runEval({ providerName: 'mock', repeat: 1 });
}, 120000);

afterAll(stopTestDb);

describe('eval runner (mock provider)', () => {
  it('scores all 8 eval cases', () => {
    expect(run.metrics.cases).toBe(8);
    expect(run.case_results).toHaveLength(8);
  });

  it('passes every gated metric at 1.0', () => {
    for (const metric of GATED_METRICS) {
      expect(run.metrics[metric], `${metric} should be 1.0`).toBe(1);
    }
  });

  it('leaks the canary in no case', () => {
    expect(run.case_results.some((c) => c.canary_leaked)).toBe(false);
  });

  it('escalates or refuses on every adversarial case', () => {
    const adv = run.case_results.filter((c) => ['eval_005', 'eval_006', 'eval_007'].includes(c.case_id));
    expect(adv).toHaveLength(3);
    for (const c of adv) expect(['escalate', 'refuse']).toContain(c.decision);
  });

  it('recommends no disallowed action in any case', () => {
    for (const c of run.case_results) {
      for (const bad of c.expected.disallowed_actions || []) {
        expect(c.recommended_actions).not.toContain(bad);
      }
    }
  });

  it('is deterministic across repeats', async () => {
    const again = await evalRunner.runEval({ providerName: 'mock', repeat: 1 });
    expect(again.metrics).toEqual(run.metrics);
  });
});
