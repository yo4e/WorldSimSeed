# Talent / Luck reference model for v0.1

Status: implementation validation model for Issue #4

## Purpose

The Talent / Luck world is a **WorldSimSeed engine fixture**, not a claim that the simplified model proves how success works in the real world and not a strict reproduction of the paper that inspired the project.

Its job is to exercise several v0.1 capabilities together:

- many agents,
- sampled immutable attributes,
- equal initial wealth,
- stochastic agent events,
- state-dependent event probability,
- multiplicative state change,
- fixed-seed replay,
- 80 discrete steps,
- distribution/tail/inequality/correlation observers,
- batch runs across parameters and seeds.

The current reference spec is:

- [talent-luck.world.yaml](../examples/talent-luck.world.yaml)

## Current model

Each agent starts with:

- `talent`: normal distribution, mean 0.6, sd 0.1, clamped to [0, 1],
- `wealth`: 10.

Each tick has two agent-scoped events:

1. `lucky_opportunity`
   - chance = `opportunityRate * talent`
   - effect = wealth × 2

2. `misfortune`
   - chance = `misfortuneRate`
   - effect = wealth × 0.5

The baseline runs 80 ticks.

This is the **WorldSimSeed reference rule set**. It should be described as such in demos rather than presented as the original research model verbatim.

## Observers

The reference world currently records:

- mean wealth,
- wealth Gini,
- P10 wealth,
- P90 wealth,
- talent/wealth correlation,
- wealth histogram.

P10/P90 are the current v0.1 tail summaries.

Issue #4 originally mentioned richest/poorest group summaries. The current observer contract does not define conditional group means, so v0.1 does **not** invent that observer only for this demo. If group summaries become generally useful, they should be added as a versioned observer capability with clear semantics.

## Deterministic acceptance

The automated vertical-slice tests establish that:

- the same compiled spec + seed produces the same final state and metrics,
- another seed changes stochastic results,
- the reference world parses and validates,
- the keyed random model and spec hash are stable within the tested engine version.

The CLI reference demo also runs the full 80-step world with seed 42.

Exact numeric golden values should only be frozen when the random model/statistical formulas are intentionally treated as stable compatibility fixtures. For the current development version, deterministic equality within the same engine version is the stronger useful invariant.

## Batch experiments

WorldSimSeed now supports v0.1 experiment requests containing:

- parameter alternatives,
- explicit seeds or a contiguous seed sequence,
- optional selected-seed tracing,
- lower experiment-specific resource limits.

Run order is deterministic:

1. parameter names are sorted,
2. parameter alternatives retain request order,
3. seeds retain explicit/derived order.

The full example:

- [talent-luck.experiment.yaml](../examples/talent-luck.experiment.yaml)

expands:

- 3 opportunity-rate settings
- × 100 seeds
- = 300 runs.

The CI smoke fixture:

- [talent-luck.smoke.experiment.yaml](../examples/talent-luck.smoke.experiment.yaml)

uses 2 parameter settings × 3 seeds = 6 runs. This checks the entire batch path without turning every pull request into a large benchmark.

Batch results retain per-run manifests and metrics and additionally report aggregate count/mean/min/max for numeric observers and total triggered-event count.

## Scenario scope

The scenario list in the original Issue #4 predates the approved v0.1 world-spec boundary. It should not be used to smuggle excluded features back into the DSL.

| Scenario | v0.1 status | Reason |
| --- | --- | --- |
| baseline: talent + luck | supported | current reference world |
| opportunity-rate sweep | supported | parameter matrix in current experiment request |
| luck only | possible as a separate world spec | requires a constant talent initialization rather than changing the baseline spec's distribution at runtime |
| talent only | not defined yet | needs an explicit, scientifically interpretable rule set rather than an ad-hoc switch |
| effort shield | possible as a separate world spec | can be modeled with additional state/events, but is a distinct model |
| network opportunity | deferred | agent-to-agent/network access is an explicit v0.1 non-goal |
| redistribution | deferred in the current DSL | current v0.1 expressions cannot aggregate across agents and agent events cannot mutate shared world state |

For v0.1 reference validation, **baseline + parameter sweep** is the supported comparison. Other representable scenarios should be separate specs so the model change is visible in Git diffs and provenance hashes.

## Interpretation boundary

Output from this model is evidence about **this simulation under these rules**.

Documentation and demos must not phrase results as proof that:

- real-world success is determined by luck,
- the reference model is an exact reproduction of an external study,
- a scenario is a policy prediction.

The run manifest records the exact spec hash, seed, parameters, engine version, and limits so results can be traced back to the actual simulated rules.
