import { CodeBlock, CodeSideContext } from '../components/CodeBlock';
import { docHref } from '../link';

export function IslandShell() {
  return (
    <CodeSideContext.Provider value="shell">
      <article>
        <h1>Shell &amp; mounting</h1>
        <p class="lead">
          The shell side is <code>@preact-mvc/atoll-island</code> (the package
          root): mount an island as an element, pass props and callbacks,
          receive events. Three mounting surfaces cover the common cases.
        </p>

        <h2>&lt;Island&gt; — the primitive</h2>
        <CodeBlock
          language="tsx"
          code={`import { Island } from '@preact-mvc/atoll-island';
import type { WorkerLike } from '@preact-mvc/atoll-island';

const tickerWorker = (): WorkerLike =>
  new Worker(new URL('./ticker.worker.tsx', import.meta.url), {
    type: 'module',
  }) as WorkerLike;

<Island
  app="ticker"                    // registry key or stamped viewIsland ref
  worker={tickerWorker}           // this mount OWNS the worker
  props={{ source: 'orders' }}    // structured-cloneable
  onEvent={(name, payload) => log(name, payload)}
  className="metric-card"
  style={{ minHeight: '3rem' }}
/>`}
        />
        <p>
          <code>worker</code> accepts a <code>WorkerLike</code> directly or a
          factory — use the factory form in real code so Vite detects the
          entry. Unmounting the element terminates an owned worker.
        </p>

        <h2>Shared workers: one client, many islands</h2>
        <p>
          A poly worker can host several islands at once — connect once, hand
          the client to each mount:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { connectIslandWorker, Island } from '@preact-mvc/atoll-island';

const client = connectIslandWorker({
  worker: () =>
    new Worker(new URL('./dash.worker.tsx', import.meta.url), {
      type: 'module',
    }) as WorkerLike,
});

// Each mount is an isolated instance inside the shared worker:
<Island client={client} app="ticker" props={{ source: 'orders' }} />
<Island client={client} app="ticker" props={{ source: 'payments' }} />
<Island client={client} app="metrics" />`}
        />
        <p>
          Instances are keyed <code>app@N</code> in the worker — separate
          view trees, separate state, separate props, one worker process.
        </p>

        <h2>islandComponent — a facade component</h2>
        <CodeBlock
          language="tsx"
          code={`import { islandComponent } from '@preact-mvc/atoll-island';
import { tickerApp } from './ticker.worker';   // import type only — see note

const Ticker = islandComponent(tickerApp);

// Used like any component; extra props become island props:
<Ticker client={client} source="orders" refreshMs={500} />`}
        />
        <blockquote>
          <p>
            Import the stamped app with <code>import type</code> in shell code
            — the worker definition itself must never leak into the
            main-thread bundle.
          </p>
        </blockquote>

        <h2>lazyIsland — code-split islands</h2>
        <CodeBlock
          language="tsx"
          code={`const HeavyChart = lazyIsland(() => import('./heavy-chart.app'));

// The app module loads on first mount; the worker entry stays separate.
<HeavyChart client={client} dataset="q4" />`}
        />

        <h2>Imperative: mountIsland</h2>
        <p>
          For non-JSX integration (a portal, a vanilla container, tests),{' '}
          <code>mountIsland</code> attaches to any element and returns a
          handle:
        </p>
        <CodeBlock
          language="tsx"
          code={`const handle = await mountIsland({
  el,
  worker: tickerWorker,
  app: 'ticker',
  props: { source: 'orders' },
  onEvent: (name, p) => console.log(name, p),
});

handle.updateProps({ source: 'payments' }); // re-render with new props
handle.destroy();                            // teardown + worker cleanup`}
        />

        <h2>Events back to the shell</h2>
        <p>
          Everything the worker <code>emit()</code>s arrives at{' '}
          <code>onEvent(name, payload)</code>; shell functions cross in the
          other direction via <code>callbackProp</code> — details in{' '}
          <a href={docHref('island-apps')}>Island apps</a>. Instance scoping
          and the op wire are in{' '}
          <a href={docHref('island-protocol')}>How it works</a>.
        </p>
      </article>
    </CodeSideContext.Provider>
  );
}
