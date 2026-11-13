import { createContext, Component as PreactComponent, h } from 'preact';
import type { ComponentChildren, FunctionComponent } from 'preact';
import { useContext } from 'preact/hooks';
import PRRouter from 'preact-router';
import type { RoutableProps } from 'preact-router';
import { useInjector, useService, InjectorContext } from '../context';
import { getModuleInjector } from '../module';
import { lazyStateOf } from '../lazy';
import {
  isLazyRoute,
  lazyRouteState,
  resolveRouteSync,
  routeChildPending,
} from './lazy';
import { Router } from './router';

/**
 * Which depth of the matched chain this outlet renders — the root outlet
 * is depth 0, an outlet inside a routed view is depth 1, and so on.
 */
const OutletDepth = createContext(0);

/**
 * The preact-router bridge: a mounted PR <Router> claiming every URL via a
 * `default` sink child. Its existence makes preact-router's machinery live
 * in this app — foreign `route()` calls and the global `<a href>` click
 * interceptor resolve through it — and its onChange feeds our `url`
 * signal, so navigations from ANY preact-routing code drive our router.
 * The sink renders nothing; url/matches props die on the component.
 */
const BridgeSink: FunctionComponent<RoutableProps> = () => null;

/**
 * A routed component receives no props — its inputs are signals and
 * context, both of which re-render it on their own. Wrapping each in a
 * do-not-update shell keeps an outlet re-render (a parent's state, a
 * query-only navigation re-matching the same route) from re-running the
 * whole routed view for nothing. Per-component wrapper types preserve
 * remount semantics: matching a different route still swaps the type.
 */
const staticHosts = new WeakMap<object, any>();
function staticHost(Component: any) {
  let host = staticHosts.get(Component);
  if (!host) {
    host = class extends PreactComponent {
      shouldComponentUpdate() {
        return false;
      }
      render() {
        return <Component />;
      }
    };
    staticHosts.set(Component, host);
  }
  return host;
}

export function RouterOutlet(props: { fallback?: ComponentChildren }) {
  const router = useService(Router);
  const parent = useInjector();
  const depth = useContext(OutletDepth);
  const matches = router.matches.value;
  const match = matches?.[depth];
  if (!match) {
    // One depth past the chain while the last match's lazy children load —
    // this outlet is where the loaded child will appear, so the fallback
    // marks the spot. (Only loadChildren can hold back deeper matches.)
    const chainLen = matches?.length ?? 0;
    const last = chainLen ? matches![chainLen - 1] : undefined;
    if (last && depth === chainLen && routeChildPending(last.route)) {
      return <>{props.fallback ?? null}</>;
    }
    // The outermost outlet keeps the bridge mounted even with no match, so
    // route() interop survives 404s.
    return depth === 0 ? (
      <PRRouter onChange={(e) => router.syncUrl(e.url)}>
        <BridgeSink default />
      </PRRouter>
    ) : null;
  }

  // Lazy routes resolve through a per-route signal: while 'loading' the
  // static fields still answer (an eager shell mounts while its lazy
  // children load); 'ready' swaps in the resolved component/module.
  const st = isLazyRoute(match.route) ? lazyRouteState(match.route).value : null;
  const resolved = st?.status === 'ready' ? st.resolved : resolveRouteSync(match.route);
  const Component = resolved.component;

  // A route with `module` gets the module's injector — its providers are
  // scoped to that feature. Nesting is automatic: a deeper outlet resolves
  // its module under this level's injector.
  const injector = resolved.module
    ? getModuleInjector(resolved.module, parent)
    : parent;

  // This depth is pending while its own render target is unresolved:
  // route-level loaders with nothing statically known yet, a lazyModule
  // facade in the module field, or a lazyView/lazyModule facade suspending
  // on mount. An eager shell under a pending loadChildren is NOT pending —
  // it renders now and the deeper outlet's fallback covers the child.
  const pending =
    (st?.status === 'loading' && !Component && !resolved.module) ||
    lazyStateOf(Component)?.status === 'loading' ||
    lazyStateOf(match.route.module)?.status === 'loading';

  return (
    <OutletDepth.Provider value={depth + 1}>
      {depth === 0 && (
        <PRRouter onChange={(e) => router.syncUrl(e.url)}>
          <BridgeSink default />
        </PRRouter>
      )}
      <InjectorContext.Provider value={injector}>
        {pending ? (
          props.fallback ?? null
        ) : Component ? (
          h(staticHost(Component), null)
        ) : (
          /* A componentless route is a pure wrapper — the chain continues
             one depth down without needing a shell view. */
          <RouterOutlet fallback={props.fallback} />
        )}
      </InjectorContext.Provider>
    </OutletDepth.Provider>
  );
}
