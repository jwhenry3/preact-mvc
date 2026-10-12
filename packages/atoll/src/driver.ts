/**
 * The main-thread island driver — modeled on Atoll's
 * `packages/islands/src/island.ts` (docs/atoll/islands.md). Replays op
 * batches onto real DOM, dispatches real events back to the worker, pushes
 * container geometry via ResizeObserver, and routes `emit` ops to
 * `onEvent` / `data-atoll-slot` anchors to `slots`.
 *
 * Transport is always-push: worker task results and out-of-task op batches
 * both arrive over postMessage. There's no doorbell/poll split — ops never
 * wait to be polled.
 */
import type { EventPayload, IslandCall, IslandReply, Op, WorkerLike } from './ops';
import { CALLBACK_EVENT } from './ops';
import { islandAppNameOf } from './app';
import {
  callbackProp,
  marshalCallbackProps,
  newCallbackRegistry,
  type CallbackRegistry,
} from './callback';
import type { IslandApp } from './worker';

export { callbackProp };

// --- Client: one worker, RPC --------------------------------------------------

export interface IslandClient {
  /** Issue an instance-scoped call; resolves with its op batch. */
  call(
    method: IslandCall extends { method: infer M } ? M : never,
    instance: string,
    args: Record<string, unknown>,
  ): Promise<{ ops: Op[]; data?: unknown }>;
  /** Terminate the worker. Called by the last island that owns this client. */
  terminate(): void;
}

export interface ConnectOptions {
  /** The worker, or a bundler-detectable factory:
   *  `() => new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`
   *  Real workers must use the factory form so bundlers see the URL literal;
   *  an already-created `WorkerLike` (e.g. `createInProcessWorker`) is fine too. */
  worker: WorkerLike | (() => WorkerLike);
}

/** Spawn one worker and wrap it in an RPC client. Each `connectIslandWorker`
 *  = one OS thread; islands mounted with `client:` share it. */
export function connectIslandWorker(opts: ConnectOptions): IslandClient {
  const worker = typeof opts.worker === 'function' ? opts.worker() : opts.worker;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (r: { ops: Op[]; data?: unknown }) => void; reject: (e: Error) => void }
  >();
  /** Unsolicited op pushes route to islands by instance key. */
  const sinks = new Map<string, (ops: Op[]) => void>();

  const onMessage = (e: { data: IslandReply }): void => {
    const msg = e.data;
    if (msg.t === 'result' || msg.t === 'error') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.t === 'error') p.reject(new Error(msg.message));
      else p.resolve({ ops: msg.ops, data: msg.data });
    } else if (msg.t === 'ops') {
      sinks.get(msg.instance)?.(msg.ops);
    }
  };
  worker.addEventListener('message', onMessage);

  return {
    call(method, instance, args) {
      const id = nextId++;
      const msg = { t: 'call', id, method, instance, ...args } as IslandCall;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(msg);
      });
    },
    terminate() {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
    },
    // Internal — islands register their op sink here.
    ...({ sinks } as object),
  } as IslandClient & { sinks: Map<string, (ops: Op[]) => void> };
}

// --- Op replay ---------------------------------------------------------------

interface ReplayState {
  nodes: Map<number, Node>;
  /** Real listeners per (nodeId, type, handlerId) for unlisten. */
  listeners: Map<number, Map<string, EventListener>>;
  /** Which slot names were claimed, per element id — for null-callback on
   *  removal/rename. */
  slots: Map<number, string>;
  /** node → id, for event targetId resolution. */
  ids: WeakMap<Node, number>;
}

const EVENT_NUMERICS: (keyof EventPayload)[] = [
  'clientX',
  'clientY',
  'screenX',
  'screenY',
  'button',
  'deltaX',
  'deltaY',
  'deltaMode',
  'scrollTop',
];

function serializeEvent(ev: Event, st: ReplayState): EventPayload {
  const e = ev as unknown as Record<string, unknown>;
  const payload: EventPayload = { type: ev.type };
  const p = payload as unknown as Record<string, unknown>;
  for (const k of EVENT_NUMERICS) {
    const v = e[k];
    p[k as string] = typeof v === 'number' ? v : 0;
  }
  p.which =
    typeof e.which === 'number' && e.which ? e.which : ((e.button as number | undefined) ?? 0) + 1;
  for (const k of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'] as const)
    p[k] = Boolean(e[k]);
  if (typeof e.key === 'string') payload.key = e.key;
  if (typeof e.pointerType === 'string') payload.pointerType = e.pointerType;
  const t = ev.target as (Element & { value?: unknown; checked?: unknown }) | null;
  if (t) {
    const id = st.ids.get(t);
    if (id !== undefined) payload.targetId = id;
    if (typeof t.value === 'string') payload.value = t.value;
    if (typeof t.checked === 'boolean') payload.checked = t.checked;
    if (typeof t.scrollTop === 'number') payload.scrollTop = t.scrollTop;
  }
  return payload;
}

interface MountOptions {
  el: Element;
  worker?: WorkerLike | (() => WorkerLike);
  client?: IslandClient;
  app?: unknown; // string | stamped app reference
  props?: Record<string, unknown>;
  onEvent?: (name: string, payload: unknown) => void;
  slots?: Record<string, (el: Element | null) => void>;
  mountTimeout?: number; // default 15000, 0 disables
}

export interface IslandHandle {
  /** The registry key this island mounted. */
  app: string;
  /** The instance key (`app@N`). */
  instance: string;
  /** The worker-side pid — proof this island is a distinct render instance. */
  pid?: string;
  /** Shell→island channel: re-renders the root with new serialized props
   *  (replaces, not merges). */
  updateProps(props: Record<string, unknown>): void;
  /** Drain ops committed outside tasks — rarely needed; pushes cover it. */
  flush(): void;
  /** Release the instance; terminates an island-owned worker. */
  destroy(): void;
  /** Replay counters. */
  readonly opsApplied: number;
}

let mountCounter = 0;

/** Mount one island instance. `worker:` spawns an island-owned worker;
 *  `client:` adds an instance to a shared worker. */
export async function mountIsland(opts: MountOptions): Promise<IslandHandle> {
  if (!opts.worker && !opts.client) throw new Error('mountIsland: pass `worker` or `client`');
  const owned = !opts.client;
  const client = opts.client ?? connectIslandWorker({ worker: opts.worker! });
  const sinks = (client as unknown as { sinks: Map<string, (ops: Op[]) => void> }).sinks;

  const appName = islandAppNameOf(opts.app) ?? 'main';
  const instance = `${appName}@${++mountCounter}`;
  const el = opts.el;

  const st: ReplayState = { nodes: new Map(), listeners: new Map(), slots: new Map(), ids: new WeakMap() };
  st.nodes.set(0, el);
  st.ids.set(el, 0);
  const reg: CallbackRegistry = newCallbackRegistry();
  let opsApplied = 0;

  const applyOps = (ops: Op[]): void => {
    for (const op of ops) {
      opsApplied++;
      applyOp(op);
    }
  };

  const slot = (id: number, name: string | null, node?: Element): void => {
    const prev = st.slots.get(id);
    if (prev !== undefined && prev !== name) opts.slots?.[prev]?.(null);
    if (name === null) {
      if (prev !== undefined) {
        st.slots.delete(id);
        opts.slots?.[prev]?.(null);
      }
      return;
    }
    st.slots.set(id, name);
    if (node) opts.slots?.[name]?.(node);
  };

  function applyOp(op: Op): void {
    switch (op.t) {
      case 'create': {
        const node = op.ns
          ? document.createElementNS(op.ns, op.type)
          : document.createElement(op.type);
        st.nodes.set(op.id, node);
        st.ids.set(node, op.id);
        break;
      }
      case 'text': {
        const node = document.createTextNode(op.text);
        st.nodes.set(op.id, node);
        st.ids.set(node, op.id);
        break;
      }
      case 'comment': {
        const node = document.createComment('');
        st.nodes.set(op.id, node);
        st.ids.set(node, op.id);
        break;
      }
      case 'append': {
        const parent = st.nodes.get(op.parent);
        const child = st.nodes.get(op.child);
        if (!parent || !child) break;
        const before = op.before !== undefined ? st.nodes.get(op.before) : null;
        parent.insertBefore(child, before ?? null);
        break;
      }
      case 'remove': {
        const node = st.nodes.get(op.child);
        if (!node) break;
        const slotName = st.slots.get(op.child);
        if (slotName !== undefined) opts.slots?.[slotName]?.(null);
        st.slots.delete(op.child);
        node.parentNode?.removeChild(node);
        st.nodes.delete(op.child);
        st.listeners.delete(op.child);
        break;
      }
      case 'attr': {
        const node = st.nodes.get(op.id);
        if (!(node instanceof Element)) break;
        if (op.name === 'data-atoll-slot') {
          slot(op.id, op.value, node);
          break;
        }
        if (op.value === null) node.removeAttribute(op.name);
        else node.setAttribute(op.name, op.value);
        break;
      }
      case 'prop': {
        const node = st.nodes.get(op.id);
        if (node) (node as unknown as Record<string, unknown>)[op.name] = op.value;
        break;
      }
      case 'utext': {
        const node = st.nodes.get(op.id);
        if (node) node.textContent = op.text;
        break;
      }
      case 'html': {
        const node = st.nodes.get(op.id);
        if (node instanceof Element) node.innerHTML = op.html;
        break;
      }
      case 'style': {
        const node = st.nodes.get(op.id);
        if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) break;
        const style = (node as HTMLElement).style;
        for (const [k, v] of Object.entries(op.props)) {
          if (k === 'cssText') {
            style.cssText = v;
            continue;
          }
          const important = v.endsWith('!important');
          const val = important ? v.slice(0, -10).trim() : v;
          if (k.startsWith('--') || k.includes('-'))
            style.setProperty(k, val, important ? 'important' : '');
          else (style as unknown as Record<string, string>)[k] = val;
        }
        break;
      }
      case 'clear': {
        for (const name of st.slots.values()) opts.slots?.[name]?.(null);
        st.slots.clear();
        st.nodes.clear();
        st.nodes.set(0, el);
        el.textContent = '';
        break;
      }
      case 'listen': {
        const node = st.nodes.get(op.id);
        if (!node) break;
        const key = `${op.type}:${op.handler}:${op.opts?.capture ? 'c' : ''}`;
        let table = st.listeners.get(op.id);
        if (!table) st.listeners.set(op.id, (table = new Map()));
        if (table.has(key)) break;
        const listener = (ev: Event): void => {
          const payload = serializeEvent(ev, st);
          void client.call('dispatch', instance, {
            handler: op.handler,
            payload,
          }).then(({ ops }) => applyOps(ops));
        };
        table.set(key, listener);
        node.addEventListener(op.type, listener, op.opts);
        break;
      }
      case 'unlisten': {
        const key = `${op.type}:${op.handler}:${op.opts?.capture ? 'c' : ''}`;
        const fn = st.listeners.get(op.id)?.get(key);
        const node = st.nodes.get(op.id);
        if (fn && node) node.removeEventListener(op.type, fn, op.opts?.capture ?? false);
        st.listeners.get(op.id)?.delete(key);
        break;
      }
      case 'emit': {
        if (op.name === CALLBACK_EVENT) {
          const { id, args } = op.payload as { id: number; args: unknown[] };
          reg.fns.get(id)?.(...args);
        } else {
          opts.onEvent?.(op.name, op.payload);
        }
        break;
      }
    }
  }

  sinks.set(instance, applyOps);

  // Container geometry push — the worker's only honest box.
  let ro: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      void client
        .call('setSize', instance, { width: r.width, height: r.height })
        .then(({ ops }) => applyOps(ops));
    });
    ro.observe(el);
  }

  // Mount handshake — bounded by mountTimeout.
  const timeout = opts.mountTimeout ?? 15000;
  try {
    const { ops, data } = await (timeout > 0
      ? Promise.race([
          client.call('mount', instance, {
            props: marshalCallbackProps(opts.props ?? {}, reg),
          }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`mountIsland: mount "${instance}" timed out`)), timeout),
          ),
        ])
      : client.call('mount', instance, { props: marshalCallbackProps(opts.props ?? {}, reg) }));
    applyOps(ops);
    const pid = data as string | undefined;

    let destroyed = false;
    return {
      app: appName,
      instance,
      pid,
      get opsApplied() {
        return opsApplied;
      },
      updateProps(props: Record<string, unknown>) {
        if (destroyed) return;
        void client
          .call('updateProps', instance, { props: marshalCallbackProps(props, reg) })
          .then(({ ops }) => applyOps(ops));
      },
      flush() {
        if (destroyed) return;
        void client.call('flush', instance, {}).then(({ ops }) => applyOps(ops));
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        sinks.delete(instance);
        ro?.disconnect();
        void client.call('unmount', instance, {}).finally(() => {
          if (owned) client.terminate();
        });
        el.textContent = '';
      },
    };
  } catch (e) {
    sinks.delete(instance);
    ro?.disconnect();
    if (owned) client.terminate();
    throw e;
  }
}
