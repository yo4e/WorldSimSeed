# World spec v0.1 validation test vectors

Status: design test vectors for Issue #2  
Normative draft: [world-spec-v0.1.md](world-spec-v0.1.md)

These cases describe inputs that a future validator/evaluator must reject. They are intentionally small so they can become executable fixtures when implementation starts.

## 1. Unknown state reference

```yaml
condition: "agent.missing > 0"
```

Expected: semantic validation error before execution.

Reason: `agent.missing` is not declared.

## 2. Randomness inside expression

```yaml
chance: "random() < 0.5"
```

Expected: expression validation error.

Reason: randomness is declarative in v0.1; `random()` is not an allowed function.

## 3. Host/global access

```yaml
condition: "globalThis.process != 0"
```

Expected: expression validation error.

Reason: only documented roots (`agent`, `world`, `param`, `tick`) may be referenced.

## 4. Property indexing / escape attempt

```yaml
condition: "agent[constructor] != 0"
```

Expected: expression validation error.

Reason: computed property access is not in the grammar.

## 5. Dangerous state name

```yaml
agents:
  count: 1
  state:
    __proto__:
      type: number
      init: 0
```

Expected: schema or semantic validation error.

## 6. Write to immutable field

```yaml
agents:
  count: 1
  state:
    talent:
      type: number
      mutable: false
      init: 0.5

events:
  - id: mutate_talent
    scope: agent
    effects:
      - target: agent.talent
        op: set
        value: 1
```

Expected: semantic validation error.

## 7. Agent event mutates world state

```yaml
events:
  - id: global_write_from_agent
    scope: agent
    effects:
      - target: world.resource
        op: add
        value: -1
```

Expected: semantic validation error.

Reason: per-agent events may read but not mutate world state in v0.1.

## 8. World event references agent state

```yaml
events:
  - id: illegal_agent_read
    scope: world
    condition: "agent.wealth > 10"
    effects:
      - target: world.flag
        op: set
        value: true
```

Expected: semantic validation error.

## 9. Chance outside probability range

```yaml
chance: "param.rate * 100"
```

Expected:

- if statically provable from parameter bounds: semantic validation error before execution,
- otherwise: typed runtime validation error before drawing/applying the event when the resolved value falls outside `[0, 1]`.

The runtime must not clamp silently.

## 10. Numeric non-finite result

```yaml
value: "1 / 0"
```

Expected: numeric error; no Infinity/NaN is stored.

## 11. Duplicate IDs

Two events or two observers with the same ID:

```yaml
events:
  - id: same
    scope: world
    effects: []
  - id: same
    scope: world
    effects: []
```

Expected: semantic validation error.

(An empty `effects` list is itself invalid under the schema, so an executable fixture should include valid effects and isolate the duplicate-ID failure.)

## 12. Unsupported agent-to-agent access

```yaml
condition: "agents[0].wealth > agent.wealth"
```

Expected: expression validation error.

## 13. Unsupported loop/function syntax

```yaml
condition: "for(x in agents) x.wealth > 0"
```

Expected: expression parse/validation error.

## 14. Invalid type operation

Boolean target with numeric add:

```yaml
effects:
  - target: agent.active
    op: add
    value: 1
```

Expected: semantic type error.

## 15. Host limit exceeded

A spec declares `agents.count: 10000` while the effective host limit is `maxAgents: 5000`.

Expected: resource/preflight validation error before initialization.

## 16. Invalid batch seed sequence

```yaml
runs:
  seeds:
    base: 4294967290
    count: 10
```

Expected: experiment-request validation error because the derived sequence exceeds uint32.

## Acceptance use

When implementation starts, convert these cases into executable negative fixtures. Each fixture should assert a stable structured error category/code rather than matching fragile human-readable text.
