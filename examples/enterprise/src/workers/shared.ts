/**
 * Shared worker-side provider spine for the per-page workers. Each page
 * worker gets its own FakeApi + QueryClient — separate instances, so a
 * heavy page can't stall a sibling's renders. BroadcastChannel keeps the
 * caches hydrated across all contexts (shell included), so the shell
 * observer sees whichever worker produced the data.
 *
 * ThemeService stays on the main thread — it needs document/matchMedia —
 * and arrives as props.
 */
import { QueryClient } from '@tanstack/preact-query';
import { syncQueryClient } from '@/lib/broadcast-query';
import { FakeApi } from '@/services/fake-api.service';

export function pageProviders(): [typeof FakeApi, { provide: typeof QueryClient; useValue: QueryClient }] {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  syncQueryClient(qc);
  return [FakeApi, { provide: QueryClient, useValue: qc }];
}
