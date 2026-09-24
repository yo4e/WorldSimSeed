# Changelog

All notable changes to WorldSimSeed will be documented in this file.

The project follows Semantic Versioning for releases. During the `0.x` period, minor releases may intentionally change unstable public APIs or the world-spec contract; such changes must be documented.

## [Unreleased]

### Added

- Shared conservative v0.1 resource defaults plus a reproducible Node/Chromium release-benchmark harness and recorded benchmark evidence.
- JSON Schema artifact ↔ runtime validator conformance fixtures and hardening tests for resource limits, dangerous names, malformed/unknown input, batch seed overflow, unknown parameters, and deterministic replay.
- Package dry-run, production dependency audit, clean tarball install/import smoke, and expanded Chromium component/API/security release gates in CI.
- Public API, resource benchmark, and known-limitations documentation for the v0.1 release candidate.
- Browser Worker adapter and minimal `<world-sim>` Custom Element with host-owned `src` loading, step/run/reset/cancel controls, data-only DOM events, Shadow DOM, and Chromium E2E parity checks against headless execution.
- Web embedding documentation and a minimal browser demo page.
- Batch experiment runner and CLI command with parameter-matrix expansion, deterministic seed sequences, selected-seed traces, numeric observer aggregates, event counts, and a 6-run CI smoke experiment.
- Talent/Luck reference-model validation notes and P10/P90 wealth observers.
- First TypeScript vertical slice: restricted YAML parsing, structural/semantic validation, safe expression evaluation, deterministic seeded simulation core, observers, run manifest, headless CLI, tests, and pull-request CI.
- Initial OSS-readiness documentation covering security, contribution policy, release readiness, and the untrusted-world-spec boundary.
- MIT License.
- v0.1 world spec design, run-manifest contract, JSON Schema artifact, validation test vectors, and three sample worlds.

### Changed

- Reconciled the security model, run-manifest contract, README, package surface, and v0.1 release checklist with the executable release-candidate behavior.
- Replaced provisional CLI/Web resource ceilings with shared benchmark-backed defaults: 5,000 agents, 500 steps, 1,000,000 events, 50,000 retained trace records, and 100 batch runs (`<world-sim>` uses one run).
- Documented the requirement for explicit runtime resource limits and fail-closed validation before v0.1.
