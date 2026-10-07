# Release status and next version

Checked on 2026-10-07 against main `8f778dccc6ecd60fddc0d3efacf49747a04433b4`.

## Published baseline and current main

The latest published GitHub Release is [v0.1.0](https://github.com/yo4e/WorldSimSeed/releases/tag/v0.1.0), tagged at `1660deacd688071a4febba7934ec9c51931914ad`. It was published on 2026-09-25 JST (2026-09-24 23:29:20 UTC). Its [release notes](v0.1.0.md) and [release checklist](../v0.1-release-checklist.md) describe that historical candidate.

Main has the following **unreleased** additions after that tag:

- [PR #24](https://github.com/yo4e/WorldSimSeed/pull/24): human-readable browser demo and read-only `getTrace()` inspection.
- [PR #25](https://github.com/yo4e/WorldSimSeed/pull/25): the minimal self-permission luck world, paired experiment, tests, and interpretation boundary.
- [PR #27](https://github.com/yo4e/WorldSimSeed/pull/27): `ExperimentResult.groups` / CLI group summaries with resolved parameter keys and run/seed provenance; top-level pooled summaries remain unchanged.
- [PR #28](https://github.com/yo4e/WorldSimSeed/pull/28): the [recorded epsilon sweep](../research/2026-10-07-self-permission-epsilon-sweep/README.md), machine-readable evidence, and reproduction/independent validation gate.

The Pages demo tracks main, so its updates do not imply a new tagged release. `package.json` and `ENGINE_VERSION` currently remain `0.1.0`; `private: true` is retained, and there is no npm publication. [CHANGELOG](../../CHANGELOG.md) records the new work under `Unreleased`.

## Version decision

No immediate version change is needed to finish this documentation/research checkpoint. The published tag remains immutable, and unreleased main features are explicitly distinguished from it.

When a new release is requested, **0.2.0 is the proposed next package/engine version**. The reason is the addition of public API capabilities (`groups` and `getTrace()`), rather than a patch consisting only of fixes. This is consistent with the project's [0.x versioning policy](../../CONTRIBUTING.md#versioning-and-changelog). It does not require breaking simulation semantics: pooled aggregates, existing request syntax, and seed/parameter provenance are preserved. World spec, experiment request, and run-manifest format versions stay `0.1` unless their own contracts change.

This document is a proposal, not a release announcement. Package/engine versions, tags, release assets, publication permissions, and npm privacy are not changed here.

## Approval boundary for a later release

A later release preparation should coordinate package and engine version `0.2.0`, finalized changelog/release notes, and the full candidate/main CI gate before creating a new tag or GitHub Release. Existing Pages automation runs on a main merge; release/tag publication is a separate operation requiring approval. npm publication is not proposed.

The archived experiment's source commit, engine version `0.1.0`, specHash, and result SHA-256 remain historical evidence. Bumping `ENGINE_VERSION` changes manifest bytes even when simulated metrics are unchanged. Release preparation must keep that evidence intact and explicitly handle version-aware manifest comparison in the reproduction gate (or reproduce the original full hash on its recorded commit); it must not silently rewrite the recorded hashes to describe a different run. This is a release-preparation consideration, not an additional change required now.

## Deferred work and stopping point

The [seed-sensitivity proposal on Issue #23](https://github.com/yo4e/WorldSimSeed/issues/23#issuecomment-6032191175) records a separate 100-seed comparison as backlog only. It is not a release prerequisite and has not been executed. Named scenarios, automatic paired-delta summaries, new psychological states, and cultural emergence remain deferred.

Once the documentation PR is reviewed, this checkpoint is complete. No additional experiment, feature implementation, or release is needed to close out the current work.
