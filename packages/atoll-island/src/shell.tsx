/**
 * The shell surface — our `*-island` package's main-thread half
 * (docs/atoll/islands-frameworks.md): mount a worker-hosted tree as an
 * ordinary element in a framework app.
 *
 *   <Island worker={entry} app="counter" props={{ start: 5 }}
 *           onEvent={(name, p) => ...} />
 *
 *   const Counter = islandComponent('counter');
 *   <Counter worker={entry} start={5} onEvent={...} />
 *
 *   const Lazy = lazyIsland(() => import('./counter.app'));
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
  mountIsland,
  type IslandClient,
  type IslandHandle,
  type IslandAppProps,
  type WorkerLike,
} from '@preact-mvc/atoll';

export interface IslandShellProps {
  /** The worker (this mount OWNS it) — a `WorkerLike`, or the
   *  bundler-detectable factory `() => new Worker(new URL(...))`. */
  worker?: WorkerLike | (() => WorkerLike);
  /** A shared `connectIslandWorker` client — this mount adds an instance. */
  client?: IslandClient;
  /** Registry key or a stamped app reference (`islandApp`/`viewIsland`). */
  app: unknown;
  /** Structured-cloneable props (functions via `callbackProp`). */
  props?: Record<string, unknown>;
  /** Receives every worker-side `emit(name, payload)`. */
  onEvent?: (name: string, payload: unknown) => void;
  /** `data-atoll-slot` transclusion holes: worker owns the box, shell owns
   *  the contents. */
  slots?: Record<string, (el: Element | null) => void>;
  className?: string;
  style?: string | Record<string, string | number>;
  mountTimeout?: number;
  children?: ComponentChildren; // reserved for future slot sugar
}

export const Island: FunctionComponent<IslandShellProps> = (p) => {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<IslandHandle | null>(null);
  const [failed, setFailed] = useState<Error | null>(null);

  // Mount once — worker/client/app are identity; change them via `key`.
  useEffect(() => {
    let cancelled = false;
    mountIsland({
      el: ref.current!,
      worker: p.worker,
      client: p.client,
      app: p.app,
      props: p.props,
      onEvent: p.onEvent,
      slots: p.slots,
      mountTimeout: p.mountTimeout,
    })
      .then((h) => {
        if (cancelled) h.destroy();
        else handle.current = h;
      })
      .catch(setFailed);
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prop updates flow through the handle — replaces, not merges.
  const prevProps = useRef(p.props);
  useEffect(() => {
    if (p.props !== prevProps.current) {
      prevProps.current = p.props;
      handle.current?.updateProps(p.props ?? {});
    }
  }, [p.props]);

  if (failed) {
    return (
      <div class="island-error" style={{ border: '1px solid #c00', padding: '0.5em' }}>
        Island mount failed: {failed.message}
      </div>
    );
  }
  return <div ref={ref} class={p.className} style={p.style as string} />;
};

export type IslandFacadeProps<A> = Omit<IslandShellProps, 'app' | 'props'> &
  IslandAppProps<A> & { props?: Record<string, unknown> };

/**
 * `islandComponent('counter')` → a component whose own props ARE the island
 * props (minus the shell fields). Mirrors the atoll facade.
 */
export function islandComponent<A>(app: A | string): FunctionComponent<IslandFacadeProps<A>> {
  const name = typeof app === 'string' ? app : undefined;
  const Facade: FunctionComponent<IslandFacadeProps<A>> = ({ worker, client, onEvent, slots, className, style, mountTimeout, props, ...rest }) => (
    <Island
      worker={worker}
      client={client}
      app={app}
      props={{ ...(rest as Record<string, unknown>), ...(props ?? {}) }}
      onEvent={onEvent}
      slots={slots}
      className={className}
      style={style}
      mountTimeout={mountTimeout}
    />
  );
  Facade.displayName = `Island(${name ?? 'app'})`;
  return Facade;
}

/**
 * `lazyIsland(() => import('./counter.app'))` — the module must export a
 * stamped app (`export const Counter = viewIsland('counter', CounterView)`)
 * or a default/stamped export resolvable by `islandAppNameOf`.
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
        const stamped =
          Object.values(mod).find((v) => v && typeof v === 'object' && 'islandAppName' in v) ??
          mod.default;
        setApp(() => stamped);
      });
      return () => {
        live = false;
      };
    }, []);
    if (!app) return <div class={p.className} style={p.style as string} />;
    return <Island {...(p as unknown as IslandShellProps)} app={app} />;
  };
  return Lazy;
}
