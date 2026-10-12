/**
 * `@preact-mvc/atoll-island` — the `*-island` package's shell surface
 * (docs/atoll/islands-frameworks.md): mount a worker-hosted island tree as
 * an ordinary element in a preact-mvc app. The worker-side renderer
 * (viewIslandApp, defineViewPolyWorker) lives in the `./worker` entry.
 *
 * The driver/mount API is re-exported from `@preact-mvc/atoll` so shell
 * code only needs this one package.
 */
export { Island, islandComponent, lazyIsland } from './shell';
export type { IslandShellProps, IslandFacadeProps } from './shell';
export {
  mountIsland,
  connectIslandWorker,
  callbackProp,
  islandApp,
  islandAppNameOf,
} from '@preact-mvc/atoll';
export type {
  IslandClient,
  IslandHandle,
  ConnectOptions,
  IslandAppProps,
  WorkerLike,
} from '@preact-mvc/atoll';
