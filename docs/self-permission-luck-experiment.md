# Self-permission → luck: minimal thought experiment

This is an intentionally small WorldSimSeed thought experiment derived from Issue #23.

It is **not** a claim that self-permission, virtue, belief, or any similar psychological property changes luck in the real world. The point is to test whether WorldSimSeed can express and compare a small rule of this shape without adding engine-specific code.

## Question

Can the existing v0.1 world spec express a controlled comparison where an agent's fixed `self_permission` value adds a very small bias to an otherwise random opportunity draw?

## World

`examples/self-permission-luck.world.yaml` creates 1,000 agents for 80 half-year steps.

Each agent starts with:

- `self_permission`: fixed uniform value in `[0, 1]`
- `wealth`: `10`

Each step has two independent agent events:

- `lucky_opportunity`: doubles wealth
- `misfortune`: halves wealth

The lucky-opportunity probability is:

```text
clamp(opportunityRate + permissionLuckBias * self_permission, 0, 1)
```

The default opportunity and misfortune rates are both `0.10`.

## Paired scenarios

The experiment file compares:

- **A / baseline:** `permissionLuckBias = 0`
- **B / biased:** `permissionLuckBias = 0.001`

It runs seeds `42..61` in both scenarios.

Because WorldSimSeed derives random event draws from stable semantic coordinates that include seed, tick, event ID, and agent ID, the same seed reuses the same underlying opportunity/misfortune draws in A and B. The scenario changes the probability threshold, not the random coordinate. This makes the comparison a useful paired counterfactual rather than two unrelated Monte Carlo samples.

## What to inspect

The world reports:

- mean wealth
- wealth Gini
- `self_permission` ↔ wealth correlation
- wealth p10 / p90
- wealth histogram

Each run record also reports total triggered `eventCount`.

The first implementation test additionally checks a useful monotonic property for seed 42: because the experimental bias is non-negative and all other event probabilities use the same semantic random coordinates, the biased scenario must not make any agent poorer than the baseline through this rule alone.

## Running it

After building the project:

```bash
node dist/src/cli.js experiment examples/self-permission-luck.experiment.yaml
```

The raw experiment result contains both parameter values and the same seed sequence for each value.

## v0.1 friction discovered

`runExperiment()` keeps top-level numeric `aggregates` and `eventCount` pooled across
all 40 runs for compatibility. Its additive `groups` field provides two separate
20-run summaries keyed by the complete resolved parameter set, including defaults.
Each group summarizes mean wealth, Gini, correlation, percentiles, and event counts.
`runIndices` and `seeds` connect each summary to the canonical detailed runs.

Paired deltas can still be reconstructed by matching the same seed across groups;
automatic paired-delta summaries and named scenarios are deferred. See the
[grouped-result contract](run-manifest-v0.1.md#grouped-summaries-issue-26).

## Scope after this experiment

This pass intentionally does not model:

- `self_judged_goodness`
- `integrity`
- changing self-permission over time
- self-deception or value-model conflict
- cooperation / betrayal
- cultural learning or emergence of religion-like explanations

Those can be added only after this smallest rule proves useful and the experiment workflow itself is comfortable enough to support them.
