import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { compileWorld, parseWorld, validateWorld } from '../dist/src/spec/index.js';
import { runExperiment, runWorld, validateExperimentRequest, ENGINE_VERSION } from '../dist/src/runner/index.js';
import { DEFAULT_RESOURCE_LIMITS } from '../dist/src/limits.js';

const startedAt = new Date().toISOString();
const root = new URL('../', import.meta.url);
const evidence = new URL('../docs/research/2026-10-07-self-permission-epsilon-sweep/', import.meta.url);
if (process.argv.length !== 3) {
  throw new Error('Usage: node scripts/reproduce-epsilon-sweep.mjs /absolute/output-directory');
}
const outputPath = resolve(process.argv[2]);
if (outputPath === fileURLToPath(evidence).replace(/\/$/, '')) {
  throw new Error('Use a separate output directory to preserve the recorded evidence.');
}
await mkdir(outputPath, { recursive: true });
const dir = pathToFileURL(outputPath + '/');
const write = (name, data) => writeFile(new URL(name, dir), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
const request = validateExperimentRequest(JSON.parse(await readFile(new URL('request.json', evidence), 'utf8')));
const source = await readFile(new URL(request.world, evidence), 'utf8');
const limits = DEFAULT_RESOURCE_LIMITS;
const compiled = compileWorld(validateWorld(parseWorld(source, { format: 'yaml' }), { limits }));
const result = runExperiment(compiled, request, limits);
const replay = runExperiment(compiled, request, limits);
assert.deepEqual(result, replay);
assert.equal(result.runCount, 60);
assert.equal(result.groups.length, 3);
const ids = ['mean_wealth', 'wealth_gini', 'permission_wealth_correlation'];
const metrics = [...ids, 'eventCount'];
const biases = [0, 0.0001, 0.001];
const seeds = Array.from({ length: 20 }, (_, i) => i + 42);
const byBias = new Map(biases.map(b => [b, new Map()]));
const rows = [];
const values = run => Object.fromEntries([...ids.map(id => [id, run.metrics.values[id]]), ['eventCount', run.eventCount]]);
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
// Independent calculations: no runtime aggregation helper is imported.
const stats = xs => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { count: xs.length, mean, min: sorted[0], max: sorted.at(-1),
    median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
    sampleSD: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)),
    positive: xs.filter(x => x > 0).length, zero: xs.filter(x => x === 0).length,
    negative: xs.filter(x => x < 0).length };
};
for (const run of result.runs) {
  const bias = run.manifest.parameters.permissionLuckBias;
  assert.equal(run.manifest.steps, 80);
  assert.equal(run.manifest.world.specHash, compiled.specHash);
  assert.equal(byBias.get(bias).has(run.manifest.seed), false);
  for (const [id, value] of Object.entries(values(run))) assert.ok(Number.isFinite(value), id);
  assert.ok(run.metrics.values.wealth_gini >= 0 && run.metrics.values.wealth_gini <= 1);
  assert.ok(Math.abs(run.metrics.values.permission_wealth_correlation) <= 1);
  byBias.get(bias).set(run.manifest.seed, run);
  rows.push({ bias, seed: run.manifest.seed, ...values(run) });
}
for (const group of result.groups) {
  assert.equal(group.runCount, 20);
  assert.deepEqual(group.seeds, seeds);
  assert.equal(group.key, JSON.stringify(JSON.parse(group.key)));
  const selected = group.runIndices.map(i => result.runs[i]);
  assert.deepEqual(selected.map(r => r.manifest.seed), seeds);
  for (const id of metrics) {
    const independent = stats(selected.map(r => values(r)[id]));
    const aggregate = id === 'eventCount' ? group.eventCount : group.aggregates[id];
    for (const field of ['count', 'mean', 'min', 'max']) close(aggregate[field], independent[field]);
  }
}
for (const id of metrics) {
  const independent = stats(result.runs.map(r => values(r)[id]));
  const pooled = id === 'eventCount' ? result.eventCount : result.aggregates[id];
  for (const field of ['count', 'mean', 'min', 'max']) close(pooled[field], independent[field]);
}
const deltas = [];
const paired = [];
for (const [from, to] of [[0, 0.0001], [0, 0.001], [0.0001, 0.001]]) {
  const pair = seeds.map(seed => {
    const a = values(byBias.get(from).get(seed));
    const b = values(byBias.get(to).get(seed));
    return { from, to, seed, ...Object.fromEntries(metrics.map(id => [id, b[id] - a[id]])) };
  });
  deltas.push(...pair);
  const summary = { from, to, metrics: Object.fromEntries(metrics.map(id => [id, stats(pair.map(r => r[id]))])) };
  for (const id of metrics) {
    const fromGroup = result.groups.find(g => g.parameters.permissionLuckBias === from);
    const toGroup = result.groups.find(g => g.parameters.permissionLuckBias === to);
    const a = id === 'eventCount' ? fromGroup.eventCount : fromGroup.aggregates[id];
    const b = id === 'eventCount' ? toGroup.eventCount : toGroup.aggregates[id];
    close(summary.metrics[id].mean, b.mean - a.mean);
  }
  const wealthChanges = pair.map(r => r.mean_wealth);
  const total = wealthChanges.reduce((a, b) => a + b, 0);
  summary.largestWealthDeltaSeed = pair[wealthChanges.indexOf(Math.max(...wealthChanges))].seed;
  summary.largestWealthDeltaShare = Math.max(...wealthChanges) / total;
  paired.push(summary);
}
// Direct traced runs independently confirm batch parity and semantic invariants.
const invariants = [];
for (const seed of seeds) {
  let previous;
  let previousCounts;
  for (const bias of biases) {
    const batch = byBias.get(bias).get(seed);
    const direct = runWorld(compiled, { seed, parameters: batch.manifest.parameters, limits,
      trace: { enabled: true } });
    assert.deepEqual(direct.metrics, batch.metrics);
    assert.equal(direct.eventCount, batch.eventCount);
    assert.equal(direct.trace.length, direct.eventCount);
    const counts = Object.create(null);
    for (const event of direct.trace) counts[event.eventId] = (counts[event.eventId] ?? 0) + 1;
    if (previous) {
      assert.equal(counts.misfortune, previousCounts.misfortune);
      assert.ok(counts.lucky_opportunity >= previousCounts.lucky_opportunity);
      for (let i = 0; i < direct.finalState.agents.length; i++) {
        assert.equal(direct.finalState.agents[i].state.self_permission, previous.agents[i].state.self_permission);
        assert.ok(direct.finalState.agents[i].state.wealth >= previous.agents[i].state.wealth);
      }
    }
    invariants.push({ seed, bias, ...counts });
    previous = direct.finalState;
    previousCounts = counts;
  }
}
const csv = (data, columns) => columns.join(',') + '\n' + data.map(row => columns.map(c => row[c]).join(',')).join('\n') + '\n';
const resultJson = JSON.stringify(result, null, 2) + '\n';
// The full replay result stays in the output directory, not in version control.
await write('result.json', resultJson);
await write('group-summaries.json', {
  experimentVersion: result.experimentVersion, world: result.world,
  runCount: result.runCount, eventCount: result.eventCount,
  aggregates: Object.fromEntries(ids.map(id => [id, result.aggregates[id]])),
  groups: result.groups.map(group => ({ ...group,
    aggregates: Object.fromEntries(ids.map(id => [id, group.aggregates[id]])) })),
});
await write('per-run.csv', csv(rows, ['bias', 'seed', ...metrics]));
await write('paired-deltas.csv', csv(deltas, ['from', 'to', 'seed', ...metrics]));
await write('paired-summary.json', paired);
await write('event-invariants.csv', csv(invariants, ['seed', 'bias', 'lucky_opportunity', 'misfortune']));
await write('validation.json', {
  status: 'passed', totalRuns: 60, replayRuns: 60, directTraceRuns: 60,
  checks: ['exact batch replay', '3 groups of 20 and seed identity', 'finite metrics and bounds',
    'independent per-group and pooled count/mean/min/max', 'paired delta mean = group mean difference',
    'direct-run metrics/event parity', 'trace count = eventCount',
    'all seeds: unchanged self_permission and misfortune counts',
    'all seeds/agents: nondecreasing wealth with increasing bias', 'nondecreasing opportunity counts'],
});
await write('provenance.json', {
  startedAt, completedAt: new Date().toISOString(), node: process.version, engineVersion: ENGINE_VERSION,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim(),
  specHash: compiled.specHash, sourceSha256: createHash('sha256').update(source).digest('hex'),
  resultSha256: createHash('sha256').update(resultJson).digest('hex'),
  seeds, biases, agents: 1000, steps: 80, limits,
});
console.log(JSON.stringify({ groups: result.groups, paired }, null, 2));
