/**
 * Chart island contract — the module BOTH sides import. It names the
 * registry app, declares the prop schema (validated worker-side at mount
 * and updateProps), and carries the worker factory, so the view mounts
 * `islandComponent(chartContract)` with no worker plumbing at all.
 *
 * The chart has no emit vocabulary — it is a pure display island fed by
 * the worker-side revenue query.
 *
 * Never import the `.worker.tsx` entry itself here: defining a worker
 * installs instance globals. The URL literal inside `new Worker(...)`
 * stays bundler-detectable — do not hoist or compute it.
 */
import { defineIslandContract, z } from '@preact-mvc/atoll-island';

export const chartContract = defineIslandContract({
  app: 'chart',
  props: z.object({ dark: z.boolean().optional() }),
  worker: () =>
    new Worker(new URL('../workers/chart.worker.tsx', import.meta.url), {
      type: 'module',
    }),
});
