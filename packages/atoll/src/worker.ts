/**
 * The worker-side island runtime — modeled on Atoll's
 * `packages/islands/src/worker/defineWorkers.ts` (docs/atoll/islands-worker.md).
 *
 *   // render.worker.ts — a REGISTRY worker: one script, many apps
 *   export const worker = definePolyWorker({
 *     apps: { counter: viewIslandApp(Counter), map: { imperative: buildMap } },
 *   });
 *
 *   // mono.worker.ts — one script, one app (1:1, isolated bundle)
 *   export const worker = defineMonoWorker(viewIslandApp(ChartsApp));
 *
 * App registry values are `{ imperative }` defs or framework-adapter output
 * (`{ mount }` = RenderedIslandApp) — bare components are not registry
 * values; `defineViewPolyWorker` in adapter.tsx wraps View classes for you.
 *
 * The definition self-installs `self.onmessage` when it runs inside a real
 * WorkerGlobalScope; under the in-process test harness it exposes
 * `handle(call, post)` instead (see inprocess.ts).
 */
import type { IslandCall, IslandReply, Op } from './ops';
import {
  createInstance,
  dropInstance,
  getActiveInstance,
  getHandler,
  getLastActiveInstance,
  instances,
  runInInstance,
  setInstanceSize,
  takeOps,
  type InstanceState,
} from './instance';
import { createProxyDocument, ProxyDocument, ProxyElement } from './proxyDom';
import { unmarshalCallbackProps } from './callback';
import { islandAppNameOf } from './app';

export { emit, runInInstance, getActiveInstance, getLastActiveInstance, enterInstance, exitInstance } from './instance';
export type { ProxyDocument, ProxyElement };

// --- App registry -----------------------------------------------------------

/** `{ imperative }` app: no framework — mount() hands it a proxy document
 *  whose mutations emit ops directly. */
export interface ImperativeIslandApp {
  imperative: (doc: ProxyDocument, props: Record<string, unknown>) => void;
  /** Teardown — runs inside the instance's scope BEFORE its document dies
   *  (unmount, rebuild). Cancel timers/loops/listeners here. */
  dispose?: (doc: ProxyDocument) => void;
}

/** What a framework renderer receives at mount. */
export interface RenderContext {
  instance: string;
  doc: ProxyDocument;
  props: Record<string, unknown>;
}
export interface RenderedHandle {
  /** Fine-grained prop update — renderer patches its live tree. Omit it and
   *  updateProps degrades to dispose + clear + remount (imperative semantics). */
  update?(props: Record<string, unknown>): void;
  /** App teardown before the instance's document dies. */
  dispose?(): void;
}
export interface RenderedIslandApp {
  mount(ctx: RenderContext): RenderedHandle | void;
  /** Renderer tag reported to the driver ('view' for our adapter). */
  renderer?: string;
}

export type IslandApp = ImperativeIslandApp | RenderedIslandApp;

const isImperative = (a: IslandApp | undefined): a is ImperativeIslandApp =>
  typeof a === 'object' && a !== null && 'imperative' in a;
const isRendered = (a: IslandApp | undefined): a is RenderedIslandApp =>
  typeof a === 'object' && a !== null && 'mount' in a;

/** `app@N` or `parent~app@N` → registry name part. */
const appNameOf = (instance: string): string => {
  const at = instance.lastIndexOf('@');
  const name = at === -1 ? instance : instance.slice(0, at);
  const tilde = name.lastIndexOf('~');
  return tilde === -1 ? name : name.slice(tilde + 1);
};

export { islandApp, islandAppNameOf } from './app';

// --- Mounted instances --------------------------------------------------------

interface Mounted {
  inst: InstanceState;
  app: IslandApp;
  doc: ProxyDocument;
  handle?: RenderedHandle | void;
  props: Record<string, unknown>;
}

const newPid = (): string => `w-${Math.random().toString(36).slice(2, 8)}`;

const pushClear = (key: string): void => {
  const inst = instances.get(key);
  inst?.ops.push({ t: 'clear' });
};

// --- Runtime: message handling ------------------------------------------------

export interface IslandWorkerDef {
  readonly kind: 'poly' | 'mono';
  /** Handle one wire call; `post` delivers unsolicited op pushes. */
  handle(call: IslandCall, post: (msg: IslandReply) => void): Promise<void> | void;
}

function createRuntime(apps: Map<string, IslandApp>): IslandWorkerDef {
  let post: (msg: IslandReply) => void = () => {};

  /** Per-definition app registry — NOT module-global (Atoll's registry is
   *  module-level because each worker entry is its own module graph; under
   *  in-process sharing or multiple defs per graph a global registry unions
   *  every def's apps and breaks mono/unknown-app semantics). */
  const resolveApp = (name: string): IslandApp | undefined =>
    apps.get(name) ?? (apps.size === 1 ? apps.values().next().value : undefined);

  const mounts = new Map<string, Mounted>();

  const reply = (id: number, ops: Op[], data?: unknown): void =>
    post({ t: 'result', id, ops, ...(data !== undefined ? { data } : {}) });

  function mountInstance(
    key: string,
    props: Record<string, unknown>,
  ): Op[] {
    const app = resolveApp(appNameOf(key));
    if (app === undefined) {
      throw new Error(
        `mount: unknown app "${key}" — registry has: ${[...apps.keys()].join(', ') || '(empty)'}`,
      );
    }
    const inst = createInstance(key, newPid());
    inst.post = post;
    const doc = createProxyDocument(key);
    const mounted: Mounted = { inst, app, doc, props };
    mounts.set(key, mounted);
    return runInInstance(key, () => {
      if (isImperative(app)) app.imperative(doc, props);
      else mounted.handle = app.mount({ instance: key, doc, props });
      return takeOps(key);
    });
  }

  function unmountInstance(key: string): Op[] {
    const m = mounts.get(key);
    if (!m) return [];
    const ops = runInInstance(key, () => {
      if (isImperative(m.app)) m.app.dispose?.(m.doc);
      else m.handle?.dispose?.();
      return takeOps(key);
    });
    m.doc.dispose();
    mounts.delete(key);
    dropInstance(key);
    return ops;
  }

  function rebuildInstance(m: Mounted, props: Record<string, unknown>): Op[] {
    return runInInstance(m.inst.key, () => {
      if (isImperative(m.app)) m.app.dispose?.(m.doc);
      else m.handle?.dispose?.();
      m.doc.dispose();
      pushClear(m.inst.key);
      m.doc = createProxyDocument(m.inst.key);
      m.props = props;
      if (isImperative(m.app)) m.app.imperative(m.doc, props);
      else m.handle = m.app.mount({ instance: m.inst.key, doc: m.doc, props });
      return takeOps(m.inst.key);
    });
  }

  type Call = Extract<IslandCall, { t: 'call' }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods: Record<Call['method'], (call: any) => Op[] | Promise<Op[]>> = {
    mount(call) {
      const props = unmarshalCallbackProps(call.props ?? {}, call.instance);
      // Remount on an existing key = rebuild (the instance survives).
      const mounted = mounts.get(call.instance);
      if (mounted) return rebuildInstance(mounted, props);
      return mountInstance(call.instance, props);
    },
    updateProps(call) {
      const m = mounts.get(call.instance);
      if (!m) return [];
      const props = unmarshalCallbackProps(call.props, call.instance);
      if (!isRendered(m.app) || !m.handle?.update) {
        // No fine-grained update → imperative rebuild semantics.
        return rebuildInstance(m, props);
      }
      return runInInstance(call.instance, () => {
        m.handle!.update!(props);
        m.props = props;
        return takeOps(call.instance);
      });
    },
    dispatch(call) {
      const fn = getHandler(call.instance, call.handler);
      if (!fn) return [];
      const m = mounts.get(call.instance);
      const run = () => {
        fn(call.payload);
        return takeOps(call.instance);
      };
      // Re-enter the instance so ambient document/emit route correctly.
      return m ? runInInstance(call.instance, run) : [];
    },
    setSize(call) {
      return runInInstance(call.instance, () => {
        setInstanceSize(call.instance, call.width, call.height);
        return takeOps(call.instance);
      });
    },
    flush(call) {
      return takeOps(call.instance);
    },
    unmount(call) {
      return unmountInstance(call.instance);
    },
    whoami() {
      return [];
    },
    renderer() {
      return [];
    },
  };

  return {
    kind: 'poly',
    handle(call, postFn) {
      post = postFn;
      const m = methods[call.method] as ((c: unknown) => Op[] | Promise<Op[]>) | undefined;
      if (!m) return void reply(call.id, []);
      try {
        const out = m(call);
        const finish = (ops: Op[]): void => {
          let data: unknown;
          if (call.method === 'whoami') data = instances.get(call.instance)?.pid;
          if (call.method === 'renderer') {
            const app = mounts.get(call.instance)?.app;
            data = app && isRendered(app) ? (app.renderer ?? null) : null;
          }
          if (call.method === 'mount') data = instances.get(call.instance)?.pid;
          reply(call.id, ops ?? [], data);
        };
        if (out instanceof Promise) out.then(finish, (e) => post({ t: 'error', id: call.id, message: String(e?.message ?? e) }));
        else finish(out);
      } catch (e) {
        post({ t: 'error', id: call.id, message: String(e instanceof Error ? e.message : e) });
      }
    },
  };
}

// --- Instance-aware globals ----------------------------------------------------
// `document`/`window` inside a worker resolve through the ACTIVE instance —
// Preact calls the ambient `document.createElementNS` during render, so this
// is what makes the renderer work unmodified. Outside instance scope the
// last-active instance wins (documented heuristic — the same one Atoll
// documents); when a real document exists (in-process tests) it is the
// fallback so main-thread code is never broken.

let dispatcherInstalled = false;
const realDocument: unknown = typeof document !== 'undefined' ? document : undefined;
const realWindow: unknown = typeof window !== 'undefined' ? window : undefined;

function resolveInstance(): string | null {
  const active = getActiveInstance();
  if (active) return active;
  // When a real document exists (in-process tests share the main thread's
  // realm), only an ACTIVE instance may shadow it — otherwise driver replay,
  // main-thread renders, and test code would all read the proxy document.
  // The last-active/sole heuristics exist for real workers, where ambient
  // `document` out-of-task IS the point (and our renderer's __r/diffed scope
  // hooks make view apps deterministic without them anyway).
  if (realDocument !== undefined) return null;
  const last = getLastActiveInstance();
  if (last && instances.has(last)) return last;
  if (instances.size === 1) return instances.keys().next().value ?? null;
  return null;
}

function resolveDoc(): ProxyDocument | undefined {
  const key = resolveInstance();
  return key ? (instances.get(key)?.doc as ProxyDocument | undefined) : undefined;
}

function installInstanceDispatcher(): void {
  if (dispatcherInstalled) return;
  dispatcherInstalled = true;
  const g = globalThis as Record<string, unknown>;
  // `realDocument`/`realWindow` were captured at module load — before any
  // instance existed — so they always hold the ambient globals (jsdom
  // defines `document` as an accessor, so reading `docDesc.value` would
  // silently yield undefined; we must not consult the descriptor's value).
  Object.defineProperty(g, 'document', {
    configurable: true,
    get: () => resolveDoc() ?? realDocument,
  });
  Object.defineProperty(g, 'window', {
    configurable: true,
    get: () => {
      const doc = resolveDoc();
      if (!doc) return realWindow;
      const inst = instances.get(doc.instance);
      return {
        document: doc,
        innerWidth: inst?.size.w ?? 0,
        innerHeight: inst?.size.h ?? 0,
        addEventListener: doc.addEventListener.bind(doc),
        removeEventListener: doc.removeEventListener.bind(doc),
        requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask,
        location: (realWindow as { location?: unknown })?.location,
      };
    },
  });
  if (realDocument === undefined) {
    // Real workers have no DOM globals to preserve — expose the classes
    // libraries instanceof-check.
    if (g.Element === undefined) g.Element = ProxyElement;
    if (g.HTMLElement === undefined) g.HTMLElement = ProxyElement;
    if (g.Node === undefined) g.Node = ProxyNodeClass;
  }
}

// ProxyNode import for the global; done lazily to keep the class ref.
import { ProxyNode as ProxyNodeClass } from './proxyDom';

// --- Entry points ---------------------------------------------------------------

export interface PolyWorkerRegistry {
  apps: Record<string, IslandApp>;
}

/**
 * `definePolyWorker({ apps })` — one worker script hosting a registry of
 * island apps; every island spawned from it picks an app by key at mount.
 * Self-installs on `self` inside a real WorkerGlobalScope; in tests, wrap
 * the returned def in `createInProcessWorker`.
 */
export function definePolyWorker(registry: PolyWorkerRegistry): IslandWorkerDef {
  installInstanceDispatcher();
  const def = createRuntime(new Map(Object.entries(registry.apps)));
  maybeInstallOnSelf(def);
  return def;
}

/** `defineMonoWorker(app)` — one worker script, one app. The mount's app
 *  name is ignored: a single-entry registry resolves its sole app. */
export function defineMonoWorker(app: IslandApp): IslandWorkerDef {
  installInstanceDispatcher();
  const name = islandAppNameOf(app) ?? 'main';
  const def = createRuntime(new Map([[name, app]]));
  maybeInstallOnSelf(def);
  return def;
}

declare const WorkerGlobalScope: (new () => unknown) | undefined;

function maybeInstallOnSelf(def: IslandWorkerDef): void {
  const g = globalThis as { postMessage?: (m: IslandReply) => void; onmessage?: unknown };
  const inWorker =
    typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof (WorkerGlobalScope as new () => object);
  if (inWorker) {
    const s = self as unknown as {
      onmessage: ((e: { data: IslandCall }) => void) | null;
      postMessage: (m: IslandReply) => void;
    };
    s.onmessage = (e) => def.handle(e.data, (msg) => s.postMessage(msg));
  }
}
