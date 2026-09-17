# Changelog

All notable changes to WorldSimSeed will be documented in this file.

The project follows Semantic Versioning for releases. During the `0.x` period, minor releases may intentionally change unstable public APIs or the world-spec contract; such changes must be documented.

## [Unreleased]

### Added

- Browser Worker adapter and minimal `<world-sim>` Custom Element with host-owned `src` loading, step/run/reset/cancel controls, data-only DOM events, Shadow DOM, and Chromium E2E parity checks against headless execution.
- Web embedding documentation and a minimal browser demo page.
- Batch experiment runner and CLI command with parameter-matrix expansion, deterministic seed sequences, selected-seed traces, numeric observer aggregates, event counts, and a 6-run CI smoke experiment.
- Talent/Luck reference-model validation notes and P10/P90 wealth observers.
- First TypeScript vertical slice: restricted YAML parsing, structural/semantic validation, safe expression evaluation, deterministic seeded simulation core, observers, run manifest, headless CLI, tests, and pull-request CI.
- Initial OSS-readiness documentation covering security, contribution policy, release readiness, and the untrusted-world-spec boundary.
- MIT License.
- v0.1 world spec design draft, run-manifest contract, JSON Schema draft, validation test vectors, and three sample worlds.

### Changed

- Documented the requirement for explicit runtime resource limits and fail-closed validation before v0.1.
