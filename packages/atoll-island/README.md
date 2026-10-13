# @preact-mvc/atoll-island

[![CI](https://github.com/jwhenry3/preact-mvc/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jwhenry3/preact-mvc/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jwhenry3/preact-mvc/graph/badge.svg?branch=main)](https://codecov.io/gh/jwhenry3/preact-mvc)
[![Socket Badge](https://badge.socket.dev/npm/package/@preact-mvc/atoll-island)](https://badge.socket.dev/npm/package/@preact-mvc/atoll-island)

The PreactMVC adapter for `@preact-mvc/atoll` worker islands — the
`*-island` half of the angular/react vs `*-island` pattern. On the shell,
`islandComponent(contract)` turns a shared contract into a mountable
component. In the worker, `viewIslandApp` + `defineViewPolyWorker` render
`View` classes (or any component) against the proxy DOM, so island views
get the same DI, modules, lifecycle, and signals as main-thread views.

**[PreactMVC — island documentation](https://jwhenry3.github.io/preact-mvc/docs/island-apps/)**

## Install

```bash
npm install @preact-mvc/atoll-island @preact-mvc/core @preact-mvc/atoll
```

## Contract → component → island

```ts
// islands/ticker.contract.ts — imported by BOTH sides
import { defineIslandContract, z } from '@preact-mvc/atoll-island';

export const tickerContract = defineIslandContract({
  app: 'ticker',
  events: { 'worker-ping': z.object({ count: z.number() }) },
  worker: () =>
    new Worker(new URL('../workers/ticker.worker.tsx', import.meta.url), {
      type: 'module',
    }),
});
```

```tsx
// workers/ticker.worker.tsx — the worker entry
import { Component, View, signal } from '@preact-mvc/core';
import { defineViewPolyWorker, viewIslandApp } from '@preact-mvc/atoll-island/worker';
import { tickerContract } from '../islands/ticker.contract';

@Component()
class TickerIsland extends View {
  /* signals, inject(), lifecycle — same as main thread */
}

export const worker = defineViewPolyWorker({
  apps: { ticker: viewIslandApp(TickerIsland, { contract: tickerContract }) },
});
```

```tsx
// views/demo.view.tsx — the shell mount
import { islandComponent } from '@preact-mvc/atoll-island';
import { tickerContract } from '../islands/ticker.contract';

const TickerIsland = islandComponent(tickerContract);
// <TickerIsland onEvent={(e) => …} />
```

## Shell surface

- `<Island/>` — low-level mount element (driver + options by hand).
- `islandComponent(contract | app)` — the typed facade; props/emit/events
  flow through the contract.
- `lazyIsland(loader)` — code-split a contract's mount.
- `viewIsland(App)` — mount a single component as a one-off island.

## Worker surface (`@preact-mvc/atoll-island/worker`)

- `viewIslandApp(Component, { contract })` — the worker renderer: views
  render against the proxy DOM, every mutation serializing to ops.
- `defineViewPolyWorker({ apps })` — one worker hosting many islands;
  `defineViewMonoWorker` for a dedicated single app.

Published builds ship compiled `dist/` (`.js` + `.d.ts`).
