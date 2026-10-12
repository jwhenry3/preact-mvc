/**
 * The shell surface — our `*-island` package's main-thread half
 * (docs/atoll/islands-frameworks.md): mount a worker-hosted tree as an
 * ordinary element in a framework app.
 *
 *   <Island worker={entry} app="counter" props={{ start: 5 }}
 *           onEvent={(name, p) => ...} />
 *
 *   const Counter = islandComponent(counterContract);   // the facade:
 *   <Counter start={5} onEvent={...} />                 // no worker prop —
 *                                                        the contract carries it
 *
 *   const Lazy = lazyIsland(() => import('./counter.contract'));
 *
 * These are plain function components — hooks are legal here (only `View`
 * classes forbid them). `worker`/`client`/`app` are mount identity: change
 * them with a `key`.
 */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, FunctionComponent } from 'preact';
import {
  connectIslandWorker,
  contractWorkerOf,
  islandAppNameOf,
  isIslandContract,
  mountIsland,
} from '@preact-mvc/atoll';
import type {
  IslandAppProps,
  IslandClient,
  IslandContract,
  IslandContractEventHandler,
  IslandContractProps,
  IslandHandle,
  IslandWorkerOptions,
  Mode,
  WorkerLike,
} from '@preact-mvc/atoll';

/** Props consumed by a proxy component itself — everything else forwards to
 *  the island as its props. */
export interface IslandShellProps {
  /** Bundler-detectable factory `() => new Worker(new URL(...))` (or a URL
   *  / spawned worker). Optional when `app` is a contract carrying its own
   *  worker — the contract module is then the whole connection. */
  worker?: WorkerLike | (() => WorkerLike) | URL;
  /** A shared `connectIslandWorker` client — this mount adds an instance. */
  client?: IslandClient;
  /** Client options for `worker`-shorthand mounts (taskTimeout, respawn,
   *  lazy, doorbell). `doorbell: true` needs cross-origin isolation. */
  workerOptions?: IslandWorkerOptions & { doorbell?: boolean };
  /** 'push' rides the doorbell SAB (COOP/COEP); 'poll' (default) is
   *  message-only — no headers needed. */
  mode?: Mode;
  /** Devtools renderer tag. */
  framework?: string;
  /** Receives every worker-side `emit(name, payload)`. */
  onEvent?: (name: string, payload: unknown) => void;
  /** Fired after each applied op batch. */
  onActivity?: () => void;
  /** The mounted handle (pid, updateProps, flush, setMode…) once ready. */
  onReady?: (island: IslandHandle) => void;
  /** Mount/update errors surface here instead of an unhandled rejection. */
  onError?: (err: unknown) => void;
  /** `data-atoll-slot` transclusion holes: worker owns the box, shell owns
   *  the contents. */
  slots?: Record<string, (el: HTMLElement | null) => void>;
  /** Rendered while the worker mounts (lazy facades). */
  fallback?: ComponentChildren;
  className?: string;
  style?: string | Record<string, string | number>;
  mountTimeout?: number;
  children?: ComponentChildren; // reserved for future slot sugar
}

export interface IslandProps extends IslandShellProps {
  /** Registry key, stamped app (`islandApp`/`viewIsland`), or contract —
   *  resolved through `islandAppNameOf`. */
  app?: unknown;
  /** Structured-cloneable props (functions via `callbackProp`). */
  props?: Record<string, unknown>;
}

export const Island: FunctionComponent<IslandProps> = (p) => {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<IslandHandle | null>(null);
  const [failed, setFailed] = useState<Error | null>(null);

  // 'main' mounts a mono worker's sole app namelessly; registries error
  // with the key list if 'main' isn't a real key.
  const appName = p.app === undefined ? 'main' : islandAppNameOf(p.app);

  // Mount once per app — worker/client/app are identity; change via `key`.
  useEffect(() => {
    if (appName === undefined) {
      setFailed(
        new Error(
          '<Island> could not resolve an app name — pass the registry key ' +
            'or stamp the app with islandApp(name, app)',
        ),
      );
      return;
    }
    const mode = p.mode ?? 'poll';
    // A contract `app` can carry its own worker factory — the contract
    // module is then the whole connection, call sites pass no worker.
    const resolvedWorker = p.worker ?? contractWorkerOf(p.app);
    const client =
      p.client ??
      (resolvedWorker !== undefined
        ? connectIslandWorker({
            name: appName,
            worker: resolvedWorker,
            doorbell: mode !== 'poll',
            ...p.workerOptions,
          })
        : undefined);
    if (client === undefined) {
      setFailed(new Error('<Island> requires either `worker`, `client`, or a contract carrying `worker`'));
      return;
    }
    let cancelled = false;
    mountIsland({
      el: ref.current!,
      client,
      app: appName,
      props: p.props,
      onEvent: p.onEvent,
      onActivity: p.onActivity,
      slots: p.slots,
      mode,
      framework: p.framework,
      mountTimeout: p.mountTimeout,
    })
      .then((h) => {
        if (cancelled) h.destroy();
        else {
          handle.current = h;
          p.onReady?.(h);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (p.onError) p.onError(err);
        else setFailed(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, p.client]);

  // Prop updates flow through the handle — deduped by wire-serialized
  // identity; a repeat send would be a wasted round-trip.
  const propsJson = JSON.stringify(p.props ?? {});
  useEffect(() => {
    handle.current?.updateProps(p.props ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsJson]);

  if (failed) {
    return (
      <div class="island-error" style={{ border: '1px solid #c00', padding: '0.5em' }}>
        Island mount failed: {failed.message}
      </div>
    );
  }
  return <div ref={ref} class={p.className} style={p.style as string} />;
};

/** What `app` accepts on a facade: the registry name, or a reference to
 *  resolve (component, stamped app, contract). */
export type IslandAppRef<A> = A | string;

export type IslandFacadeProps<A> = Omit<IslandShellProps, 'onEvent'> &
  IslandAppProps<A> & {
    props?: Record<string, unknown>;
    onEvent?: (name: string, payload: unknown) => void;
  };

/** Props consumed by a facade component itself — everything else forwards
 *  to the island as its props. */
const SHELL_PROP_KEYS: ReadonlySet<string> = new Set([
  'worker',
  'client',
  'workerOptions',
  'mode',
  'framework',
  'onEvent',
  'onActivity',
  'onReady',
  'onError',
  'slots',
  'fallback',
  'className',
  'style',
  'mountTimeout',
  'children',
]);

const splitProxyProps = (
  raw: Record<string, unknown>,
): { shell: IslandShellProps; islandProps: Record<string, unknown> } => {
  const shell: Record<string, unknown> = {};
  const islandProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SHELL_PROP_KEYS.has(key)) shell[key] = value;
    else islandProps[key] = value;
  }
  return { shell: shell as IslandShellProps, islandProps };
};

/**
 * `islandComponent(contract)` — the cross-framework facade: the component's
 * props are the island's props (from the contract's schema), `onEvent`
 * narrows to the declared event vocabulary, and the contract's own worker
 * factory means call sites pass NO worker/client at all. The shell imports
 * the contract module only — never the worker entry or the island's code.
 *
 * `islandComponent<P>('charts')` — the string-keyed form for registries
 * whose workers the shell already knows.
 */
export function islandComponent<C extends IslandContract>(
  app: C,
): FunctionComponent<
  IslandContractProps<C> &
    Omit<IslandShellProps, 'onEvent'> & {
      props?: Record<string, unknown>;
      onEvent?: IslandContractEventHandler<C>;
    }
>;
export function islandComponent<A>(app: A | string): FunctionComponent<IslandFacadeProps<A>>;
export function islandComponent(app: unknown): FunctionComponent<Record<string, unknown>> {
  const Facade: FunctionComponent<Record<string, unknown>> = ({ props, ...raw }) => {
    const { shell, islandProps } = splitProxyProps(raw as Record<string, unknown>);
    return <Island app={app} props={{ ...islandProps, ...(props ?? {}) }} {...shell} />;
  };
  Facade.displayName = `Island(${islandAppNameOf(app) ?? 'main'})`;
  return Facade as FunctionComponent<Record<string, unknown>>;
}

/**
 * `lazyIsland(() => import('./counter.contract'))` — the module must export
 * a contract (`defineIslandContract` — app + worker factory in one object),
 * a stamped app (`viewIsland('counter', CounterView)`), or a default export
 * resolvable by `islandAppNameOf`. A contract's own worker factory is used
 * when no `worker` prop is passed.
 */
export function lazyIsland<A>(
  load: () => Promise<Record<string, unknown>>,
): FunctionComponent<IslandFacadeProps<A>> {
  const Lazy: FunctionComponent<IslandFacadeProps<A>> = (p) => {
    const [app, setApp] = useState<unknown>(null);
    useEffect(() => {
      let live = true;
      void load().then((mod) => {
        if (!live) return;
        const unwrapped = 'default' in mod ? mod.default : mod;
        const resolved =
          isIslandContract(unwrapped) ? unwrapped
          : Object.values(mod).find((v) => isIslandContract(v)) ??
            Object.values(mod).find(
              (v) => v && typeof v === 'object' && 'islandAppName' in v,
            ) ??
            unwrapped;
        setApp(() => resolved);
      });
      return () => {
        live = false;
      };
    }, []);
    if (!app)
      return <div class={p.className} style={p.style as string}>{p.fallback}</div>;
    return <Island {...(p as IslandProps)} app={app} />;
  };
  return Lazy;
}
