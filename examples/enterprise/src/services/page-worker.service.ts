import { Injectable, inject, DestroyRef } from '@preact-mvc/core';
import { connectIslandWorker, type IslandClient } from '@preact-mvc/atoll-island';

/**
 * The worker host for worker-rendered routed pages (users, settings,
 * components): one dedicated worker + client PER PAGE. `clientFor(app)`
 * lazily connects the page's worker on first navigation and keeps it
 * alive for the session — the page's worker-side caches survive route
 * swaps, and a heavy page can't stall a sibling's renders because they
 * live on separate threads. Every client terminates with the app scope.
 *
 * The dashboard is not here: it is the main-thread page whose chart and
 * ticker islands own their dedicated workers (chart.worker, ticker.worker).
 *
 * The URL literals inside new Worker(...) stay bundler-detectable — do
 * not hoist or compute them.
 */
@Injectable()
export class PageWorkerHost {
  private destroyRef = inject(DestroyRef);

  private readonly factories: Record<string, () => Worker> = {
    users: () =>
      new Worker(new URL('../workers/users.worker.tsx', import.meta.url), {
        type: 'module',
      }),
    settings: () =>
      new Worker(new URL('../workers/settings.worker.tsx', import.meta.url), {
        type: 'module',
      }),
    components: () =>
      new Worker(new URL('../workers/components.worker.tsx', import.meta.url), {
        type: 'module',
      }),
  };

  private readonly clients = new Map<string, IslandClient>();

  clientFor(app: string): IslandClient {
    let client = this.clients.get(app);
    if (!client) {
      const factory = this.factories[app];
      if (!factory) throw new Error(`PageWorkerHost: no worker for app "${app}"`);
      client = connectIslandWorker({ worker: factory });
      this.clients.set(app, client);
    }
    return client;
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const client of this.clients.values()) client.terminate();
      this.clients.clear();
    });
  }
}
