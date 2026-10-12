/**
 * The chart thread — a dedicated worker for the echarts island, so SVG
 * diffing and zrender's layout never touch the main thread. It hosts one
 * app (`chart`) with the shared worker-side provider spine: its own
 * QueryClient + FakeApi, BroadcastChannel-hydrated with the shell, so one
 * ['revenue'] fetch feeds the island and no data crosses the wire.
 */
import {
  defineViewPolyWorker,
  viewIslandApp,
  ProxyElement,
} from '@preact-mvc/atoll-island/worker';
import { pageProviders } from '@/workers/shared';
import { RevenueChartIsland } from '@/islands/revenue-chart.island';

// zrender probes `canvas.getContext('2d')` for text measurement. A proxy
// element has no getContext, so the probe would TypeError instead of
// taking zrender's font-size estimation path — a null-returning stub
// routes it there. echarts' real drawing is SVG ops; no canvas needed.
if (!(ProxyElement.prototype as { getContext?: unknown }).getContext) {
  (ProxyElement.prototype as { getContext?: () => null }).getContext = () => null;
}

export const worker = defineViewPolyWorker({
  apps: {
    chart: viewIslandApp(RevenueChartIsland, { providers: pageProviders() }),
  },
});
