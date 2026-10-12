import { createContext } from 'preact';
import type { FunctionComponent } from 'preact';
import { useContext } from 'preact/hooks';
import PRRouter from 'preact-router';
import type { RoutableProps } from 'preact-router';
import { useInjector, useService, InjectorContext } from '../context';
import { getModuleInjector } from '../module';
import { routeComponent } from './module';
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

export function RouterOutlet() {
  const router = useService(Router);
  const parent = useInjector();
  const depth = useContext(OutletDepth);
  const matches = router.matches.value;
  const match = matches?.[depth];
  if (!match) {
    // The outermost outlet keeps the bridge mounted even with no match, so
    // route() interop survives 404s.
    return depth === 0 ? (
      <PRRouter onChange={(e) => router.syncUrl(e.url)}>
        <BridgeSink default />
      </PRRouter>
    ) : null;
  }

  const Component = routeComponent(match);
  if (!Component) return null;

  // A route with `module` gets the module's injector — its providers are
  // scoped to that feature. Nesting is automatic: a deeper outlet resolves
  // its module under this level's injector.
  const injector = match.route.module
    ? getModuleInjector(match.route.module, parent)
    : parent;

  return (
    <OutletDepth.Provider value={depth + 1}>
      {depth === 0 && (
        <PRRouter onChange={(e) => router.syncUrl(e.url)}>
          <BridgeSink default />
        </PRRouter>
      )}
      <InjectorContext.Provider value={injector}>
        <Component />
      </InjectorContext.Provider>
    </OutletDepth.Provider>
  );
}
