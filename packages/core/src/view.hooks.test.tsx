import 'preact/debug';
import { h, render, options } from 'preact';
import { useRef, useEffect, useLayoutEffect, useState } from 'preact/hooks';
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

  it('keeps component identity across re-fires of options.vnode', () => {
    // Preact's update path shallow-copies the mounted vnode and re-runs
    // options.vnode on the copy (it carries __c). A second pass over an
    // already-wrapped type must return the same function, or the copy's
    // type stops matching the mounted component and every update remounts.
    function AnyFn() {
      return null;
    }
    const v = h(AnyFn, null) as any;
    (options as any).vnode(v);
    const wrapped = v.type;
    expect(wrapped).not.toBe(AnyFn);
    const copy = { ...v, __c: {} };
    (options as any).vnode(copy);
    expect(copy.type).toBe(wrapped);

    class V extends View {
      render() {
        return null;
      }
    }
    const vv = h(V, null) as any;
    (options as any).vnode(vv);
    const host = vv.type;
    const copy2 = { ...vv, __c: {} };
    (options as any).vnode(copy2);
    expect(copy2.type).toBe(host);
  });

  it('does not remount on self-update + parent re-render (update-copy drift)', async () => {
    // The shim's repro, run against the real wrap: Target's setState in
    // useLayoutEffect queues a self-update whose vnode copy re-fires
    // options.vnode and is stored as the canonical child. The parent's
    // next re-render produces a fresh h(Target) — same wrapped type with
    // the fix (diff), wrapped-again without it (remount).
    let mounts = 0;
    function Target() {
      const [, setN] = useState(0);
      useLayoutEffect(() => {
        mounts++;
        setN((n) => n + 1);
      }, []);
      return <div>target</div>;
    }
    function Parent() {
      const [, setN] = useState(0);
      (Parent as any).tick = () => setN((x) => x + 1);
      return <Target key="t" />;
    }
    const host = document.createElement('div');
    render(<Parent />, host);
    await new Promise((r) => setTimeout(r, 50));
    (Parent as any).tick();
    await new Promise((r) => setTimeout(r, 50));
    expect(host.textContent).toBe('target');
    expect(mounts).toBe(1);
  });

  it('does not remount a function component on signal-driven update', async () => {
    let mounts = 0;
    const s = signal(0);
    function Counted() {
      const v = s.value; // self-update path: vnode copy re-fires options.vnode
      useLayoutEffect(() => {
        mounts++;
      }, []);
      return <span>v{v}</span>;
    }
    class V extends View {
      render() {
        s.value; // the parent re-renders too — fresh h(Counted) vs stored copy
        return <Counted />;
      }
    }
    const host = mount(V);
    const el = host.querySelector('span')!;
    // First write: Counted's self-update copy stores a drifted type without
    // the fix. Second write: the parent's fresh h(Counted) re-matches
    // against the drifted type — remount without the fix, diff with it.
    s.value = 1;
    await new Promise((r) => setTimeout(r, 50));
    s.value = 2;
    await new Promise((r) => setTimeout(r, 50));
    expect(host.querySelector('span')).toBe(el); // diffed, not remounted
    expect(mounts).toBe(1);
    expect(host.textContent).toContain('v2');
  });

  it('still rejects hooks called outside a render body', () => {
    const check = (options as any).__h;
    expect(typeof check).toBe('function');
    // A component that is not executing its body: the real violation path
    // still throws instead of being silently tolerated.
    expect(() => check({}, 0, 3)).toThrow(/Hook can only be invoked/);
  });
});
