"""Independently validate saved JSON and CSV using Python standard library."""
import csv, hashlib, json, math, statistics, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / 'docs/research/2026-10-07-self-permission-epsilon-sweep'
result = json.loads((p / 'group-summaries.json').read_text())
provenance = json.loads((p / 'provenance.json').read_text())
request = json.loads((p / 'request.json').read_text())
assert request['parameters'] == {'permissionLuckBias': [0, 0.0001, 0.001]}
assert request['runs']['seeds'] == {'base': 42, 'count': 20}
assert (p / request['world']).resolve() == (p.parents[2] / 'examples/self-permission-luck.world.yaml').resolve()
assert provenance['seeds'] == list(range(42, 62))
assert provenance['biases'] == [0, 0.0001, 0.001]
assert provenance['agents'] == 1000 and provenance['steps'] == 80
assert len(sys.argv) <= 2, 'Usage: python3 scripts/verify-epsilon-sweep.py [reproduction-output]'
# The full result is intentionally omitted from version control; compare on reproduction.
assert hashlib.sha256((p.parents[2] / 'examples/self-permission-luck.world.yaml').read_bytes()).hexdigest() == provenance['sourceSha256']
assert result['world']['specHash'] == provenance['specHash']
ids = ['mean_wealth', 'wealth_gini', 'permission_wealth_correlation', 'eventCount']
def close(a, b):
    assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-12), (a, b)
def parse(name):
    return [{k: float(v) for k, v in row.items()} for row in csv.DictReader((p / name).open())]
runs = parse('per-run.csv')
deltas = parse('paired-deltas.csv')
assert len(runs) == len(deltas) == 60
lookup = {(row['bias'], int(row['seed'])): row for row in runs}
assert len(lookup) == 60
assert set(lookup) == {(bias, seed) for bias in [0, 0.0001, 0.001] for seed in range(42, 62)}
assert all(row['seed'].is_integer() for row in runs + deltas)
assert all(math.isfinite(row[id]) for row in runs + deltas for id in ids)
assert len(result['groups']) == 3
assert len({g['key'] for g in result['groups']}) == 3
assert {(row['from'], row['to'], row['seed']) for row in deltas} == {
    (a, b, seed) for a, b in [(0, 0.0001), (0, 0.001), (0.0001, 0.001)] for seed in range(42, 62)}
for group in result['groups']:
    bias = group['parameters']['permissionLuckBias']
    selected = [row for row in runs if row['bias'] == bias]
    assert [int(r['seed']) for r in selected] == list(range(42, 62))
    assert group['runCount'] == 20
    assert group['runIndices'] == [i for i, row in enumerate(runs) if row['bias'] == bias]
    assert group['seeds'] == list(range(42, 62))
    assert json.loads(group['key']) == group['parameters']
    assert group['parameters']['opportunityRate'] == group['parameters']['misfortuneRate'] == 0.1
    for id in ids:
        xs = [r[id] for r in selected]
        agg = group['eventCount'] if id == 'eventCount' else group['aggregates'][id]
        assert agg['count'] == len(xs) == 20
        close(agg['mean'], statistics.mean(xs))
        close(agg['min'], min(xs))
        close(agg['max'], max(xs))
for row in deltas:
    for id in ids:
        close(row[id], lookup[(row['to'], int(row['seed']))][id] - lookup[(row['from'], int(row['seed']))][id])
for pair in json.loads((p / 'paired-summary.json').read_text()):
    selected = [r for r in deltas if (r['from'], r['to']) == (pair['from'], pair['to'])]
    assert len(selected) == 20
    for id in ids:
        xs = [r[id] for r in selected]
        summary = pair['metrics'][id]
        for key, expected in [('mean',statistics.mean(xs)),('median',statistics.median(xs)),
                              ('sampleSD',statistics.stdev(xs)),('min',min(xs)),('max',max(xs))]:
            close(summary[key], expected)
        assert summary['count'] == 20
        assert summary['zero'] == sum(x == 0 for x in xs)
        assert summary['positive'] == sum(x > 0 for x in xs)
        assert summary['negative'] == sum(x < 0 for x in xs)
events = parse('event-invariants.csv')
assert len(events) == 60
assert {(row['bias'], row['seed']) for row in events} == set(lookup)
for seed in range(42, 62):
    selected = sorted((row for row in events if row['seed'] == seed), key=lambda row: row['bias'])
    assert len({row['misfortune'] for row in selected}) == 1
    opportunities = [row['lucky_opportunity'] for row in selected]
    assert opportunities == sorted(opportunities)
for row in events:
    close(row['lucky_opportunity'] + row['misfortune'], lookup[(row['bias'], int(row['seed']))]['eventCount'])
assert result['runCount'] == 60
for id in ids:
    xs = [r[id] for r in runs]
    aggregate = result['eventCount'] if id == 'eventCount' else result['aggregates'][id]
    assert aggregate['count'] == 60
    close(aggregate['mean'], statistics.mean(xs))
    close(aggregate['min'], min(xs))
    close(aggregate['max'], max(xs))
if len(sys.argv) > 1:
    generated = Path(sys.argv[1]).resolve()
    for name in ['group-summaries.json', 'paired-summary.json']:
        assert json.loads((generated / name).read_text()) == json.loads((p / name).read_text()), name
    for name in ['per-run.csv', 'paired-deltas.csv', 'event-invariants.csv']:
        assert (generated / name).read_bytes() == (p / name).read_bytes(), name
    assert hashlib.sha256((generated / 'result.json').read_bytes()).hexdigest() == provenance['resultSha256']
print('PASS: independent Python JSON/CSV, group statistics, paired statistics, hashes, event decomposition')
