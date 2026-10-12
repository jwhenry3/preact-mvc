/**
 * Cross-thread query cache sync. TanStack's v4 broadcastQueryClient
 * plugin was removed in v5 (persist-client-core takes a generic
 * AsyncStorage, not a channel), so this recreates the same idea by hand:
 * queryCache events -> dehydrate -> BroadcastChannel -> hydrate on every
 * other context. BroadcastChannel natively spans the main thread and
 * workers on one origin, so no island plumbing is needed for the cache.
 *
 * The `hydrating` flag breaks the echo loop: hydrate() fires cache
 * events, which the subscriber would otherwise rebroadcast forever.
 * BroadcastChannel never delivers a message to its sender, so the flag
 * is only needed on the receive path.
 *
 * Call once per QueryClient (shell AND worker). Returns teardown.
 */
import {
  QueryClient,
  dehydrate,
  hydrate,
  type DehydratedState,
} from '@tanstack/preact-query';

let seq = 0;

export function syncQueryClient(
  client: QueryClient,
  channelName = 'enterprise-query-sync',
): () => void {
  const origin = `ctx-${Date.now()}-${seq++}`;
  const channel = new BroadcastChannel(channelName);
  let hydrating = false;

  channel.onmessage = (e: MessageEvent) => {
    const msg = e.data as { origin?: string; type?: string; state?: DehydratedState };
    if (msg?.type !== 'query-cache' || msg.origin === origin || !msg.state) return;
    hydrating = true;
    try {
      hydrate(client, msg.state);
    } finally {
      hydrating = false;
    }
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (hydrating) return;
    if (event.type !== 'updated' && event.type !== 'added' && event.type !== 'removed') {
      return;
    }
    channel.postMessage({ type: 'query-cache', origin, state: dehydrate(client) });
  });

  return () => {
    unsubscribe();
    channel.close();
  };
}
