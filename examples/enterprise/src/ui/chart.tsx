/**
 * Vanilla-library integration pattern: echarts is renderer-agnostic, it
 * just needs a DOM node. Leaf function components are the right place —
 * they get real hooks (useRef/useLayoutEffect) while the View stays
 * class-first above them. Re-inits when `dark` flips so the chart follows
 * the theme signal.
 */
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { cn } from '@/lib/cn';

export function Chart({
  option,
  dark = false,
  class: c,
}: {
  option: EChartsOption;
  dark?: boolean;
  class?: string;
}): ComponentChildren {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const chart = echarts.init(el, dark ? 'dark' : undefined, { renderer: 'canvas' });
    chart.setOption({ backgroundColor: 'transparent', ...option });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [dark]);

  useLayoutEffect(() => {
    // Option updates without re-init (same theme).
    const inst = ref.current && echarts.getInstanceByDom(ref.current);
    inst?.setOption({ backgroundColor: 'transparent', ...option });
  }, [option]);

  return <div ref={ref} class={cn('h-64 w-full', c)} />;
}
