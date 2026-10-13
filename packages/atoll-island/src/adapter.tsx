/**
 * The framework renderer adapter — our `*-island` package's renderer half
 * (docs/atoll/islands-frameworks.md). `viewIslandApp(Component)` wraps a
 * `View` class or function component as a `RenderedIslandApp`; each mount
 * renders into the instance's proxy document via Preact, so every DOM
 * mutation serializes to ops.
 *
 * `defineViewPolyWorker`/`defineViewMonoWorker` are the single-framework
 * convenience definers — they wrap plain components automatically:
 *
 *   // render.worker.ts
 *   export const worker = defineViewPolyWorker({
 *     apps: { counter: CounterView, clock: ClockView },
 *   });
 *
 * DI inside islands: the app gets a fresh root injector per instance —
 * worker-side injectables (stores, controllers) live in the worker, and
 * `@Component({ providers/imports/controllers })` metadata works unchanged
 * because the View host machinery runs in the worker too.
 */
import { h, options, render } from 'preact';
import type { ComponentType, VNode } from 'preact';
import { Injector, InjectorContext, type Provider } from '@preact-mvc/core';
import {
  defineMonoWorker,
  definePolyWorker,
  islandApp,
  islandAppNameOf,
  enterInstance,
  exitInstance,
  getActiveInstance,
  withContract,
  ProxyElement,
  type ImperativeIslandApp,
  type IslandContract,
  type IslandWorkerDef,
  type RenderContext,
  type RenderedHandle,
  type RenderedIslandApp,
} from '@preact-mvc/atoll/worker';

type AnyComponent = ComponentType<Record<string, unknown>>;

const ISLAND_KEY = '__islandInstance';
const PREV_KEY = '__islandPrevScope';

/**
 * Instance-scoped rendering for OUT-OF-TASK renders. Mount/updateProps run
 * inside `runInInstance`, but signal-driven re-renders are deferred by
 * Preact to a microtask with no active scope — ambient `document` would
 * resolve via the last-active heuristic and could create nodes on a SIBLING
 * island's document (in shared-client/in-process topologies).
 *
 * Fix: every root vnode is stamped `__islandInstance`; `options.__r` walks
 * the `__` parent chain before each component render and enters that
 * instance's scope; `options.diffed` restores. Deterministic, and strictly
 * better than the ambient heuristic.
 */
let renderScopeInstalled = false;
function installRenderScope(): void {
  if (renderScopeInstalled) return;
  renderScopeInstalled = true;
  type IVNode = VNode & { [ISLAND_KEY]?: string; [PREV_KEY]?: string | null; __?: IVNode | null };
  const opts = options as unknown as {
    __r?: (v: VNode) => void;
    diffed?: (v: VNode) => void;
  };
  const prevR = opts.__r;
  const prevD = opts.diffed;
  opts.__r = (vnode: VNode) => {
    let v = vnode as IVNode | null;
    let key: string | undefined;
    while (v) {
      if (v[ISLAND_KEY]) {
        key = v[ISLAND_KEY];
        break;
      }
      v = v.__ ?? null;
    }
    if (key && key !== getActiveInstance())
      (vnode as IVNode)[PREV_KEY] = enterInstance(key);
    prevR?.(vnode);
  };
  opts.diffed = (vnode: VNode) => {
    prevD?.(vnode);
    const v = vnode as IVNode;
    if (PREV_KEY in v) {
      exitInstance(v[PREV_KEY] ?? null);
      delete v[PREV_KEY];
    }
  };
}

/**
 * Event-name bridge for the proxy DOM. Preact decides the DOM event name
 * via `'onclick' in el`: real elements report the lowercase handler props
 * as present, so `onClick` registers `addEventListener('click', …)` and
 * keys `dom._listeners['click']`. The proxy element has no `on*` props —
 * the probe fails and Preact uses the prop-sliced name 'Click' for BOTH.
 * The driver then listens for a type real DOM never dispatches (no events
 * arrive), and `eventProxy` looks its dict up under 'Click' anyway.
 *
 * The bridge normalizes at the proxy boundary: the `listen` op carries
 * the real DOM type ('click' — driver attaches a working listener) while
 * the wrapped handler re-tags the enriched payload with the prop-sliced
 * name ('Click') so Preact's `eventProxy` still finds its dict entry.
 * All-caps ('DOMContentLoaded') and lowercase types pass through. The
 * wrapped-handler map keeps removeEventListener able to detach the same
 * registration.
 */
type EventFn = (this: unknown, e: unknown) => void;
let eventBridgeInstalled = false;
function installEventNameBridge(): void {
  if (eventBridgeInstalled) return;
  eventBridgeInstalled = true;
  /** element → original fn → prop-sliced type → wrapped fn */
  const bridged = new WeakMap<object, Map<EventFn, Map<string, EventFn>>>();

  // Prop-sliced PascalCase → the real lowercase DOM type. Only the
  // PascalCase shape is rewritten: 'MouseLeave' → 'mouseleave',
  // 'DblClick' → 'dblclick'. All-caps ('DOMContentLoaded'), lowercase
  // ('click'), and camelCase custom types pass through — lowercasing
  // 'DOMContentLoaded' would break it the other way.
  const decap = (type: string): string =>
    type.length > 1 &&
    type[0] === type[0]!.toUpperCase() &&
    type[1] === type[1]!.toLowerCase()
      ? type.toLowerCase()
      : type;

  type ListenerMethods = {
    addEventListener: (this: object, type: string, fn: EventFn, opts?: unknown) => void;
    removeEventListener: (this: object, type: string, fn: EventFn, opts?: unknown) => void;
  };
  const proto = ProxyElement.prototype as unknown as ListenerMethods;
  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;

  proto.addEventListener = function (
    this: object,
    type: string,
    fn: EventFn,
    opts?: unknown,
  ): void {
    const dom = decap(type);
    let effective = fn;
    if (dom !== type) {
      effective = function (this: unknown, e: unknown): void {
        fn.call(this, { ...(e as Record<string, unknown>), type });
      };
      let byFn = bridged.get(this);
      if (byFn === undefined) bridged.set(this, (byFn = new Map()));
      let byType = byFn.get(fn);
      if (byType === undefined) byFn.set(fn, (byType = new Map()));
      byType.set(type, effective);
    }
    origAdd.call(this, dom, effective, opts);
  };

  proto.removeEventListener = function (
    this: object,
    type: string,
    fn: EventFn,
    opts?: unknown,
  ): void {
    const effective = bridged.get(this)?.get(fn)?.get(type) ?? fn;
    origRemove.call(this, decap(type), effective, opts);
  };
}

export interface ViewIslandAppOptions {
  /** Providers for the island's root injector — the island-side equivalent
   *  of `bootstrap(AppModule, providers)`. */
  providers?: Provider[];
  /** Attach a `defineIslandContract` contract: mount/updateProps props are
   *  validated against its schema, and declared `emit` payloads are
   *  checked worker-side. */
  contract?: IslandContract;
}

/** Wrap a View class or function component as a `RenderedIslandApp`. */
export function viewIslandApp(App: AnyComponent, opts?: ViewIslandAppOptions): RenderedIslandApp {
  installRenderScope();
  installEventNameBridge();
  const app: RenderedIslandApp = {
    renderer: 'preact-mvc',
    mount({ instance, doc, props }: RenderContext): RenderedHandle {
      const inj = new Injector(undefined, `island ${instance}`);
      for (const p of opts?.providers ?? []) inj.provide(p);
      let current = props;
      const renderRoot = (p: Record<string, unknown>): void => {
        current = p;
        const vnode = h(InjectorContext.Provider, { value: inj }, h(App, p));
        (vnode as unknown as Record<string, unknown>)[ISLAND_KEY] = instance;
        render(vnode, doc.body as never);
      };
      renderRoot(props);
      return {
        update: renderRoot,
        // The dispatch task's sync lane: run the event handler, then
        // re-render synchronously (Preact's render() IS the flush — signal
        // writes would otherwise defer to a microtask and their ops would
        // miss this task's batch, surfacing a poll later).
        sync: (fn: () => void) => {
          fn();
          renderRoot(current);
        },
        dispose: () => {
          try {
            render(null, doc.body as never);
          } finally {
            inj.deactivate();
          }
        },
      };
    },
  };
  const stamp = islandAppNameOf(App);
  if (stamp !== undefined) (app as { islandAppName?: string }).islandAppName = stamp;
  return opts?.contract !== undefined ? withContract(opts.contract, app) : app;
}

/** Stamp + wrap in one step — `viewIsland('counter', CounterView)` yields
 *  both the registry value and the name the shell mounts by. */
export const viewIsland = (
  name: string,
  App: AnyComponent,
  opts?: ViewIslandAppOptions,
): RenderedIslandApp & { readonly islandAppName: string } =>
  islandApp(name, viewIslandApp(App, opts));

export interface ViewPolyWorkerRegistry {
  /** Name → component (or `{ imperative }` app / pre-wrapped app). Plain
   *  components pass through `viewIslandApp`. */
  apps: Record<string, AnyComponent | ImperativeIslandApp | RenderedIslandApp>;
}

/** `definePolyWorker` for framework views — maps each component in the
 *  registry through `viewIslandApp` and delegates. */
export function defineViewPolyWorker(registry: ViewPolyWorkerRegistry): IslandWorkerDef {
  installRenderScope();
  const apps: Record<string, ImperativeIslandApp | RenderedIslandApp> = {};
  for (const [key, app] of Object.entries(registry.apps)) {
    apps[key] = typeof app === 'function' ? viewIslandApp(app) : app;
  }
  return definePolyWorker({ apps });
}

/** `defineMonoWorker` for a single framework view — the isolated-bundle
 *  host shape (own worker, own failure domain). */
export function defineViewMonoWorker(
  app: AnyComponent | ImperativeIslandApp | RenderedIslandApp,
  opts?: ViewIslandAppOptions,
): IslandWorkerDef {
  installRenderScope();
  const resolved = typeof app === 'function' ? viewIslandApp(app, opts) : app;
  return defineMonoWorker(resolved);
}
