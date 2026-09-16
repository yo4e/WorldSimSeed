# Security Policy

WorldSimSeed treats every externally supplied world spec as **untrusted input**.

The project is still in the concept / research phase and has no released runtime yet. Security rules documented here are therefore design constraints for v0.1, not claims about an already hardened implementation.

## Supported versions

No released version is currently supported.

After v0.1 is released, this section will list supported release lines and security-fix policy.

## Security invariants for v0.1

A conforming v0.1 implementation must preserve these invariants:

- A world spec is data, not executable host code.
- No arbitrary JavaScript execution from a spec.
- No `eval`, `new Function`, dynamic module loading, or equivalent escape hatch for spec expressions.
- No direct access from a spec to DOM globals, `globalThis`, Node.js globals, filesystem, process state, network APIs, or host application objects.
- Expressions use a default-deny evaluator. Only explicitly documented operators, functions, identifiers, and state paths are available.
- Dangerous property names and prototype traversal such as `__proto__`, `prototype`, and `constructor` are rejected.
- v0.1 specs cannot define unbounded loops, recursion, imports/includes, arbitrary file paths, or arbitrary URL fetches.
- Runtime work is bounded by host-configurable resource limits and can be aborted.
- Invalid or unsupported input fails closed with an explicit validation error.
- AI-generated specs receive exactly the same validation and limits as hand-written specs.

See [docs/security-model.md](docs/security-model.md) for the threat model and resource-limit policy.

## Reporting a vulnerability

Please do not post exploit details, proof-of-concept payloads, tokens, or other sensitive information in a public issue.

If GitHub private vulnerability reporting is enabled for this repository, use that channel.

If no private security-reporting channel is available, open a minimal public issue that states only that you have a security report and asks the maintainer to establish a private contact path. Do not include technical exploit details in that issue.

For non-sensitive hardening suggestions, ordinary GitHub issues are appropriate.

## Disclosure expectations

The project aims to:

1. acknowledge a private report when a private channel exists,
2. reproduce and classify the issue,
3. prepare a fix and regression test where applicable,
4. document affected versions,
5. publish details only after a fix or mitigation is available when practical.

These are project intentions rather than a service-level agreement.
