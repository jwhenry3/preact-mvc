/**
 * Per-island-instance worker state — modeled on Atoll's
 * `packages/islands/src/worker/instance.ts` (docs/atoll/islands-worker.md).
 *
 * Every mounted island mints an `app@N` instance key that scopes its op
 * queue, proxy document, event handler table, and pushed container size.
 * `runInInstance` makes an instance "active" for the duration of a task so
 * `emit()` and ambient `document` resolution route correctly; work outside
 * a task (timers, promise continuations, signal-driven re-renders) re-enters
 * via `runInInstance(key, fn)` or resolves the last-active instance as a
 * documented heuristic.
 */
import type { Op } from './ops';

export interface InstanceState {
  key: string;
  /** Random per-mount id — proof each island is a distinct render instance. */
  pid: string;
  ops: Op[];
  handlers: Map<number, (payload: unknown) => void>;
  nextHandler: number;
  /** Pushed container geometry — the ONLY honest box the worker knows. */
  size: { w: number; h: number };
  resizeCbs: Set<(w: number, h: number) => void>;
  /** The instance's proxy document (set by proxyDom on creation). */
  doc?: unknown;
  /** The owning worker's reply channel — set at mount, so out-of-task op
   *  pushes reach the right driver even when several worker defs share a
   *  realm (in-process tests). */
  post?: (msg: { t: 'ops'; instance: string; ops: Op[] }) => void;
}

export const instances = new Map<string, InstanceState>();

let activeInstance: string | null = null;
let lastActiveInstance: string | null = null;

export const getActiveInstance = (): string | null => activeInstance;
export const getLastActiveInstance = (): string | null => lastActiveInstance;

/** Run `fn` with `key` as the active instance. */
export function runInInstance<T>(key: string, fn: () => T): T {
  const prev = enterInstance(key);
  try {
    return fn();
  } finally {
    exitInstance(prev);
  }
}

/** Split-scope primitives for hook pairs (Preact `options.__r`/`diffed`) that
 *  can't wrap a call: `enter` returns the previous scope, `exit` restores it. */
export function enterInstance(key: string): string | null {
  const prev = activeInstance;
  activeInstance = key;
  lastActiveInstance = key;
  return prev;
}
export function exitInstance(prev: string | null): void {
  activeInstance = prev;
}

export function createInstance(key: string, pid: string): InstanceState {
  const inst: InstanceState = {
    key,
    pid,
    ops: [],
    handlers: new Map(),
    nextHandler: 1,
    size: { w: 0, h: 0 },
    resizeCbs: new Set(),
  };
  instances.set(key, inst);
  return inst;
}

export function dropInstance(key: string): void {
  instances.delete(key);
}

/**
 * Append an op to the instance's queue and schedule an out-of-task push.
 * Ops emitted inside a task are returned in the task's result batch (the
 * microtask finds an empty queue); ops from signal-driven re-renders or
 * timers get posted on the next microtask — the always-push transport.
 */
export function pushOp(key: string, op: Op): void {
  instances.get(key)?.ops.push(op);
  schedulePush(key);
}

/** Drain the instance's op queue — called at the end of every task and by
 *  the scheduled push. */
export function takeOps(key: string): Op[] {
  const inst = instances.get(key);
  if (inst === undefined || inst.ops.length === 0) return [];
  const out = inst.ops;
  inst.ops = [];
  return out;
}

export function registerHandler(key: string, fn: (payload: unknown) => void): number {
  const inst = instances.get(key);
  if (inst === undefined) return -1;
  const id = inst.nextHandler++;
  inst.handlers.set(id, fn);
  return id;
}

export function getHandler(key: string, id: number): ((p: unknown) => void) | undefined {
  return instances.get(key)?.handlers.get(id);
}

export function setInstanceSize(key: string, w: number, h: number): void {
  const inst = instances.get(key);
  if (inst === undefined) return;
  inst.size = { w, h };
  for (const cb of inst.resizeCbs) cb(w, h);
}

/**
 * Island → shell event. Emits an `emit` op on the active instance's queue;
 * outside a task the op rides the scheduled push. Payloads must be
 * structured-cloneable.
 */
export function emit(name: string, payload?: unknown): void {
  const key = activeInstance ?? lastActiveInstance;
  if (key === null || !instances.has(key)) {
    throw new Error('emit() called with no island instance in scope');
  }
  pushOp(key, { t: 'emit', name, payload });
}

// --- Out-of-task push scheduling -------------------------------------------

const pushScheduled = new Set<string>();

function schedulePush(key: string): void {
  if (pushScheduled.has(key)) return;
  pushScheduled.add(key);
  queueMicrotask(() => {
    pushScheduled.delete(key);
    const inst = instances.get(key);
    if (!inst) return;
    const ops = takeOps(key);
    if (ops.length > 0) inst.post?.({ t: 'ops', instance: key, ops });
  });
}
