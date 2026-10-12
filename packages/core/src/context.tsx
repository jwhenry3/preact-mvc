import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useRef } from 'preact/hooks';
import { Injector } from './injector';
import type { Provider, Token } from './injector';

// The current injector travels through the view tree as Preact context.
// Module and route boundaries swap in child injectors.

export const InjectorContext = createContext<Injector>(null as unknown as Injector);

export function useInjector(): Injector {
  const injector = useContext(InjectorContext);
  if (!injector) {
    throw new Error('No injector in context — is this view mounted under bootstrap()?');
  }
  return injector;
}

// Resolve a service/store from the view's injector scope.
export function useService<T>(token: Token<T>): T {
  return useInjector().get(token);
}

// View-local provider scope: equivalent to a component-level providers array.
// Providers created here live and die with this subtree.
export function Provide(props: { providers: Provider[]; children?: ComponentChildren }) {
  const parent = useInjector();
  const ref = useRef<Injector | null>(null);
  if (!ref.current) {
    ref.current = new Injector(parent, 'view providers');
    for (const p of props.providers) ref.current.provide(p);
  }
  return (
    <InjectorContext.Provider value={ref.current}>
      {props.children}
    </InjectorContext.Provider>
  );
}
