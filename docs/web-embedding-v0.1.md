# Web embedding v0.1

Status: early implementation for Issue #14

WorldSimSeed's browser adapter keeps simulation semantics in the same `spec` / `core` layers used by Node/headless execution. The browser-specific layer owns host capabilities such as fetching a `src` URL, creating a Worker, and rendering a minimal Custom Element shell.

## Minimal embedding

Build the project and serve the repository through an HTTP server, then import the compiled web entry:

```html
<script type="module" src="/dist/src/web/index.js"></script>

<world-sim
  src="/examples/talent-luck.world.yaml"
  seed="42">
</world-sim>
```

Importing `worldsimseed/web` or the compiled web entry registers `<world-sim>` when `customElements` is available.

The reference page is [`examples/web/index.html`](../examples/web/index.html).

## Host capability boundary

`src` is a capability of the embedding page, not of the world spec.

The component loads `src` with browser `fetch()` and `credentials: "omit"`. Normal browser CORS rules apply. Once loaded, the world spec is parsed and validated as untrusted data and receives no network, filesystem, import/include, DOM, or host-object authority.

A host can avoid component-level fetching entirely by assigning the `world` property:

```js
const element = document.querySelector("world-sim");

element.world = worldYamlText;
```

or a JSON-compatible object:

```js
element.world = {
  specVersion: "0.1",
  id: "tiny",
  time: { steps: 1 },
  world: {
    state: {
      counter: {
        type: "number",
        mutable: true,
        init: 0
      }
    }
  },
  events: [],
  observers: []
};
```

## Public component methods

The current browser adapter exposes:

```js
await element.load();
await element.reset({ seed: 42 });
await element.step();
await element.run();
await element.cancel();
await element.getState();
await element.getMetrics();
await element.exportRun();
```

`reset()` starts a new run. v0.1 does not support changing parameters in the middle of an existing run.

`exportRun()` requires the simulation to be complete and returns the resolved manifest, final state, metrics, and optional trace.

## Component properties

- `seed`: uint32 run seed. The HTML `seed` attribute maps to this property.
- `world`: YAML text or a JSON-compatible world object.
- `parameters`: parameter overrides used for the next load/reset.
- `steps`: optional step override.
- `trace`: whether bounded trace capture is enabled.
- `limits`: host-side resource limits.

The built-in component limits are provisional browser-development defaults. They are finite, but they are not the final benchmark-derived v0.1 release defaults.

## DOM events

The component emits data-only Custom Events:

- `worldsim-ready`
- `worldsim-step`
- `worldsim-complete`
- `worldsim-error`
- `worldsim-cancelled`

Event details contain snapshots, metrics, status, or structured error data. They do not expose live mutable core objects.

## Worker behavior

The browser client creates a module Worker using the compiled `worker.js` next to the web entry.

`run()` advances the simulation in bounded chunks and yields to the Worker event loop between chunks. This lets a `cancel` message interrupt a long run instead of waiting for one giant synchronous loop to finish.

The Worker does not remove the need for resource limits. It only moves long-running orchestration off the page's main thread.

## Determinism acceptance

Browser acceptance uses the same Talent-vs-Luck reference world and seed as headless execution. The browser Worker result is compared against a headless run for the same:

- world spec,
- resolved parameters,
- seed,
- step count,
- observer configuration,
- engine version.

A mismatch is a release-blocking determinism failure rather than a presentation difference.

## Current non-goals

This first web slice intentionally does not add:

- charting libraries,
- network visualization,
- agent-dot animation,
- plugin hooks,
- mid-run parameter mutation,
- NOZOMI-specific APIs.

Those should sit above the stable simulation/embedding boundary instead of becoming hidden dependencies of the core.
