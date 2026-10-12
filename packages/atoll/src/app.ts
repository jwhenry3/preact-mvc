/**
 * Component-reference app handles — kept worker-free (like Atoll's
 * `src/app.ts`) so the shell bundle can resolve app references without
 * importing the proxy DOM / worker runtime.
 *
 * `islandApp(name, app)` stamps an app with its registry name so the shell
 * can mount by reference — `app={CounterApp}` resolves to the wire key
 * 'counter'. A data stamp, not `fn.name`: bundlers mangle names in
 * production builds.
 */

const ISLAND_APP_NAME = 'islandAppName';

export const islandApp = <A>(name: string, app: A): A & { readonly islandAppName: string } => {
  (app as Record<string, unknown>)[ISLAND_APP_NAME] = name;
  return app as A & { readonly islandAppName: string };
};

/** Resolve a mountable app reference to its wire name: string → itself;
 *  stamped app → its stamp; otherwise displayName/function name (dev-mode
 *  convenience — the stamp exists because minification may strip it). */
export const islandAppNameOf = (app: unknown): string | undefined => {
  if (typeof app === 'string') return app === '' ? undefined : app;
  if (app === null || (typeof app !== 'function' && typeof app !== 'object')) return undefined;
  const stamped = (app as Record<string, unknown>)[ISLAND_APP_NAME];
  if (typeof stamped === 'string' && stamped !== '') return stamped;
  if (typeof app === 'function') {
    const n = app as { displayName?: string; name?: string };
    return n.displayName ?? (n.name !== '' ? n.name : undefined);
  }
  const imp = (app as { imperative?: unknown }).imperative;
  if (typeof imp === 'function') {
    const s = (imp as unknown as Record<string, unknown>)[ISLAND_APP_NAME];
    if (typeof s === 'string' && s !== '') return s;
    return imp.name !== '' ? imp.name : undefined;
  }
  return undefined;
};
