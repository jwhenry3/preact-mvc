# Islands (`packages/atoll/` + `packages/atoll-island/`)

Worker-rendered islands modeled on the Atoll architecture
(`docs/atoll/islands.md`, `islands-worker.md`, `islands-frameworks.md`). A
worker owns the render loop against a proxy DOM; commits serialize to an op
stream the main-thread driver replays as real DOM mutations. **No Atoll
dependency**: the protocol vocabulary and invariants are theirs, the code is
ours.

The split mirrors Atoll's `islands` / `react-island` layout:

- **`@preact-mvc/atoll`** (`packages/atoll`) — framework-free core: op
  protocol, proxy DOM, instance lifecycle, worker definers, main-thread
  driver, in-process test transport. `.` = shell/mount entry,
  `./worker` = worker-side entry.
- **`@preact-mvc/atoll-island`** (`packages/atoll-island`) — the
  `*-island` adapter package. `.` = shell surface (`<Island/>`,
  `islandComponent`, `lazyIsland`) plus re-exports of the driver/mount
  API; `./worker` = the preact-mvc renderer (`viewIslandApp`,
  `viewIsland`, `defineViewPolyWorker`, `defineViewMonoWorker`) plus
  re-exports of `emit`/`runInInstance`/instance scope so worker entries
  need no direct `@preact-mvc/atoll` import.

## Topology

```
main thread                          worker thread
───────────                          ─────────────
<Island/> / islandComponent
  └ mountIsland / connectIslandWorker ── call {method, instance, ...} ──▶ definePolyWorker({apps})
       ▲                                                                  │ runInInstance
       └──────── result{ops} / unsolicited {t:'ops'} pushes ──────────────┘ render → ProxyDocument
                  driver.applyOp → real DOM                                    every mutation = one Op
```

- **Poly worker** (`definePolyWorker({ apps })`): one script, an app
  registry; islands pick an app by name. **Mono worker**
  (`defineMonoWorker(app)`): one script, one app; the mount name is ignored.
- **Instance** = one mounted island, keyed `app@N` (nested islands would
  namespace as `parent~app@N`; not yet implemented). Each instance has its
  own ProxyDocument, op queue, handler table, and mount record.
- **Two app shapes**: `RenderedIslandApp` (`{ mount(ctx) → { update?,
    dispose? } }`) — what our adapter produces — and `ImperativeIslandApp`
  (`{ imperative(doc, props), dispose? }`) — raw proxy-DOM programs with no
  framework. Apps without `update` degrade to dispose + clear + remount on
  `updateProps`.

## Module map

| File | Pkg | Side | Role |
|---|---|---|---|
| `ops.ts` | atoll | both | `Op` union, `EventPayload`, `IslandCall`/`IslandReply` wire types, `WorkerLike` |
| `instance.ts` | atoll | worker | per-instance state, op queue + microtask push, handler table, active-instance stack, `emit`, `runInInstance`, `enterInstance`/`exitInstance` |
| `proxyDom.ts` | atoll | worker | `ProxyDocument`/`ProxyElement`/`ProxyText` — DOM-free surface; every mutation pushes an op |
| `callback.ts` | atoll | both | `callbackProp` marshalling: shell fn → `{__callback:id}` token → worker calls → `emit(CALLBACK_EVENT)` → shell invokes |
| `worker.ts` | atoll | worker | `definePolyWorker`/`defineMonoWorker`, mount/update/dispatch/setSize/unmount/whoami/renderer, ambient `document`/`window` dispatch — the `./worker` subpath entry |
| `app.ts` | atoll | both | `islandApp(name, app)` stamping + `islandAppNameOf` — worker-free so the shell bundle stays clean |
| `driver.ts` | atoll | main | `connectIslandWorker` (RPC client), `mountIsland` (op replay, event dispatch, ResizeObserver size push, mount timeout) |
| `inprocess.ts` | atoll | test | `createInProcessWorker(def)` — runs the def in the test realm, keeping the wire asynchrony |
| `types.ts` | atoll | both | `IslandAppProps` prop-inference helper |
| `shell.tsx` | atoll-island | main | `<Island/>`, `islandComponent`, `lazyIsland` — the `.` entry |
| `adapter.tsx` | atoll-island | worker | `viewIslandApp`, `viewIsland`, `defineViewPolyWorker`, `defineViewMonoWorker` — Preact render into the proxy doc |
| `index.ts`/`worker.ts` | atoll-island | both | entry points: index re-exports shell + driver API; worker re-exports adapter + `@preact-mvc/atoll/worker` |

## The op protocol (`ops.ts`)

create / text / comment / append(+before) / remove / attr(null removes) /
prop / utext / html / style / clear / listen / unlisten / emit. Node ids are
ints allocated by the instance's ProxyDocument; **id 0 is the island
container element itself** (body/documentElement alias it).

`emit(name, payload)` is the one non-DOM op: worker→shell events routed to
`onEvent`. The reserved name `CALLBACK_EVENT` carries marshalled
`callbackProp` invocations.

Wire calls main→worker: `mount`, `updateProps`, `dispatch`,
`setSize`, `flush`, `unmount`, `whoami`, `renderer`. Replies:
`result` (the call's op batch), `error`, and unsolicited `{t:'ops'}` pushes.

## The pieces that make it work

- **Op replay** (`driver.ts`): per-island `Map<nodeId, Node>` plus a
  `WeakMap<Node, nodeId>` for event `targetId`. `listen` ops attach real
  listeners that `dispatch` the handler id + serialized `EventPayload` back.
- **Proxy DOM** (`proxyDom.ts`): enough surface for Preact's diff —
  `createElement(NS)`, `createTextNode`, `insertBefore`, `removeChild`,
  `data`, `innerHTML`, `textContent`, `style`, `addEventListener`,
  `childNodes`/`firstChild`/`nextSibling`/`parentNode`, reflected prop
  accessors (`id`, `className`, `value`, `checked`, …).
- **`on*`-in-element trap**: elements are wrapped in a `Proxy` whose `has`
  trap reports lowercase `on*` names as present. Preact decides the
  listener-dict key via `'onclick' in el`; without the trap it stores under
  `'Click'` but dispatches `e.type` (`'click'`) and the handler never fires.
- **Instance-aware globals** (`worker.ts`): `document`/`window` are
  `defineProperty` getters resolving through the active instance — that is
  what lets stock Preact render unmodified. **When a real `document` exists
  (in-process tests), only an *active* instance may shadow it**; the
  last-active/sole-instance heuristics exist only for real workers.
- **Render scoping** (`adapter.tsx`): mount/update run in `runInInstance`,
  but signal-driven re-renders are deferred by Preact past the scope. Each
  root vnode is stamped `__islandInstance`; `options.__r` walks the `__`
  parent chain and `enterInstance`s the stamped key, `options.diffed`
  restores. Deterministic; strictly better than the ambient heuristic.
- **DI in islands**: `viewIslandApp` creates a fresh root `Injector` per
  mount inside `InjectorContext.Provider`; `@Component({ providers,
  imports, controllers })` metadata works unchanged — worker-side stores
  and controllers live in the worker.
- **Registries are per-definition** (not module-global like Atoll's): each
  worker entry is its own module graph in Atoll, but under in-process
  sharing a global registry would union every def's apps and break
  mono/unknown-app semantics.
- **View props**: `Injector.instantiate(cls, props)` passes props to the
  constructor so field initializers (`signal(this.props.start)`) see them;
  the host still assigns `inst.props` before each render for updates.

## Deliberate divergences from Atoll

- **Always-push transport**: ops post on a microtask per instance; there is
  no doorbell/poll split.
- **Single renderer**: only the view adapter; no react/vue/solid/angular
  island packages.
- **No nested islands yet** (the `~` namespacing is parsed but unexercised).
- **No `sync`/`flush` batching contract** on RenderedIslandApp; the
  adapter's `update` re-renders the root directly.
- **`mountIsland` mounts async** and resolves a handle; `<Island/>` mounts
  in `useEffect` and renders an error box on mount failure.
- **`worker` accepts a `WorkerLike` or a factory**; the factory form
  `() => new Worker(new URL('./x.worker.ts', import.meta.url))` stays
  mandatory for real bundler-detectable entries.

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
opsApplied }`. Functions in props must be wrapped in `callbackProp(fn)`;
a bare function prop rejects at marshal time. Worker code calls the prop
like a normal function; it arrives shell-side via the `CALLBACK_EVENT` emit.

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
