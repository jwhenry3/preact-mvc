/**
 * The revenue chart as a WORKER island app: echarts' SVG renderer emits
 * ordinary DOM ops (createElementNS, attr, style, listen), so the whole
 * chart — axis, line, area, tooltip — renders on the dedicated chart
 * thread and replays into the dashboard's mount box.
 *
 * It runs its own ['revenue'] query on the worker-side QueryClient —
 * BroadcastChannel hydration means the worker's fetch also fills the
 * shell's cache, so the dashboard's skeleton gate sees the same data
 * without anything crossing the wire twice.
 *
 * Geometry: the island's mount element IS the chart box, so the pushed
 * container size is honest — doc.body reports it and doc.onResize fires
 * on every push (mount runs before the first push, so init reads 0 and
 * the first setSize task calls chart.resize()).
 */
import { Component, Controller, View, inject, type OnDestroy } from '@preact-mvc/core';
import { QueryClient } from '@tanstack/preact-query';
import * as echarts from 'echarts';
import zrenv from 'zrender/lib/core/env';
import { installDomShim } from '@preact-mvc/atoll-island/worker';
import type { ProxyElement, ProxyDocument } from '@preact-mvc/atoll-island/worker';
import { FakeApi } from '@/services/fake-api.service';
import { querySignal } from '@/lib/query';

// At module-eval time inside a real worker, `typeof document ===
// 'undefined'`, so zrender stamps env.worker=true and zrender.ts builds
// NO event proxy (`!env.node && !env.worker && !ssr`) — the chart would
// render but never receive pointer input. The proxy DOM is DOM-shaped,
// so the flags are flipped before the first echarts.init; env is a
// mutable singleton read at init time, not import time. Pointer-local
// coords arrive as zrX/zrY on the event payload (see @atolljs/islands
// buildEventPayload), so no coordinate transform is needed here.
zrenv.worker = false;
zrenv.domSupported = true;
zrenv.hasGlobalWindow = true;
zrenv.svgSupported = true;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Controller()
export class RevenueChartController implements OnDestroy {
  private api = inject(FakeApi);
  private qc = inject(QueryClient);

  readonly revenue = querySignal(this.qc, {
    queryKey: ['revenue'],
    queryFn: () => this.api.revenueSeries(),
  });

  private el?: ProxyElement;
  private chart?: echarts.ECharts;
  private dark = false;

  /** Preact ref target — typed as a real element, a ProxyElement at runtime. */
  bind = (el: HTMLDivElement | null): void => {
    if (!el || this.el === (el as unknown as ProxyElement)) return;
    const pel = el as unknown as ProxyElement;
    this.el = pel;
    const doc = pel.doc as ProxyDocument;
    // zrender reads el.ownerDocument.defaultView.getComputedStyle — the
    // facade only exists once the DOM shim installs it (window facade:
    // empty computed style, never-matching matchMedia, pushed-size
    // innerWidth/Height, devicePixelRatio, instance-scoped timers + rAF).
    installDomShim(doc);
    // The chart div fills the island container's box — mark it so
    // clientWidth/offsetWidth/getBoundingClientRect report the pushed size.
    doc.markContainer(pel);
    this.init();
    doc.onResize(() => this.chart?.resize());
  };

  /**
   * Called during render() — in-instance scope — when data/theme change.
   * The dispatch task's sync lane re-renders the app on EVERY event (any
   * zrender mousemove included), so setOption must be reference-guarded:
   * re-setting identical options rebuilds the whole svg tree — the flicker.
   */
  private lastData?: number[];

  sync(data: number[] | undefined, dark: boolean): void {
    if (dark !== this.dark) {
      this.dark = dark;
      if (this.chart) {
        this.init(); // echarts theme is init-time — re-init
        return;
      }
    }
    if (data === this.lastData) return;
    this.apply(data);
  }

  private init(): void {
    this.chart?.dispose();
    this.chart = echarts.init(
      this.el as unknown as HTMLElement,
      this.dark ? 'dark' : undefined,
      { renderer: 'svg' },
    );
    // Mount order: render() → commit → ref.bind → init. The first sync()
    // ran before the chart existed, so apply the latest data here too —
    // cached data never re-fires the signal, there is no second render.
    this.apply(this.revenue.value.data);
  }

  private apply(data: number[] | undefined): void {
    if (!this.chart || !data) return;
    this.lastData = data;
    this.chart.setOption({
      xAxis: {
        type: 'category',
        data: MONTHS,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { opacity: 0.15 } } },
      series: [
        {
          type: 'line',
          data,
          smooth: true,
          symbol: 'none',
          areaStyle: { opacity: 0.15 },
          lineStyle: { width: 2.5 },
          color: 'hsl(221 83% 53%)',
          // Hover state swaps el.style for a state-scoped style; on the
          // proxy DOM the restore path loses stroke/fill (attr remove ops)
          // and the series disappears. Emphasis adds nothing here anyway —
          // same stroke, no symbols — so disable the state swap.
          emphasis: { disabled: true },
          select: { disabled: true },
        },
      ],
      grid: { left: 50, right: 12, top: 12, bottom: 28 },
      tooltip: { trigger: 'axis' },
    });
  }

  onDestroy(): void {
    this.chart?.dispose();
    this.chart = undefined;
  }
}

@Component({ controllers: [RevenueChartController] })
export class RevenueChartIsland extends View<{ dark?: boolean }> {
  readonly c = inject(RevenueChartController);

  render() {
    const c = this.c;
    // Signal read here (in-instance render scope) drives the imperative
    // sync — the same pattern the dashboard uses for emit().
    c.sync(c.revenue.value.data, this.props.dark === true);
    return <div ref={c.bind} style="width:100%;height:100%" />;
  }
}
