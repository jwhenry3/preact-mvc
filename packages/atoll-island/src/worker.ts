/**
 * `@preact-mvc/atoll-island/worker` — the `*-island` package's worker
 * renderer (docs/atoll/islands-frameworks.md): render View classes and
 * function components into the instance's proxy document via Preact.
 *
 *   // render.worker.ts
 *   export const worker = defineViewPolyWorker({
 *     apps: { counter: CounterView, clock: ClockView },
 *   });
 *
 * The framework-free worker API is re-exported from
 * `@preact-mvc/atoll/worker` so a worker entry needs no direct atoll-core
 * import (same convention as Atoll's `*-island` packages).
 */
export {
  viewIslandApp,
  viewIsland,
  defineViewPolyWorker,
  defineViewMonoWorker,
} from './adapter';
export type { ViewIslandAppOptions, ViewPolyWorkerRegistry } from './adapter';
export {
  definePolyWorker,
  defineMonoWorker,
  emit,
  runInInstance,
  enterInstance,
  exitInstance,
  getActiveInstance,
  getLastActiveInstance,
  islandApp,
  islandAppNameOf,
} from '@preact-mvc/atoll/worker';
export type {
  ImperativeIslandApp,
  RenderedIslandApp,
  RenderContext,
  RenderedHandle,
  IslandApp,
  IslandWorkerDef,
  ProxyDocument,
  ProxyElement,
} from '@preact-mvc/atoll/worker';
