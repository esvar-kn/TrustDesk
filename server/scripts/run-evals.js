// CLI eval runner.
//   node scripts/run-evals.js [--provider mock|groq|…] [--repeat N]
//                             [--out path.json] [--fail-under 1.0]
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { runEval } from '../src/services/evals/evalRunner.js';
import { GATED_METRICS } from '../src/services/evals/metrics.js';
import { newId } from '../src/services/ids.js';
import EvalRun from '../src/models/EvalRun.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') args.provider = argv[++i];
    else if (a === '--repeat') args.repeat = parseInt(argv[++i], 10);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--fail-under') args.failUnder = parseFloat(argv[++i]);
  }
  return args;
}

function printTable(metrics) {
  const rows = Object.entries(metrics).filter(([k]) => k !== 'cases');
  const width = Math.max(...rows.map(([k]) => k.length));
  // eslint-disable-next-line no-console
  console.log(`\nEval metrics (${metrics.cases} cases):`);
  for (const [k, v] of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${k.padEnd(width)}  ${typeof v === 'number' ? v.toFixed(3) : v}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerName = args.provider || env.LLM_PROVIDER;
  const repeat = Number.isInteger(args.repeat) && args.repeat > 0 ? args.repeat : 1;

  await connectDb();
  logger.info(`running eval: provider=${providerName} repeat=${repeat}`);

  const result = await runEval({ providerName, repeat });
  const eval_run_id = newId('eval');

  await EvalRun.create({
    eval_run_id,
    status: 'completed',
    provider: providerName,
    total_cases: result.case_results.length,
    metrics: result.metrics,
    case_results: result.case_results,
    started_at: result.started_at,
    completed_at: result.completed_at,
  });

  printTable(result.metrics);

  // Per-case pass/fail snapshot.
  // eslint-disable-next-line no-console
  console.log('\nPer-case:');
  for (const r of result.case_results) {
    const reqPass = r.requirement_results.filter((x) => x.status === 'pass').length;
    // eslint-disable-next-line no-console
    console.log(
      `  ${r.case_id} ${r.ticket_id} cat=${r.predicted_category} pri=${r.predicted_priority} esc=${r.predicted_should_escalate} decision=${r.decision} cites=${r.citations.length} reqs=${reqPass}/${r.requirement_results.length}`,
    );
  }

  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ eval_run_id, ...result }, null, 2));
    logger.info(`wrote ${outPath}`);
  }

  await disconnectDb();

  if (args.failUnder != null) {
    const failing = GATED_METRICS.filter((k) => (result.metrics[k] ?? 0) < args.failUnder);
    if (failing.length) {
      // eslint-disable-next-line no-console
      console.error(`\nFAIL: below --fail-under ${args.failUnder}: ${failing.join(', ')}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`\nPASS: all gated metrics >= ${args.failUnder}`);
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'eval run failed');
  process.exit(1);
});
