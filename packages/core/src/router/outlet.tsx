import { useInjector, useService, InjectorContext } from '../context';
import { getModuleInjector } from '../module';
import { routeComponent } from './module';
import { Router } from './router';

// Renders the matched route. Reading router.match (a computed signal) inside
// render subscribes this component, so navigation re-renders automatically.
// A route with `module` gets the module's injector — its providers are scoped
// to that feature.
export function RouterOutlet() {
  const router = useService(Router);
  const parent = useInjector();
  const match = router.match.value;
  if (!match) return null;

  const Component = routeComponent(match);
  if (!Component) return null;

  const injector = match.route.module
    ? getModuleInjector(match.route.module, parent)
    : parent;

  return (
    <InjectorContext.Provider value={injector}>
      <Component />
    </InjectorContext.Provider>
  );
}
