import { Component, View, signal } from '@preact-mvc/core';
import { Island, connectIslandWorker, islandComponent, type IslandClient } from '@preact-mvc/atoll-island';
import type { WorkerLike } from '@preact-mvc/atoll-island';

// Bundler-detectable worker entry — the literal `new URL(...import.meta.url)`
// is what Vite detects; never hoist or compute it.
const islandEntry = (): WorkerLike =>
  new Worker(new URL('./demo.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike;

// A typed facade — props flow straight through as island props.
const Counter = islandComponent<{ start?: number; label?: string }>('counter');

// Standalone route view — mounts worker-rendered islands like Angular's
// <atoll-island> or React's <Island/> bindings.
@Component()
export class IslandDemoView extends View {
  private events = signal<string[]>([]);
  private spawnCount = signal(0);
  // One shared worker hosting several instances — spawned lazily on first
  // render, terminated on view destroy.
  private shared: IslandClient | undefined;

  private log(name: string, payload: unknown) {
    this.events.value = [...this.events.value, `${name}: ${JSON.stringify(payload)}`];
  }

  private getShared(): IslandClient {
    return (this.shared ??= connectIslandWorker({ worker: islandEntry }));
  }

  onDestroy() {
    this.shared?.terminate();
  }

  spawnAnother = () => {
    this.spawnCount.value++;
  };

  render() {
    return (
      <section>
        <h2>Worker islands</h2>
        <p class="muted">
          Each card below renders inside a Web Worker against a proxy DOM; commits stream
          back as ops and replay onto real DOM. Clicks round-trip as dispatch tasks.
        </p>
        <div class="island-row">
          {/* Owns its worker — spawned for this mount, terminated on destroy. */}
          <Counter
            worker={islandEntry}
            props={{ start: 0, label: 'Own worker' }}
            onEvent={(n, p) => this.log(n, p)}
          />
          {/* Shared client — one worker, two instances (counter + clock). */}
          <Counter
            client={this.getShared()}
            props={{ start: 40, label: 'Shared worker' }}
            onEvent={(n, p) => this.log(n, p)}
          />
          <Island client={this.getShared()} app="clock" />
          {Array.from({ length: this.spawnCount.value }, (_, i) => (
            <Counter
              key={`spawn-${i}`}
              client={this.getShared()}
              props={{ start: 100 * (i + 1), label: `Spawned #${i + 1}` }}
              onEvent={(n, p) => this.log(n, p)}
            />
          ))}
        </div>
        <button onClick={this.spawnAnother}>Add island to shared worker</button>
        <div class="island-events">
          <h3>emit() events</h3>
          <ul>
            {this.events.value.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
}
