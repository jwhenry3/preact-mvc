/**
 * Islands end-to-end — the worker definition runs in-process (Atoll's
 * InProcessWorker pattern): ops serialize for real, the driver replays them
 * onto jsdom, events round-trip as dispatch calls. A module-level signal
 * shared with the island app stands in for worker-side state — in a real
 * worker the signal lives in the worker; in-process the realms share one
 * heap, which is exactly what makes poking it a faithful out-of-task test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from '@testing-library/preact';
import { fireEvent } from '@testing-library/dom';
import { Component, View, signal, inject } from '@preact-mvc/core';
import { Injectable } from '@preact-mvc/core';
import { definePolyWorker, emit } from '@preact-mvc/atoll/worker';
import { defineViewPolyWorker, defineViewMonoWorker, viewIsland, viewIslandApp } from './adapter';
import { createInProcessWorker, callbackProp, connectIslandWorker, mountIsland } from '@preact-mvc/atoll';
import { Island } from './shell';
import type { IslandWorkerDef } from '@preact-mvc/atoll/worker';

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

const mountInto = (
  def: IslandWorkerDef,
  opts: Omit<Parameters<typeof mountIsland>[0], 'el' | 'worker'>,
) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return mountIsland({ el, worker: createInProcessWorker(def), ...opts });
};

// --- test island apps -----------------------------------------------------------

@Component()
class CounterIsland extends View<{ start?: number; label?: string }> {
  count = signal(this.props.start ?? 0);
  render() {
    return (
      <div class="card">
        <h3>{this.props.label ?? 'counter'}</h3>
        <button
          class="inc"
          onClick={() => {
            this.count.value++;
            if (this.count.value === 5) emit('five', { count: this.count.value });
          }}
        >
          count {this.count.value}
        </button>
      </div>
    );
  }
}

// Module-level signal: in-process sharing lets the test poke worker-side state.
const tick = signal(0);

@Component()
class TickerIsland extends View {
  render() {
    return <p class="tick">tick {tick.value}</p>;
  }
}

@Injectable()
class IslandGreeter {
  hi(n: string) {
    return `hello ${n}`;
  }
}

@Component({ providers: [IslandGreeter] })
class GreetIsland extends View<{ name?: string }> {
  private g = inject(IslandGreeter);
  render() {
    return <p class="greet">{this.g.hi(this.props.name ?? '?')}</p>;
  }
}

let def: IslandWorkerDef;
beforeEach(() => {
  def = defineViewPolyWorker({
    apps: {
      counter: CounterIsland,
      ticker: TickerIsland,
      greet: GreetIsland,
      stamp: {
        imperative: (doc, props) => {
          const d = doc.createElement('div');
          d.className = 'stamp';
          d.textContent = `imperative: ${props.msg}`;
          doc.body.appendChild(d);
        },
      },
    },
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('islands', () => {
  it('mounts a View island — proxy DOM ops replay to real DOM', async () => {
    const island = await mountInto(def, { app: 'counter', props: { start: 2 } });
    expect(island.instance).toBe('counter@' + island.instance.split('@')[1]);
    expect(island.pid).toMatch(/^w-/);
    const btn = document.querySelector('.inc')!;
    expect(btn.textContent).toBe('count 2');
    island.destroy();
  });

  it('dispatches real events back to the worker (click → re-render)', async () => {
    const island = await mountInto(def, { app: 'counter' });
    const btn = document.querySelector('.inc')! as HTMLButtonElement;
    fireEvent.click(btn);
    await flush();
    expect(btn.textContent).toBe('count 1');
    island.destroy();
  });

  it('emit() lands in onEvent', async () => {
    const events: [string, unknown][] = [];
    const island = await mountInto(def, {
      app: 'counter',
      props: { start: 4 },
      onEvent: (n, p) => events.push([n, p]),
    });
    fireEvent.click(document.querySelector('.inc')!);
    await flush();
    expect(events).toEqual([['five', { count: 5 }]]);
    island.destroy();
  });

  it('updateProps re-renders the root with new props', async () => {
    const island = await mountInto(def, { app: 'counter', props: { label: 'a' } });
    expect(document.querySelector('h3')!.textContent).toBe('a');
    island.updateProps({ label: 'b' });
    await flush();
    expect(document.querySelector('h3')!.textContent).toBe('b');
    island.destroy();
  });

  it('out-of-task signal writes push ops without a task call', async () => {
    const island = await mountInto(def, { app: 'ticker' });
    expect(document.querySelector('.tick')!.textContent).toBe('tick 0');
    tick.value = 7;
    await flush();
    expect(document.querySelector('.tick')!.textContent).toBe('tick 7');
    island.destroy();
  });

  it('island-side DI: component providers resolve in the worker scope', async () => {
    const island = await mountInto(def, { app: 'greet', props: { name: 'island' } });
    expect(document.querySelector('.greet')!.textContent).toBe('hello island');
    island.destroy();
  });

  it('imperative apps render via the proxy DOM and rebuild on updateProps', async () => {
    const island = await mountInto(def, {
      app: 'stamp',
      props: { msg: 'one' },
    });
    expect(document.querySelector('.stamp')!.textContent).toBe('imperative: one');
    island.updateProps({ msg: 'two' });
    await flush();
    expect(document.querySelector('.stamp')!.textContent).toBe('imperative: two');
    island.destroy();
  });

  it('callbackProp: worker code can invoke a shell function', async () => {
    const done: unknown[] = [];
    const d2 = definePolyWorker({
      apps: {
        caller: {
          imperative: (doc, props) => {
            const b = doc.createElement('button');
            b.textContent = 'call';
            doc.body.appendChild(b);
            (props.onDone as (...a: unknown[]) => void)(42);
          },
        },
      },
    });
    const island = await mountInto(d2, {
      app: 'caller',
      props: { onDone: callbackProp((n: number) => done.push(n)) },
    });
    await flush();
    expect(done).toEqual([42]);
    island.destroy();
  });

  it('several islands share one client — distinct instances, one worker', async () => {
    const client = connectIslandWorker({ worker: createInProcessWorker(def) });
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    document.body.append(elA, elB);
    const a = await mountIsland({ el: elA, client, app: 'counter', props: { start: 1 } });
    const b = await mountIsland({ el: elB, client, app: 'counter', props: { start: 9 } });
    expect(a.instance).not.toBe(b.instance);
    expect(elA.querySelector('.inc')!.textContent).toBe('count 1');
    expect(elB.querySelector('.inc')!.textContent).toBe('count 9');
    // updating one doesn't touch the other
    fireEvent.click(elA.querySelector('.inc')!);
    await flush();
    expect(elA.querySelector('.inc')!.textContent).toBe('count 2');
    expect(elB.querySelector('.inc')!.textContent).toBe('count 9');
    a.destroy();
    b.destroy();
  });

  it('mono worker resolves its sole app regardless of the mount name', async () => {
    const mono = defineViewMonoWorker(CounterIsland);
    const island = await mountInto(mono, { props: { start: 3 } });
    expect(document.querySelector('.inc')!.textContent).toBe('count 3');
    island.destroy();
  });

  it('unknown app rejects the mount with a named error', async () => {
    await expect(mountInto(def, { app: 'nope' })).rejects.toThrow(/unknown app "nope/);
  });

  it('a bare function prop is rejected — wrap it in callbackProp', async () => {
    await expect(
      mountInto(def, { app: 'counter', props: { cb: (() => {}) as unknown as never } }),
    ).rejects.toThrow(/callbackProp/);
  });

  it('destroy tears the instance down — further updates are no-ops', async () => {
    const island = await mountInto(def, { app: 'counter' });
    island.destroy();
    await flush();
    island.updateProps({ start: 99 });
    await flush();
    expect(document.querySelector('.inc')).toBeNull();
  });

  it('stamped app references resolve to their wire key', async () => {
    const stamped = viewIsland('counter', CounterIsland);
    const d2 = defineViewPolyWorker({ apps: { counter: stamped } });
    const island = await mountInto(d2, { app: stamped, props: { start: 6 } });
    expect(island.app).toBe('counter');
    expect(document.querySelector('.inc')!.textContent).toBe('count 6');
    island.destroy();
  });

  it('<Island/> component mounts and updates inside framework render', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onEvent = () => {};
    await act(async () => {
      render(
        <Island
          worker={createInProcessWorker(def)}
          app="counter"
          props={{ start: 4 }}
          onEvent={onEvent}
        />,
        container,
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    const btn = container.querySelector('.inc')! as HTMLButtonElement;
    expect(btn.textContent).toBe('count 4');
    fireEvent.click(btn);
    await flush();
    expect(container.querySelector('.inc')!.textContent).toBe('count 5');
    render(null, container);
  });
});
