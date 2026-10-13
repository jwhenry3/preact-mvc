# Changelog

All notable changes to `@preact-mvc/core`, `@preact-mvc/atoll`, and
`@preact-mvc/atoll-island` are documented here. The packages release in
lockstep under a single version stamped from the GitHub release tag.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-13

Initial release.

### `@preact-mvc/core`

Angular-inspired architecture on Preact: modules, dependency injection,
decorators, MVC organization, class-based JSX views, and signal
reactivity.

#### Added

- **Class-based `View` components.** Views are real classes constructed
  by a vnode interceptor inside a fresh child injector at mount; they are
  never instantiated by Preact. `this.props` is available from field
  initializers onward, `render()` returns JSX, and `setState`/
  `forceUpdate` throw intentionally. Function components keep real Preact
  semantics with hooks.
- **Signal reactivity.** `signal`, `computed`, `effect`, `batch`,
  `untracked` built on `@preact/signals`. `effect()` created inside an
  injection context is scope-bound: its disposer registers on the
  current `DestroyRef` and dies at scope teardown. Signal reads in
  `render()` auto-track and re-render the view.
- **Hierarchical dependency injection.** `Injector`, `inject()`,
  `InjectionToken`, `runInInjectionContext`. Providers support class,
  `useValue`, `useClass`, and `useFactory({ deps })` forms;
  `providedIn: 'root'` resolves against the root injector.
- **`DestroyRef` lifecycle.** Every injector registers one;
  `onDestroy(fn)` callbacks run at `deactivate()`. `OnInit`/`OnDestroy`
  on views and injected controllers pair on scope activate/deactivate,
  never on render alone.
- **Decorators.** `@Module`, `@Component`, `@Injectable`, `@Controller`.
- **MVC organization.** `@Controller` classes hold injectable view logic.
  Undeclared controllers are transient per injecting scope; controllers
  declared in `@Component({ controllers })` or `@Module({ controllers })`
  are shared down that injector chain. `useController` gives function
  components an explicitly owned instance.
- **Modules.** `@Module({ providers, imports, controllers, components,
  bootstrap })` composes providers recursively; one injector is cached
  per (module class, parent injector) pair. Declared `components`/
  `bootstrap` entries enforce ownership: mounting a declared view outside
  its owner's scope throws a clear error at mount.
- **Standalone components.** `@Component({ imports: [ModuleA] })` pulls
  the module's providers and component visibility into the view's own
  scope, Angular-style.
- **Router.** Signal-based routing over `preact-router`:
  `RouterModule.forRoot(routes)`, `RouterOutlet`, `Link`. Nested routes
  resolve as an outlet chain (`:param` segments, `*` wildcard, params
  merge outer to inner). Module routes nest injectors at the outlet
  level. Base-path support lets one bundle mount at site root or under a
  static subtree. Interops with embedded `preact-router` routers and its
  global link-click handling.
- **Context bridging.** `InjectorContext`, `useInjector`, `useService`,
  `Provide` expose the injector graph to ordinary Preact function
  components.
- **View error boundary.** Mount/render failures render a fallback box
  with retry instead of tearing down the tree.
- **`bootstrap(AppComponent, { routes?, module? })`** builds the root
  injector and renders the app.

### `@preact-mvc/atoll`

Framework-free worker-rendered islands: a facade over
`@atolljs/islands` + `@atolljs/core`, which supply the op protocol,
proxy DOM, worker runtime, and main-thread driver.

#### Added

- **`mountIsland` / `connectIslandWorker`** shell API with `WorkerLike`
  normalization (accepts `new Worker(...)`, factories, and worker-likes).
- **Message-only transport by default.** `mode: 'poll'` requires no
  COOP/COEP headers, so islands work on static hosts like GitHub Pages.
  `mode: 'push'` with the SharedArrayBuffer doorbell stays available for
  isolated deployments.
- **`callbackProp`** marks function props so they survive the
  structured-clone wire boundary.
- **Island contracts.** `defineIslandContract`, `withContract`,
  `contractOf`, `contractWorkerOf`, `islandApp`, `isIslandContract`:
  one shared module names the app, declares prop and event schemas
  (zod `z` re-exported), and carries the worker factory.
- **`keepAlive` option** on both `connectIslandWorker` and
  `mountIsland`: unmount the island instance (dispose hooks, observer
  and interval cleanup, DOM clear replay) while leaving the worker
  thread, module graph, and injector resident for warm remounts.
  `client.terminate()` still kills the thread explicitly.
- **`./worker` subpath** re-exports the worker runtime:
  `definePolyWorker` (one script, many named apps), `defineMonoWorker`
  (one script, one app), `emit`, `runInInstance`,
  `enterInstance`/`exitInstance`, and proxy-DOM types.

### `@preact-mvc/atoll-island`

The `*-island` adapter: mounts worker-hosted preact-mvc views as ordinary
elements in the shell app.

#### Added

- **Shell components.** `<Island/>` for inline mounts,
  `islandComponent(contract)` producing a typed component per contract,
  and `lazyIsland` for deferred loading. Shell props (`className`,
  `onEvent`, `slots`) split automatically from island props; `onEvent`
  payloads are typed by the contract's `events` map.
- **Worker renderer.** `viewIslandApp` / `viewIsland` render `View`
  classes inside the worker against the proxy DOM, with full DI and
  signal semantics preserved. `defineViewPolyWorker` /
  `defineViewMonoWorker` are the worker entry definers; contracts attach
  via `contract` options so mount props validate against the schema.
- **Nested islands.** Worker apps can mount child islands on their own
  spawned sub-workers; child `emit()` events route back through the
  parent island to the shell.
- **Island events.** `emit(name, payload)` on the worker side reaches
  shell `onEvent` handlers, validated against the contract schema.

### Examples and docs

- `examples/enterprise/` reference app: routed pages hosted in
  per-page keep-alive worker islands (lazy first-visit spawn, warm
  remounts), nested ticker and chart sub-workers, TanStack Query
  synchronization across the thread boundary, and theme props flowing
  through the island hierarchy.
- `docs-consumer/` documentation site with a static page per route,
  deployable to GitHub Pages.
