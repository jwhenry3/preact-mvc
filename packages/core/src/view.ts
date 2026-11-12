import { Component as PreactComponent, h, options } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { InjectorContext, useInjector } from './context';
import { Injector } from './injector';
import { registerModule } from './module';
import { ownerOf, getComponentMeta } from './decorators';
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
  // Identity stamp, not instanceof: statics inherit through the constructor
  // chain, so subclasses (and subclasses of subclasses) read true, and a
  // view class built against a second copy of this package still interops.
  static readonly __view = true;

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

/** Identity stamp read — a subclass of a View stays a view. */
export function isView(t: any): boolean {
  return typeof t === 'function' && !!(t as any).__view;
}

// --- Error boundary ----------------------------------------------------------
// Real Preact class component (not a View — it must be instantiated by Preact).
// Wraps every view host so mount/render failures stay local instead of
// aborting the whole render pass.

// Opaque upstream error signatures -> actionable guidance, appended to the
// boundary output and the console.error. Add entries when a cryptic thrown
// error has a known real cause.
const ERROR_HINTS: [RegExp, string][] = [
  [
    /Hook can only be invoked from render methods/,
    'a hook ran outside a render pass. A common cause: a function component ' +
      'mounts a Preact sub-tree with render() inside useEffect. Pending ' +
      "useEffects flush inside options.__r on a re-render, and the nested " +
      "diff corrupts preact/debug's hook tracking for the outer component. " +
      'Mount sub-trees in useLayoutEffect instead.',
  ],
];

/** Map a caught error to a known-cause hint, or null when unrecognized. */
export function errorHint(error: any): string | null {
  const msg = String(error?.message ?? error);
  for (const [re, hint] of ERROR_HINTS) if (re.test(msg)) return hint;
  return null;
}

class ViewErrorBoundary extends PreactComponent<
  { viewName: string; children?: ComponentChildren },
  { error: any }
> {
  override state = { error: null as any };

  override componentDidCatch(error: any) {
    console.error(`[framework] ${this.props.viewName} failed:`, error);
    const hint = errorHint(error);
    if (hint) console.error(`[framework] hint for ${this.props.viewName}:`, hint);
    this.setState({ error });
  }

  override render() {
    const err = this.state.error;
    if (!err) return this.props.children;
    const hint = errorHint(err);
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
      h('strong', null, `${this.props.viewName} failed`),
      h('pre', { style: { whiteSpace: 'pre-wrap', margin: '0.5rem 0' } }, String(err?.message ?? err)),
      hint ? h('p', { style: { margin: '0 0 0.5rem' } }, `hint: ${hint}`) : null,
      h('button', { onClick: () => this.setState({ error: null }) }, 'Retry')
    );
  }
}

// --- Host -------------------------------------------------------------------

const hostCache = new Map<any, any>();

function hostFor(cls: any): any {
  let host = hostCache.get(cls);
  if (host) return host;

  const meta: ComponentMeta = getComponentMeta(cls) ?? {};

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

// --- preact/debug resilience --------------------------------------------------
// preact/hooks flushes a component's pending useEffects inside options.__r
// when it re-renders before the async afterPaint pass. A pending effect that
// calls render() runs a nested diff whose `diffed` clears preact/debug's
// hooksAllowed flag — and the flag stays cleared when the component's own
// render body resumes, so its next hook throws "Hook can only be invoked
// from render methods" falsely. The flag itself is module-local and cannot
// be repaired, so instead the guard's question is answered precisely:
// function component types are wrapped so `currentRender` is the instance
// executing its body, and the options.__h/_hook check tolerates a corrupt
// flag only when the hook's component provably IS that instance.

let currentRender: any = null;
const wrappedTypes = new WeakMap<object, any>();

function isFunctionComponentType(t: any): boolean {
  return typeof t === 'function' && !(t.prototype && t.prototype.render);
}

function wrapFunctionComponent(type: any) {
  let wrapped = wrappedTypes.get(type);
  if (!wrapped) {
    wrapped = function (this: any, props: any, ctx: any) {
      const prev = currentRender;
      currentRender = this;
      try {
        return type.call(this, props, ctx);
      } finally {
        currentRender = prev;
      }
    };
    // Statics (displayName, metadata stamps) resolve off the original type.
    Object.setPrototypeOf(wrapped, type);
    wrapped.displayName = type.displayName || type.name;
    wrappedTypes.set(type, wrapped);
  }
  return wrapped;
}

let installed = false;

// Install the vnode interceptor. Must run before any view class is rendered;
// called on module load and again defensively from bootstrap().
export function installViewInterop(): void {
  if (installed) return;
  installed = true;

  // preact/debug installs its hook guard on options.__h (dist build) or
  // options._hook (source build). Component-type wrapping only engages when
  // a guard exists to protect: production has no check that can corrupt.
  // The guard must already be installed, so `import 'preact/debug'` has to
  // precede framework imports (preset-vite injects it first).
  const guardKeys = (['__h', '_hook'] as const).filter(
    (k) => typeof (options as any)[k] === 'function'
  );
  const debugLoaded = guardKeys.length > 0;
  for (const key of guardKeys) {
    const check = (options as any)[key];
    (options as any)[key] = (comp: any, index: number, type: number) => {
      try {
        check(comp, index, type);
      } catch (err) {
        if (!comp || comp !== currentRender) throw err;
        // comp is executing its own render body: the call is legal, the
        // guard's flag was cleared by a nested diffed inside options.__r.
      }
    };
  }

  const prev = (options as any).vnode as ((vnode: VNode) => void) | undefined;
  (options as any).vnode = (vnode: VNode) => {
    const t = vnode.type;
    if (isView(t)) vnode.type = hostFor(t);
    else if (debugLoaded && isFunctionComponentType(t)) {
      vnode.type = wrapFunctionComponent(t);
    }
    prev?.(vnode);
  };
}

installViewInterop();
