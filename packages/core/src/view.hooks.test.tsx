import 'preact/debug';
import { h, render, options } from 'preact';
import { useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { describe, it, expect, vi } from 'vitest';
import { signal } from '@preact/signals';
import { Injector } from './injector';
import { InjectorContext } from './context';
import { View } from './view';

// `preact/debug` is loaded here on purpose: its hook guard is the dev-only
// check that turns the nested-render race into "Hook can only be invoked
// from render methods". This file locks in the behavior it validates.

const tick = signal(0);

function HookedChild(props: { label: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (el.current) el.current.dataset.seen = '1';
  }, []);
  return <span ref={el}>child:{props.label}</span>;
}

function NestedMount(props: { effect: 'layout' | 'async' }) {
  const host = useRef<HTMLDivElement>(null);
  const seed = () => {
    render(<b>seeded</b>, host.current!);
    return () => render(null, host.current!);
  };
  if (props.effect === 'layout') useLayoutEffect(seed, []);
  else useEffect(seed, []);
  return <div ref={host} />;
}

function mount(view: any) {
  const host = document.createElement('div');
  render(h(InjectorContext.Provider, { value: new Injector(null, 'root') }, h(view, null)), host);
  return host;
}

describe('function components inside views (preact/debug loaded)', () => {
  it('mounts and re-renders a hooked function component from a view', async () => {
    class V extends View {
      render() {
        const t = tick.value;
        return (
          <div>
            <span>t{t}</span>
            <HookedChild label={`v${t}`} />
          </div>
        );
      }
    }
    const host = mount(V);
    expect(host.textContent).toContain('child:v0');
    tick.value = 1;
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toContain('t1');
    expect(host.textContent).toContain('child:v1');
  });

  it('survives a nested render() inside a pending useEffect', async () => {
    // Regression: a signal write landing before the mount effect's async
    // flush makes hooks invoke the pending useEffect inside options.__r.
    // Its nested render() then runs a nested diffed, which used to clear
    // debug's hook guard and throw on the component's next hook.
    class V extends View {
      render() {
        const t = tick.value;
        return (
          <div>
            <span>t{t}</span>
            <NestedMount effect="async" />
          </div>
        );
      }
    }
    const host = mount(V);
    tick.value = 2;
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toContain('t2');
    expect(host.textContent).toContain('seeded');
    tick.value = 3;
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toContain('t3');
  });

  it('supports components that mount a sub-tree via render() in useLayoutEffect', async () => {
    class V extends View {
      render() {
        const t = tick.value;
        return (
          <div>
            <span>t{t}</span>
            <NestedMount effect="layout" />
          </div>
        );
      }
    }
    const host = mount(V);
    tick.value = 4;
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toContain('t4');
    expect(host.textContent).toContain('seeded');
  });

  it('warns on a render-scheduled update without blocking converging writes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const n = signal(0);
    function SeedOnce() {
      // Converging render-phase write: runs once, then stops.
      if (n.value < 1) n.value++;
      return <span>seed:{n.value}</span>;
    }
    class V extends View {
      render() {
        return <SeedOnce />;
      }
    }
    const host = mount(V);
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toContain('seed:1');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('scheduled an update while rendering')
    );
    warn.mockRestore();
  });

  it('still rejects hooks called outside a render body', () => {
    const check = (options as any).__h;
    expect(typeof check).toBe('function');
    // A component that is not executing its body: the real violation path
    // still throws instead of being silently tolerated.
    expect(() => check({}, 0, 3)).toThrow(/Hook can only be invoked/);
  });
});
