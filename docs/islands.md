# Islands (`packages/atoll/` + `packages/atoll-island/`)

Worker-rendered islands on the real Atoll engine
(`docs/atoll/islands.md`, `islands-worker.md`, `islands-frameworks.md`). A
worker owns the render loop against a proxy DOM; commits serialize to an
op stream the main-thread driver replays as real DOM mutations. Since the
0.1.9 dependency, **AtollJS is the engine**: the op protocol, proxy DOM,
instance lifecycle, worker definers, task transport, and driver are
`@atolljs/core` + `@atolljs/islands` code. Our packages are facades:

- **`@preact-mvc/atoll`** (`packages/atoll`) — thin shell/worker facades
  over `@atolljs/islands`. `.` = shell/mount entry (`mountIsland`,
  `connectIslandWorker`, `callbackProp`, contracts, `z`), `./worker` =
  worker-side entry (`definePolyWorker`/`defineMonoWorker`, `emit`,
  instance scope, proxy-DOM types).
- **`@preact-mvc/atoll-island`** (`packages/atoll-island`) — the
  `*-island` adapter package. `.` = shell surface (`<Island/>`,
  `islandComponent`, `lazyIsland`) plus re-exports of the driver/mount
  API; `./worker` = the preact-mvc renderer (`viewIslandApp`,
  `viewIsland`, `defineViewPolyWorker`, `defineViewMonoWorker`) plus
  re-exports of `emit`/instance scope so worker entries need no direct
  `@preact-mvc/atoll` import.

## Topology

```
main thread                          worker thread
───────────                          ─────────────
<Island/> / islandComponent
  └ mountIsland / connectIslandWorker ── task {method, instance, ...} ──▶ definePolyWorker({apps})
       ▲                                                                  │ runInInstance
       └──────── result{ops} / poll or push flushes ──────────────────────┘ render → ProxyDocument
                  driver.applyOp → real DOM                                    every mutation = one Op
```

- **Poly worker** (`definePolyWorker({ apps })`): one script, an app
  registry; islands pick an app by name. **Mono worker**
  (`defineMonoWorker(app)`): one script, one app; the name is ignored only
  when the registry holds exactly one app.
- **Instance** = one mounted island, keyed `app@N` (nested islands
  namespace as `parent~app@N`). Each instance has its own ProxyDocument,
  op queue, and handler table.
- **Two app shapes**: `RenderedIslandApp` (`{ mount(ctx) → { update?,
    sync?, dispose? } }`) — what our adapter produces — and
  `ImperativeIslandApp` (`{ imperative(doc, props), dispose? }`) — raw
  proxy-DOM programs with no framework.
- **Transport**: `mode: 'poll'` (default, message-only, no headers) or
  `mode: 'push'` (SharedArrayBuffer doorbell, requires COOP/COEP). Our
  facade defaults everything to poll because GitHub Pages cannot serve
  the isolation headers.

## Module map

| File | Pkg | Side | Role |
|---|---|---|---|
| `index.ts` | atoll | shell | re-exports `@atolljs/islands`: contracts (`defineIslandContract`, `withContract`, `contractOf`, `contractWorkerOf`), `islandApp`, `z`/`Schema`, wire types |
| `driver.ts` | atoll | main | wraps `mountIsland`/`connectIslandWorker`: `WorkerLike` normalization, `doorbell: false` + `mode: 'poll'` defaults |
| `worker.ts` | atoll | worker | re-exports `@atolljs/islands/worker` (definers, `emit`, `runInInstance`, proxy DOM) + `enterInstance`/`exitInstance` helpers |
| `shell.tsx` | atoll-island | main | `<Island/>`, `islandComponent`, `lazyIsland`, contract facades, shell/island prop splitting |
| `adapter.tsx` | atoll-island | worker | `viewIslandApp`, `viewIsland`, `defineViewPolyWorker`, `defineViewMonoWorker`, render scoping, event-name bridge |
| `index.ts`/`worker.ts` | atoll-island | both | entry points: index re-exports shell + driver API; worker re-exports adapter + `@preact-mvc/atoll/worker` |

## The contract facade

Atoll's cross-framework pattern (docs/atoll/blog/facades.md): one shared
module describes the island — app name, prop schema, event vocabulary,
worker factory — and both sides consume it.

```ts
// ticker.contract.ts — imported by shell AND worker entry
import { defineIslandContract, z } from '@preact-mvc/atoll-island';

export const tickerContract = defineIslandContract({
  app: 'ticker',
  props: z.object({ interval: z.number().optional() }),
  events: { 'worker-ping': z.object({ at: z.number() }) },
  worker: () => new Worker(
    new URL('../workers/ticker.worker.tsx', import.meta.url),
    { type: 'module' },
  ),
});
```

```tsx
// shell view — no worker plumbing at the call site
import { islandComponent } from '@preact-mvc/atoll-island';
import { tickerContract } from '../islands/ticker.contract';

const TickerIsland = islandComponent(tickerContract);

<TickerIsland interval={1000}
  onEvent={(name, payload) => { /* typed by the contract */ }} />
```

```ts
// worker entry — the same contract attaches to the app
import { defineViewPolyWorker, viewIslandApp } from '@preact-mvc/atoll-island/worker';
import { tickerContract } from '../islands/ticker.contract';

export const worker = defineViewPolyWorker({
  apps: { ticker: viewIslandApp(TickerView, { contract: tickerContract }) },
});
```

Rules:

- `islandComponent(contract)` derives the app name, uses the contract's
  `worker` factory when no `worker`/`client` prop is given, splits shell
  props (`className`, `onEvent`, `slots`, …) from island props, and types
  `onEvent` by the declared `events` map.
- `withContract(contract, app)` tags the worker-side app so mount props
  are validated against the schema and declared `emit` payloads are
  checked worker-side.
- The string-keyed forms still work: `islandComponent('ticker')`,
  `<Island app="ticker" worker={entry} />`, `viewIsland('name', App)`.
- `z` is Atoll's bundled schema mini-lib; any `safeParse`-shaped schema
  (real zod included) satisfies `Schema`.

## The pieces that make it work

- **Op replay** (Atoll driver): per-island `Map<nodeId, Node>` plus
  `listen` ops that attach real listeners and `dispatch` the handler id +
  serialized `EventPayload` back to the worker. The payload also carries
  `zrX`/`zrY` — `clientX/Y − currentTarget.getBoundingClientRect()`
  computed on the main thread — because the proxy DOM has no measurement
  channel for worker-side coordinate math; hit-testing libraries that
  early-out on those fields (zrender's `normalizeEvent`) get correct
  pointer-local coords, which is what makes echarts' axis pointer and
  tooltip work inside a worker.
- **Proxy DOM** (Atoll worker side): enough surface for Preact's diff —
  `createElement`, `insertBefore`, `removeChild`, `innerHTML`, `style`,
  `addEventListener`, sibling/parent traversal.
- **Event-name bridge** (`adapter.tsx`): Preact decides the DOM event
  name via `'onclick' in el`; the proxy element has no `on*` props, so the
  probe fails and Preact registers the prop-sliced name `'Click'` while
  keying `dom._listeners` under it. The bridge wraps
  `ProxyElement.prototype.addEventListener`: the `listen` op carries the
  real DOM type (`'click'`) and the wrapped handler re-tags the payload
  with the prop-sliced name so `eventProxy`'s dict lookup resolves. (A
  prototype `has`-trap alternative was tried and rejected: it breaks
  `instanceof ProxyNode` on spliced-in proxies.)
- **`sync` lane** (`adapter.tsx`): rendered handles may provide
  `sync(fn)`; the dispatch task runs the event handler through it and the
  adapter re-renders synchronously (Preact's `render()` is the flush), so
  handler-driven commits land in the same task's op batch instead of a
  poll cycle later. The re-render happens for EVERY dispatched event —
  including listeners on proxy elements the app didn't create (e.g.
  zrender's viewport mousemove). Any imperative side effect driven from
  `render()` (chart `setOption`, emits, manual DOM writes) must be
  guarded against unchanged inputs, or every pointer event rebuilds it:
  the enterprise chart islands reference-check their series data before
  calling `setOption` for exactly this reason.
- **Render scoping** (`adapter.tsx`): mount/update run in
  `runInInstance`, but signal-driven re-renders are deferred by Preact
  past the scope. Each root vnode is stamped `__islandInstance`;
  `options.__r` walks the `__` parent chain and `enterInstance`s the
  stamped key, `options.diffed` restores via `exitInstance`. Deterministic,
  strictly better than the ambient heuristic.
- **DI in islands**: `viewIslandApp` creates a fresh root `Injector` per
  mount inside `InjectorContext.Provider`; `@Component({ providers,
  imports, controllers })` metadata works unchanged — worker-side stores
  and controllers live in the worker.
- **Registries are a module-level union in-process**: Atoll's
  `APP_REGISTRY` is global, which is right in real workers (each entry is
  its own module graph) but means in-process tests see every def's apps.
  Consequence: the mono name-fallback only kicks in for a single-app
  registry, so tests mount mono apps by their registry key.
- **View props**: `Injector.instantiate(cls, props)` passes props to the
  constructor so field initializers (`signal(this.props.start)`) see them.

## Shell usage

```tsx
// worker entry (worker side)
export const worker = defineViewPolyWorker({
  apps: { counter: CounterIsland, clock: ClockIsland },
});

// shell
const Counter = islandComponent<{ start?: number }>('counter');
<Counter worker={() => new Worker(new URL('./demo.worker.ts', import.meta.url), { type: 'module' })}
         props={{ start: 0 }} onEvent={(n, p) => log(n, p)} />

// or share one worker across islands
const client = connectIslandWorker({ worker: islandEntry });
<Island client={client} app="clock" />
```

`mountIsland` handle: `{ app, instance, pid, updateProps, flush, destroy,
setMode }`. Functions in props must be wrapped in `callbackProp(fn)`; a
bare function prop rejects at marshal time. `destroy()` tears down the
worker instance and stops the transport; the driver still replays the
unmount batch's `clear` op so `slots[name]` callbacks fire with `null`
and slot render roots unmount — without that a slot-hosted sibling island
would keep `clientMounts` above zero and pin a shared worker alive.

## Worker-hosted pages (enterprise example)

`examples/enterprise` pushes the pattern furthest: every routed page is
an island app on its OWN worker — a heavy page can't stall a sibling's
renders, and each worker bundles only its page's code (the dashboard's
echarts payload stays out of the other pages' bundles). The pieces:

- `src/workers/<page>.worker.tsx` registers that page's apps with
  `viewIslandApp(View, { providers })`; `src/workers/shared.ts` builds
  the per-worker provider spine (`FakeApi` + a `QueryClient` synced over
  BroadcastChannel). Each worker's cache is its own; broadcast sync keeps
  the shell and sibling workers hydrated.
- `PageWorkerHost` (service) owns one `IslandClient` PER PAGE, connected
  lazily: `clientFor(app)` maps the app name to that page's `new
  Worker(new URL(...))` literal (the factory record keeps every entry
  bundler-detectable). Route components in `routes.ts` are thin
  `() => h(WorkerPage, { app })` hosts, and `WorkerPage` mounts
  `<Island client={host.clientFor(app)} app={app}>`. Navigating away
  unmounts the island and its worker terminates; navigating back
  respawns it on the cached client.
- Shell-owned state crosses as props: `ThemeService` stays main-thread
  (document/matchMedia/localStorage), so `theme` is a prop and the setter
  a `callbackProp`.
- The revenue chart runs fully worker-side: a sibling island app
  (`revenue-chart.island.tsx`, registered as `chart` on the dashboard
  page's worker) mounts into a `data-atoll-slot="chart"` box inside the
  dashboard tree.
  Its mount element is the chart box itself, so the pushed container size
  is honest geometry (`doc.markContainer` + `doc.onResize`). echarts uses
  its SVG renderer: every shape is a `createElementNS`/`attr`/`style` op,
  and zrender's `ownerDocument.defaultView.getComputedStyle` resolves
  through the worker window facade, which only exists after
  `installDomShim(doc)` runs. The chart island observes the same
  `['revenue']` query on the dashboard worker's `QueryClient` — one
  providers array serves both apps, so one fetch feeds view and chart;
  nothing crosses worker→shell for data.
  Slot components render under a fresh `render()` root: InjectorContext
  does not cross, pass dependencies as props; signal reads still
  auto-subscribe.
  Caveat: zrender hover state swaps (`emphasis`/`blur`/`select`) replace
  `el.style` wholesale with the state's style object, whose attrs then
  diff out via `attr` ops with `value: null`. When the state style lacks
  the normal paint keys (echarts resolves emphasis styles independently
  of the normal style), the series loses `stroke`/`fill` and the restore
  path does not always bring it back: the series renders invisible after
  hover. The example sets `emphasis.disabled`/`select.disabled` since the
  emphasis look adds nothing (no symbols, same stroke). If emphasis is
  needed, give the emphasis state an explicit complete style.
- The ticker is a *nested island*, not a slot: the dashboard mounts
  `islandComponent(tickerContract)` inside the worker tree. The
  component's div is a ProxyElement, so `mountIsland` takes the nested
  path (worker/subIsland.ts registers at `/worker` module load), spawns a
  real sub-worker from the contract's factory, and tunnels the
  sub-island's ops up the parent instance's op stream — the page sees one
  flat batch. Events round-trip two hops (dispatch down, `emit` up into
  the parent instance's `onEvent`, which can re-`emit` to the page).
  `@preact-mvc/atoll-island/worker` re-exports `Island`/`islandComponent`/
  `lazyIsland`/`connectIslandWorker`/`mountIsland` for exactly this,
  matching the `@atolljs/react-island/worker` convention. Platform limit:
  nested `new Worker` works in Chrome/Firefox/Node, not Safari workers.
- Query caches sync across threads without island plumbing:
  `lib/broadcast-query.ts` mirrors TanStack's removed v4
  `broadcastQueryClient` (v5's persist-client-core takes AsyncStorage,
  not a channel) — `queryCache` events dehydrate onto a
  `BroadcastChannel` (native worker/main reach) and hydrate elsewhere,
  with a `hydrating` flag breaking the echo loop. The shell proves it
  end-to-end: `ShellController` observes `['metrics']` with
  `queryFn: skipToken` (never fetches) yet renders revenue hydrated
  purely from the worker's broadcasts.

## Testing

`@atolljs/core/testing/inProcessWorker` runs the real INIT/EXECUTE_TASK
protocol in the test realm — `vi.stubGlobal('Worker', InProcessWorker)`
plus the worker defs registering into the shared `TaskRegistry`. Two
in-process caveats:

- **Single realm**: `@atolljs/core` ships `dist/` for the bare specifier
  but `src/*` for subpaths — two `TaskRegistry` instances. The root
  `vitest.config.ts` aliases the bare specifier into `src` so islands and
  the harness share one registry.
- **Global shadowing**: the worker's instance dispatcher installs
  `document`/`window`/`Element`/… getters that resolve the ambient proxy
  doc; out-of-task shell code (the driver, the test) would see proxies.
  The test captures jsdom's globals before defining workers and hands
  them back through the dispatcher's documented override setters.

## Deliberate divergences from Atoll

- **Defaults are message-only**: `doorbell: false`, `mode: 'poll'` —
  GitHub Pages can't serve COOP/COEP; opt into `push` where headers allow.
- **`worker:` accepts a `WorkerLike` or factory**: the facade normalizes
  already-spawned workers (test doubles) to entries; the factory form
  `() => new Worker(new URL('./x.worker.ts', import.meta.url))` stays
  mandatory for real bundler-detectable entries.
- **Single renderer**: only the view adapter; no react/vue/solid/angular
  island packages.
- **The event-name bridge is ours**: Atoll's adapters get lowercase event
  names natively (React keys by convention); Preact's `'on*' in el` probe
  needs the proxy-boundary normalization.

## Invariants

- One island instance = one isolated op stream; `app@N` keys everything.
- Everything crossing the wire is structured-cloneable (props, payloads,
  ops); functions only as marshalled `callbackProp` tokens.
- DOM work outside a task must re-enter via `runInInstance` (or the vnode
  stamp path) — ambient `document` out-of-scope is a documented heuristic,
  not a contract.
- `preventDefault`/`stopPropagation` on dispatched events are synthesized
  no-ops: the real event already ran on the main thread.
- Real-worker entries must stay bundler-detectable: inline
  `new Worker(new URL('…', import.meta.url), { type: 'module' })`.
- `data-atoll-slot` attrs route to `slots` callbacks for transclusion.
