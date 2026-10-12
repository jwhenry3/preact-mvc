import { Component as PreactComponent, h, options } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { InjectorContext, useInjector } from './context';
import { Injector } from './injector';
import { registerModule } from './module';
import { ownerOf } from './decorators';
import type { ComponentMeta } from './decorators';

// --- Class-based views -----------------------------------------------------
// A View subclass is never instantiated by Preact. The options.vnode hook
// below swaps any vnode whose type is a View subclass for a host function
// component, which constructs the class ONCE per mount inside a child
// injector — so `inject()` in field initializers resolves against that view's
// scope (component providers -> module providers -> root).
//
// render() runs on every render pass with no framework involvement: signals
// read inside it subscribe the host component automatically.

export abstract class View<P = {}> extends PreactComponent<P> {
  abstract render(): ComponentChildren;

  // Views are signal-driven; setState/forceUpdate would hit Preact internals
  // on an instance Preact never mounted. Fail loudly instead of corrupting.
  override setState(): never {
    throw new Error('View components are signal-driven — assign a signal instead of calling setState()');
  }
  override forceUpdate(): never {
    throw new Error('View components are signal-driven — assign a signal instead of calling forceUpdate()');
  }
}

function isViewClass(t: any): boolean {
  return typeof t === 'function' && t.prototype instanceof View;
}

// --- Error boundary ----------------------------------------------------------
// Real Preact class component (not a View — it must be instantiated by Preact).
// Wraps every view host so mount/render failures stay local instead of
// aborting the whole render pass.

class ViewErrorBoundary extends PreactComponent<
  { viewName: string; children?: ComponentChildren },
  { error: any }
> {
  override state = { error: null as any };

  override componentDidCatch(error: any) {
    console.error(`[framework] ${this.props.viewName} failed:`, error);
    this.setState({ error });
  }

  override render() {
    const err = this.state.error;
    if (!err) return this.props.children;
    return h(
      'div',
      {
        style: {
          border: '1px solid #e53935',
          background: '#ffebee',
          padding: '0.75rem',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        },
      },
      h('strong', null, `${this.props.viewName} failed to mount`),
      h('pre', { style: { whiteSpace: 'pre-wrap', margin: '0.5rem 0' } }, String(err?.message ?? err)),
      h('button', { onClick: () => this.setState({ error: null }) }, 'Retry')
    );
  }
}

// --- Host -------------------------------------------------------------------

const hostCache = new Map<any, any>();

function hostFor(cls: any): any {
  let host = hostCache.get(cls);
  if (host) return host;

  const meta = (cls.__component ?? {}) as ComponentMeta;

  const inner = function ViewHost(props: any) {
    const parent = useInjector();
    const ref = useRef<{ inj: Injector; inst: any } | null>(null);
    if (!ref.current) {
      // Module ownership: a view declared in a module's components/bootstrap
      // may only mount where that module's injector is an ancestor — Angular's
      // declaration rule enforced at mount. Undeclared views mount freely.
      const owner = ownerOf(cls);
      if (owner) {
        let node: Injector | null = parent;
        while (node && !node.modules.has(owner)) node = node.parent;
        if (!node) {
          throw new Error(
            `${cls.name} is declared by ${owner.name ?? 'a module'} but mounted outside its injector scope. ` +
              `Mount it under a route/module that includes ${owner.name ?? 'that module'}.`
          );
        }
      }
      const inj = new Injector(parent, `view ${cls.name}`);
      // Standalone scope: imported modules contribute providers (and mark
      // themselves visible for ownership checks); view-level providers and
      // declared controllers register on top, closest-scope-wins.
      const seen = new Set<any>();
      for (const imp of meta.imports ?? []) registerModule(imp, inj, seen);
      for (const p of meta.providers ?? []) inj.provide(p);
      for (const c of meta.controllers ?? []) inj.provide(c);
      ref.current = { inj, inst: inj.instantiate(cls, props) };
    }
    const { inj, inst } = ref.current;
    inst.props = props;
    // Mount activates the whole view scope: onInit for the view and every
    // controller/provider its injector constructed; unmount fires onDestroy.
    // useLayoutEffect (synchronous at commit) is deliberate: deferred
    // useEffect callbacks are dropped if the host unmounts before they flush,
    // which would silently lose onInit on same-tick mount+navigate.
    useLayoutEffect(() => {
      inj.activate();
      return () => inj.deactivate();
    }, []);
    // The view's injector becomes the scope for everything it renders, so
    // child components resolve through it — the element-injector hierarchy.
    return h(InjectorContext.Provider, { value: inj }, inst.render());
  };
  (inner as any).displayName = cls.name;

  host = function BoundedView(props: any) {
    return h(ViewErrorBoundary, { viewName: cls.name }, h(inner, props));
  };
  (host as any).displayName = cls.name;
  hostCache.set(cls, host);
  return host;
}

let installed = false;

// Install the vnode interceptor. Must run before any view class is rendered;
// called on module load and again defensively from bootstrap().
export function installViewInterop(): void {
  if (installed) return;
  installed = true;
  const prev = (options as any).vnode as ((vnode: VNode) => void) | undefined;
  (options as any).vnode = (vnode: VNode) => {
    const t = vnode.type;
    if (isViewClass(t)) vnode.type = hostFor(t);
    prev?.(vnode);
  };
}

installViewInterop();
