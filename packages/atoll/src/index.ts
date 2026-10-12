/**
 * `@preact-mvc/atoll` — the framework-free islands core, modeled on
 * Atoll's `packages/islands` (docs/atoll/islands.md): a worker owns the
 * render loop against a proxy DOM; commits serialize to an op stream the
 * main-thread driver replays as real DOM mutations.
 *
 * Shell side (this entry): mountIsland, connectIslandWorker, callbackProp,
 * islandApp. Worker side (import in worker entries): the `./worker`
 * subpath exports definePolyWorker/defineMonoWorker, emit, and the
 * instance-scope API. The preact-mvc adapter and <Island/> shell
 * components live in `@preact-mvc/atoll-island`.
 */
export { mountIsland, connectIslandWorker, callbackProp } from './driver';
export type { IslandClient, IslandHandle, ConnectOptions } from './driver';
export { islandApp, islandAppNameOf } from './app';
export type { IslandAppProps } from './types';
export type { Op, EventPayload, IslandCall, IslandReply, WorkerLike } from './ops';
export { InProcessWorker, createInProcessWorker } from './inprocess';
