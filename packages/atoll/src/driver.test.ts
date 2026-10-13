/**
 * driver.ts — the facade's own logic: worker-entry normalization and the
 * unresolvable-app early reject (the rest rides @atolljs/islands and is
 * covered end-to-end through the islands suite in atoll-island).
 */
import { describe, it, expect } from 'vitest';
import { mountIsland } from './driver';

describe('mountIsland', () => {
  it('rejects early when the app reference resolves to no name', async () => {
    const el = document.createElement('div');
    // A bare object has no registry key, no stamp, no imperative fn —
    // islandAppNameOf comes back undefined and the mount never touches
    // the worker.
    const fakeWorker = {
      postMessage: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      terminate: () => {},
    };
    await expect(
      mountIsland({ el, worker: fakeWorker, app: {} }),
    ).rejects.toThrow(/could not resolve an app name/);
  });
});
