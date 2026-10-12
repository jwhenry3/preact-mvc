import { useLayoutEffect, useRef } from 'preact/hooks';
import { useInjector } from './context';
import { Injector } from './injector';
import type { Type } from './injector';

export interface OnInit {
  onInit(): void;
}
export interface OnDestroy {
  onDestroy(): void;
}

// Binds a controller class to a view instance. The controller is created once
// per mounted view inside its own child injector, so `inject()` in its
// constructor sees every provider from the enclosing module scope upward.
// Lifecycle maps to mount/unmount: onInit on mount, onDestroy on unmount.
export function useController<T extends object>(cls: Type<T>): T {
  const parent = useInjector();
  const ref = useRef<{ injector: Injector; ctrl: T } | null>(null);
  if (!ref.current) {
    const injector = new Injector(parent, `controller ${cls.name}`);
    ref.current = { injector, ctrl: injector.instantiate(cls) };
  }
  const { ctrl, injector } = ref.current;
  useLayoutEffect(() => {
    injector.activate();
    return () => injector.deactivate();
  }, []);
  return ctrl;
}
