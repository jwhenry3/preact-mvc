/**
 * The whole protocol between the two threads — modeled on Atoll's
 * `packages/islands/src/ops.ts` (see docs/atoll/islands.md). The worker runs
 * a real renderer (Preact + our View classes) against a proxy DOM; every
 * mutation appends one of these ops to the instance's queue. Ops ride
 * postMessage — no shared memory.
 *
 * `emit` is the one op that is NOT a DOM mutation: it is the island→shell
 * event channel — the driver hands `{name, payload}` to the island's
 * `onEvent` callback instead of touching the DOM.
 */
export type Op =
  /** createElement-equivalent. `ns` carries non-HTML namespaces (SVG). */
  | { t: 'create'; id: number; type: string; ns?: string }
  /** createTextNode-equivalent. */
  | { t: 'text'; id: number; text: string }
  /** createComment-equivalent — real comment nodes driver-side (branch
   *  markers keep a position, like Vue v-if / Preact fragments' anchors). */
  | { t: 'comment'; id: number }
  /** `parent.insertBefore(child, before ?? null)` — parent 0 is the root container. */
  | { t: 'append'; parent: number; child: number; before?: number }
  /** Detach `child` from wherever it is mounted. */
  | { t: 'remove'; child: number }
  /** Set/remove a single attribute — `value: null` removes it.
   *  `data-atoll-slot` marks a transclusion slot the driver routes to the
   *  island's `slots` registry instead of treating as a plain attribute. */
  | { t: 'attr'; id: number; name: string; value: string | null }
  /** Assign a DOM property (`value`, `checked`, `className`, …). */
  | { t: 'prop'; id: number; name: string; value: unknown }
  /** New text content — text-node `data` writes and `element.textContent`
   *  (the driver assigns `node.textContent`, replacing children). */
  | { t: 'utext'; id: number; text: string }
  /** Merge inline-style changes; `''` clears a key. `--x` are custom props,
   *  a `!important` suffix applies with priority, `cssText` replaces all. */
  | { t: 'style'; id: number; props: Record<string, string> }
  /** Raw `innerHTML` assignment (dangerouslySetInnerHTML). */
  | { t: 'html'; id: number; html: string }
  /** Clear the root container (rebuild). */
  | { t: 'clear' }
  /** Attach a DOM listener — `handler` is a worker handler-table id; the
   *  driver wires it to a `dispatch` call back into the worker. `id: 0`
   *  targets the island's root container (document/window listeners). */
  | {
      t: 'listen';
      id: number;
      type: string;
      handler: number;
      opts?: { once?: boolean; passive?: boolean; capture?: boolean };
    }
  /** Detach the listener a `listen` op attached. */
  | {
      t: 'unlisten';
      id: number;
      type: string;
      handler: number;
      opts?: { once?: boolean; passive?: boolean; capture?: boolean };
    }
  /** Island → shell event — `emit(name, payload)` worker-side lands in the
   *  shell's `onEvent`. Reserved name: `CALLBACK_EVENT` routes to a
   *  marshalled callbackProp. Payloads must be structured-cloneable. */
  | { t: 'emit'; name: string; payload?: unknown };

/** Reserved `emit` name carrying a shell→worker callbackProp invocation. */
export const CALLBACK_EVENT = '__callbackProp';

/** What the main thread sends back when a DOM event fires — a best-effort
 *  handful of spec-shaped fields, never a SyntheticEvent. */
export interface EventPayload {
  type: string;
  value?: string;
  checked?: boolean;
  key?: string;
  clientX?: number;
  clientY?: number;
  screenX?: number;
  screenY?: number;
  button?: number;
  /** UIEvent.which — 1 = left button, 2 = middle, 3 = right. */
  which?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  pointerType?: string;
  scrollTop?: number;
  /** The worker node id of `event.target`, when it maps to one. */
  targetId?: number;
  /** Synthesized worker-side: the proxy node for `targetId` (never crosses
   *  the wire). Lets delegated handlers do `e.target.closest(…)`. */
  target?: unknown;
  /** Synthesized worker-side: the node the listener was attached to. */
  currentTarget?: unknown;
  /** Synthesized NO-OPS (never cross the wire): the real event already
   *  dispatched on the main thread — these exist so library code written
   *  for real DOM events doesn't crash. They CANNOT cancel anything. */
  preventDefault?(): void;
  stopPropagation?(): void;
  stopImmediatePropagation?(): void;
}

/**
 * Wire messages. Main→worker is a single `call` envelope (method +
 * instance key + args); worker→main is `result` (a call's op batch),
 * `error`, or an unsolicited `ops` push for work committed outside a task
 * (signal-driven re-renders, timers) — our "always push" transport; Atoll's
 * doorbell/poll split doesn't exist because ops post directly.
 */
export type IslandCall =
  | { t: 'call'; id: number; method: 'mount'; instance: string; props: Record<string, unknown> }
  | { t: 'call'; id: number; method: 'updateProps'; instance: string; props: Record<string, unknown> }
  | { t: 'call'; id: number; method: 'dispatch'; instance: string; handler: number; payload: EventPayload }
  | { t: 'call'; id: number; method: 'setSize'; instance: string; width: number; height: number }
  | { t: 'call'; id: number; method: 'flush'; instance: string }
  | { t: 'call'; id: number; method: 'unmount'; instance: string }
  | { t: 'call'; id: number; method: 'whoami'; instance: string }
  | { t: 'call'; id: number; method: 'renderer'; instance: string };

export type IslandReply =
  | { t: 'result'; id: number; ops: Op[]; data?: unknown }
  | { t: 'error'; id: number; message: string }
  /** Out-of-task op push — no request id; the driver just applies them. */
  | { t: 'ops'; instance: string; ops: Op[] };

/** The minimal Worker surface the driver needs — `Worker` in production,
 *  `InProcessWorker` in tests (see inprocess.ts). */
export interface WorkerLike {
  postMessage(msg: IslandCall): void;
  addEventListener(type: 'message', l: (e: { data: IslandReply }) => void): void;
  removeEventListener(type: 'message', l: (e: { data: IslandReply }) => void): void;
  terminate(): void;
}
