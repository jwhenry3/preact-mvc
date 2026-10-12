import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function Islands() {
  return (
    <article>
      <h1>Islands</h1>
      <p class="lead">
        Worker-rendered UI islands: real preact-mvc view trees — View classes,
        signals, DI, lifecycle — running inside a Web Worker, streamed to the
        shell DOM over a serialized op protocol. The main thread stays free;
        the island looks and behaves like an ordinary element.
      </p>

      <h2>The shape</h2>
      <CodeBlock
        language="plaintext"
        code={`shell thread                          worker thread
┌────────────────────────┐ postMessage  ┌─────────────────────────┐
│ <Island app="ticker"   │ ◀──────────  │ ProxyDocument — the     │
│   worker={entry}/>     │   ops        │ only "DOM" a worker sees│
│        │               │              │        │                │
│   driver.ts — replays  │  events ───▶ │  Preact render of the   │
│   ops onto real DOM    │              │  island's view tree     │
└────────────────────────┘              └─────────────────────────┘`}
      />
      <p>
        Two threads, two halves of the package:{' '}
        <code>@preact-mvc/atoll-island</code> is the shell surface,{' '}
        <code>@preact-mvc/atoll-island/worker</code> is the worker entry. The
        underlying engine (<code>@preact-mvc/atoll</code>) is framework-free —
        this binding is what knows how to render View classes.
      </p>

      <h2>Sixty seconds of it working</h2>
      <CodeBlock
        file="ticker.worker.tsx"
        language="tsx"
        side="worker"
        code={`import { Component, View, signal } from '@preact-mvc/core';
import { defineViewPolyWorker, emit } from '@preact-mvc/atoll-island/worker';

@Component()
export class TickerIsland extends View {
  private ticks = signal(0);
  onInit() {
    setInterval(() => this.ticks.value++, 1000);  // out-of-task pushes
  }
  render() {
    return (
      <button onClick={() => emit('ping', { ticks: this.ticks.value })}>
        ticks: {this.ticks.value}
      </button>
    );
  }
}

export const worker = defineViewPolyWorker({ apps: { ticker: TickerIsland } });`}
      />
      <CodeBlock
        file="dashboard.view.tsx"
        language="tsx"
        side="shell"
        code={`import { Island } from '@preact-mvc/atoll-island';
import type { WorkerLike } from '@preact-mvc/atoll-island';

// Literal new URL — Vite must see it to emit the worker bundle.
const tickerWorker = (): WorkerLike =>
  new Worker(new URL('../workers/ticker.worker.tsx', import.meta.url), {
    type: 'module',
  }) as WorkerLike;

// inside a view's render():
<Island
  app="ticker"
  worker={tickerWorker}
  onEvent={(name, payload) => console.log('island says', name, payload)}
/>`}
      />
      <p>
        The button ticks once a second <em>in the worker</em> — each signal
        write re-renders there and ships an op batch; clicking it emits{' '}
        <code>ping</code> back to the shell's <code>onEvent</code>. The shell
        never coordinates any of it.
      </p>

      <h2>What an island is good for</h2>
      <ul>
        <li>
          <strong>Continuous or heavy renderers</strong> — tickers, log
          tailers, live charts: work that would jank the shell runs
          off-thread entirely.
        </li>
        <li>
          <strong>Isolation boundaries</strong> — an untrusted or crash-prone
          subtree can't take down the shell; terminating the worker is a
          clean kill.
        </li>
        <li>
          <strong>Micro-frontends</strong> — a worker entry can host several
          island apps (<code>defineViewPolyWorker</code>), one worker serving
          many independently-propped instances.
        </li>
      </ul>

      <h2>Honest constraints</h2>
      <ul>
        <li>
          The wire is <code>postMessage</code>/<code>structuredClone</code>:
          props and event payloads must be cloneable; functions cross only as{' '}
          <code>callbackProp</code> markers.
        </li>
        <li>
          The worker is DOM-free: no <code>document</code>, no canvas
          interop, no layout queries — the proxy DOM only knows how to
          serialize mutations.
        </li>
        <li>
          Styling the island contents is the worker app's own job (inline
          styles or a stylesheet op) — shell CSS doesn't cross the boundary.
        </li>
      </ul>

      <p>
        Next: <a href={docHref('island-apps')}>writing island apps</a>,{' '}
        <a href={docHref('island-shell')}>mounting from the shell</a>, or{' '}
        <a href={docHref('island-protocol')}>how the protocol works</a>.
      </p>
    </article>
  );
}
