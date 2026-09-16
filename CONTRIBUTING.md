# Contributing to WorldSimSeed

WorldSimSeed is currently in the concept / research phase. Contributions are welcome, but the main goal before implementation is to keep the v0.1 contracts small, reviewable, deterministic, and safe.

## Before opening a change

Check the relevant Issues and design documents first. In particular, changes to the world spec, expression language, runtime boundary, embedding model, reproducibility contract, or security model should be discussed against the existing v0.1 design work rather than introduced implicitly in code.

## Contribution principles

- Keep the simulation core independent from presentation.
- Treat world specs as untrusted data.
- Do not add arbitrary JavaScript execution or an equivalent escape hatch.
- Prefer explicit, schema-validatable syntax over magical behavior.
- Preserve deterministic behavior when the same spec, parameters, engine version, and seed are used.
- Keep browser and headless semantics aligned.
- Do not weaken resource limits for convenience.
- Document intentional breaking changes.

## Pull requests

A useful pull request should:

- explain the behavior or design decision being changed,
- reference the relevant Issue when one exists,
- include tests for executable changes when implementation exists,
- update docs when public behavior changes,
- call out any unverified assumptions or environment-dependent checks.

Security-sensitive changes should include a brief threat analysis and negative tests for rejected inputs where practical.

## Versioning and changelog

WorldSimSeed will use Semantic Versioning for published packages/releases.

During the `0.x` period:

- `0.MINOR.0` may contain intentional breaking changes while the API/spec is still stabilizing,
- patch releases should remain compatible within that minor line,
- breaking changes must be called out in the changelog and migration notes.

The world spec must carry its own explicit spec version so that engine version and document-format version are not conflated.

User-visible changes should be recorded in [CHANGELOG.md](CHANGELOG.md).

## Code of Conduct

A separate Code of Conduct is intentionally deferred while the project is still a small pre-release repository. It should be added before broad community contribution is actively solicited, or earlier if contribution activity makes shared conduct expectations useful.

## License

Contributions are expected to be made under the repository license. The v0.1 readiness work proposes the MIT License; merging that license is the maintainer's explicit project-level decision.
