# Changelog

All notable changes to `@preact-mvc/core`, `@preact-mvc/atoll`,
`@preact-mvc/atoll-island`, and `@preact-mvc/cli` are documented here.
The packages release in
lockstep under a single version stamped from the GitHub release tag.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.8]

### `@preact-mvc/core`

#### Added

- **Update-depth guard** (React #185 analog). The view interop counts
  renders per component instance in a 100ms sliding window; more than 50
  throws `Maximum update depth exceeded` — a signal write inside
  `render()`, or an effect/`navigate()` that re-triggers itself — routed
  to the view boundary instead of starving the main thread on an
  unbounded microtask loop. Always on, prod included. In dev it is
  preceded by a console warning naming the component that scheduled an
  update during its own render window — writes during render are legal
  (converging writes settle after one re-render); only non-convergent
  loops throw.
- **`useFactory` providers run in injection context**, so factories may
  `inject()` beyond declared `deps` (e.g. `inject(DestroyRef)` to tie the
  product's teardown to the owning scope).

#### Fixed

- **`deactivate()` isolates teardown failures.** A throwing `onDestroy`
  or scope cleanup is logged and skipped instead of aborting the pass —
  the rest of the scope's teardown still runs, so a single bad callback
  can't leak effects, timers, or listeners. `activate()` on an
  already-active scope is a no-op.
- **Circular-dependency errors name the chain**
  (`Circular dependency: A -> B -> A`) via a synchronous resolution
  stack, instead of only the token that re-entered.
- **`Router` releases its `popstate` listener on scope teardown** —
  the `RouterModule.forRoot` factory wires `dispose()` through
  `inject(DestroyRef)`, so a re-created router can't stack listeners
  (HMR, test re-mounts).

## [0.1.7]

### `@preact-mvc/core`

#### Fixed

- **Dev-only "Hook can only be invoked from render methods" false
  positive.** Pending `useEffect` callbacks flush inside `options.__r`
  on a re-render, and a nested `render()` there cleared `preact/debug`'s
  hook guard for the still-rendering component. `installViewInterop` now
  wraps function component types so the guard tolerates the corrupt flag
  only when a hook provably executes inside its own render body —
  `render()` inside `useEffect` works, and real violations still throw.
  Requires `preact/debug` to load before the framework (preset-vite
  injects it first).

#### Added

- **`errorHint(error)`** (exported) maps opaque upstream error
  signatures — starting with the hook-guard throw above — to actionable
  hints. `ViewErrorBoundary` appends matching hints to its fallback box
  and the console, and the fallback no longer claims every failure is a
  mount failure.

## [0.1.6]

### `@preact-mvc/core`

#### Fixed

- **`providedIn: 'root'` services can inject bootstrap-module
  providers.** The root module's provider graph (including `forRoot`
  bundles such as `RouterModule.forRoot`) now registers into the root
  injector itself — Angular's eager-module semantics — instead of a
  child app injector the root scope could not see. Root-scoped services
  no longer fail with `No provider` when they `inject()` a
  module-provided token; feature and lazy modules still get their own
  child injectors.

## [0.1.5]

#### Changed

- **Dependency security updates.** `vitest` and `@vitest/coverage-v8`
  bumped to `^5.1.0` (clears the `@vitest/mocker` path-traversal and
  code-injection advisories plus the `glob`/`minimatch`/`test-exclude`
  chain), `vite` to `6.4.5` across every lockfile (`server.fs.deny`
  bypass, launch-editor Windows CVEs), and `seroval` to `1.6.12`
  (code-injection fixes). The enterprise example moves to
  `echarts ^6.1.0` (XSS fix) and `zod ^4.6.7` (memory-exhaustion fix).
  `npm audit` reports zero vulnerabilities in every package.

#### Fixed

- **Vite/vitest config typings under vitest 5.** `vite.config.ts` and
  `vitest.config.ts` now import `defineConfig` from `vitest/config`;
  the `/// <reference types="vitest" />` augmentation no longer covers
  the `test` key.

## [0.1.4]

### `@preact-mvc/core`

#### Added

- **Lazy routes.** `lazyView(loader)` / `lazyModule(loader)` wrap an
  `import()` split point in a facade usable in route `component`/`module`
  fields AND directly in JSX; `Route.loadComponent`/`loadChildren` are
  the route-level equivalents, with `loadChildren` also resolving a
  `Route[]` spliced in as children. Loaders resolve by metadata stamp:
  `default` export first, then named exports scanned for `@Module`
  classes, `@Component`/`View` classes, or route arrays. A resolved
  module mounts its bootstrap view inside the module injector; a
  resolved `Route[]` extends `router.matches` in place when the chunk
  lands. The import defers until first mount or match, resolution is
  cached, and rejections log and render nothing at that depth.
- **Componentless wrapper routes.** A route with no resolved `component`
  now passes through to the next outlet depth instead of terminating the
  chain, so lazy route trees and route groups need no shell view.
- **Lazy loading states.** `router.pending` is a computed that is true
  while any matched route resolves its chunk; `<RouterOutlet fallback>`
  renders placeholder content at that depth while its target loads
  (covering `loadComponent`, `lazyView`/`lazyModule` facades, and the
  slot one depth past a pending `loadChildren`). The facades accept the
  same `fallback` prop for JSX use.

## [0.1.3]

### `@preact-mvc/core`, `@preact-mvc/atoll`, `@preact-mvc/atoll-island`

#### Changed

- **`@atolljs/*` bumped to `0.1.13`.** AtollJS now ships compiled
  `dist/` (`.js` + `.d.ts`) instead of `.ts` sources, so consumers no
  longer need their toolchain to compile the islands engine
  transitively. Applies to `@preact-mvc/atoll`,
  `@preact-mvc/atoll-island`, and the enterprise example.

## [0.1.2]

### `@preact-mvc/core`, `@preact-mvc/atoll`, `@preact-mvc/atoll-island`

#### Added

- **`sideEffects: false` in every library manifest.** Enables bundler
  tree-shaking and npm's exports analysis (previously reported
  "exports ES6 modules, but isn't marked side-effect free"). The only
  import-time effect, `view.ts`'s `installViewInterop()`, is retained by
  any real usage: `View` is imported to be extended, and `bootstrap`
  re-invokes it via `module.ts`.

### Tooling, docs, and site

- **Coverage floors raised** to 95/85/92/95 after new driver and shell
  suites covered the mount-reject and lazy-resolution paths: 114 tests,
  ~97% statements. Codecov action bumped to v7.1.1 (node24).
- **`pages.yml` `DOCS_BASE_URL`** — the localhost fallback meant
  deployed canonical/`og:url`/`og:image` tags pointed at
  `localhost:4190` whenever the repo variable was unset (it was). The
  workflow now derives `https://<owner>.github.io/<repo>/docs/` from
  `github.repository`; the variable still overrides.
- **Link-preview metadata** — full Open Graph + Twitter card tags on the
  landing page and stamped per docs route (`summary_large_image`), with
  a generated 1200x630 `social.png` share card shipped at the site root
  and inside every docs build (snapshots self-resolve their own copy).

## [0.1.1]

### `@preact-mvc/core`, `@preact-mvc/atoll`, `@preact-mvc/atoll-island`

#### Fixed

- **Published packages now ship compiled `dist/` instead of `src/`.**
  Shipping raw `.ts`/`.tsx` pushed framework compilation onto every
  consumer's toolchain, and broke in two visible ways: esbuild's dep
  optimizer compiled the `.tsx` sources with the classic React pragma
  (`ReferenceError: React is not defined` at `Link`/`RouterOutlet`), and
  mixed transform paths split the module realm (`No injector in
  context`). Each package now carries `tsconfig.build.json` +
  `npm run build` (tsc emit: `.js` + `.d.ts`); `publish.mjs` compiles
  `dist/` before stamping and rewrites `exports`/`files`/`types` to it.
  Repo exports stay pointed at `./src` for dev — workspace links and
  vitest are unchanged.
- **`repository` added to every package manifest.** npm's sigstore
  provenance check rejects `--provenance` publishes when the staged
  manifest's `repository.url` doesn't match the OIDC repo claim (the
  0.1.0 release hit this as a 422 mid-stage).

#### Added

- **Per-package READMEs** following the same format as the atolljs
  packages: CI, Codecov, and Socket badges, install, and verified usage
  snippets, rendered on each npmjs.com package page at next release.
- **Coverage reporting.** `@vitest/coverage-v8` wired into the vitest
  config (v8 provider, `text` + `lcov`, publishable-surface include with
  threshold floors at 88/83/92/88); `npm run test:coverage` script; CI
  test job uploads `coverage/lcov.info` via `codecov/codecov-action`.

### `@preact-mvc/cli`

#### Fixed

- **Generated vite config excludes `@preact-mvc/*` from `optimizeDeps`** —
  the same fix applied in-repo, so `pmvc new` projects work against
  `src`-shipping releases (0.1.0) and `file:`-linked checkouts, not just
  the compiled ones. Harmless for `dist`-shipping releases.

### Tooling, docs, and site

- **`publish.mjs`** — builds compiled packages before stamping; stamps
  now write to disk even under `--dry-run` (restored on exit) so
  `npm pack` listings show the real `dist/` surface.
- **Versioned consumer docs** — Atoll-style release snapshots:
  `VITE_DOCS_VERSION` builds, `versions.json` runtime manifest, header
  version switcher preserving the current route, `noindex` on snapshots,
  `docs-v<x.y.z>.tar.gz` release assets mounted under `docs/v<x.y.z>/`.
- **Site retheme** — docs-consumer and the landing page now use the real
  Preact site palette, font stacks, and purple-header/hero layout; cards
  and callouts flattened (mission blocks keep the accent left border);
  Preact/Angular/GitHub/npm links in both headers.
- **Logo** — `preactmvc-*` SVG variants (icon, light/dark lockups, white
  mark) generated by `assets/build-logo.mjs`, wired into the README,
  landing page, docs header/favicon, and demo apps.
- **Docs repo content** — `docs/blog/` and `docs/marketing/` entries for
  the launch article and its LinkedIn adaptation.

## [0.1.0]

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

The `*-island` adapter: mounts worker-hosted PreactMVC views as ordinary
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

### `@preact-mvc/cli`

The `pmvc` binary: project scaffolding and maintenance, dependency-free
Node.

#### Added

- **`pmvc new <dir>`** — scaffolds a routed application (AppModule,
  AppShell, routes, views, jsdom test stubs, decorators-ready tsconfig,
  vite + vitest config). `--islands` adds a contract-first worker island;
  `--tailwind` wires Tailwind v4; `--skip-install`, `--skip-tests`,
  `--dry-run`, `--force`.
- **`pmvc generate|g`** — `view`, `controller`, `service`, `module`, and
  `island` schematics emitting repo-conventional files (`*.view.tsx`,
  `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.contract.ts` +
  `*.worker.tsx`) with `--path`, `--skip-tests`, `--dry-run`, `--force`.
- **`pmvc serve` / `build` / `test`** — pass-throughs to the project's
  vite/vitest binaries; `build` typechecks first (like `ng build`).
- **`pmvc add`** — integration recipes: `tailwind` (deps + vite plugin
  patch + styles) and `islands` (atoll packages).
- **`pmvc update`** — bumps `@preact-mvc/*` dep ranges to latest or
  `--to <version>`, with `--include-atoll`, `--dry-run`,
  `--skip-install`, and a migration hook point for future code mods.
- **`pmvc version`** — CLI version plus the detected framework dep ranges
  of the enclosing project.

### Examples and docs

- `examples/enterprise/` reference app: routed pages hosted in
  per-page keep-alive worker islands (lazy first-visit spawn, warm
  remounts), nested ticker and chart sub-workers, TanStack Query
  synchronization across the thread boundary, and theme props flowing
  through the island hierarchy.
- `docs-consumer/` documentation site with a static page per route,
  deployable to GitHub Pages.
