// Re-export the signal primitives. Importing through here guarantees the
// @preact/signals integration (auto re-render on .value read during render)
// is installed before any view uses it.
import { effect as preactEffect } from '@preact/signals';
import { getCurrentInjector } from './injector';

export { signal, computed, batch, untracked } from '@preact/signals';
export type { Signal, ReadonlySignal } from '@preact/signals';

// Scope-bound effect: created during a class's construction (field
// initializers or constructor body), it registers on that scope's injector
// and is disposed automatically when the scope is deactivated — Angular's
// DestroyRef semantics. Outside an injection context it's the raw primitive:
// call the returned disposer yourself.
export function effect(fn: Parameters<typeof preactEffect>[0]): () => void {
  const dispose = preactEffect(fn);
  getCurrentInjector()?.registerCleanup(dispose);
  return dispose;
}
