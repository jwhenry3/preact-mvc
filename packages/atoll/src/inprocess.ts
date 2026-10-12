/**
 * In-process island worker — Atoll's `src/testing/inProcessWorker.ts`
 * pattern. The worker definition's message handling runs on the calling
 * thread (async via microtasks, like a real postMessage hop), so island
 * behavior can be tested without a real Worker — and the proxy-DOM code
 * path gets exercised for real: it serializes ops, the driver replays them
 * onto jsdom.
 *
 * Instance-aware `document` resolution still applies: during in-process
 * island tasks the active instance's proxy document shadows the ambient
 * one, restoring afterwards.
 */
import type { IslandCall, IslandReply, WorkerLike } from './ops';
import type { IslandWorkerDef } from './worker';

export class InProcessWorker implements WorkerLike {
  private listeners = new Set<(e: { data: IslandReply }) => void>();
  terminated = false;

  constructor(private def: IslandWorkerDef) {}

  postMessage(msg: IslandCall): void {
    if (this.terminated) return;
    const def = this.def;
    const post = (reply: IslandReply): void => {
      if (this.terminated) return;
      queueMicrotask(() => {
        for (const l of this.listeners) l({ data: reply });
      });
    };
    queueMicrotask(() => {
      void def.handle(msg, post);
    });
  }

  addEventListener(_type: 'message', l: (e: { data: IslandReply }) => void): void {
    this.listeners.add(l);
  }
  removeEventListener(_type: 'message', l: (e: { data: IslandReply }) => void): void {
    this.listeners.delete(l);
  }
  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
  }
}

/** `worker: createInProcessWorker(def)` — a `WorkerLike` factory for
 *  `mountIsland`/`connectIslandWorker`. */
export const createInProcessWorker = (def: IslandWorkerDef): (() => WorkerLike) => () =>
  new InProcessWorker(def);
