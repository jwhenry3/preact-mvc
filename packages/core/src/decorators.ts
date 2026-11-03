import type { Provider, Type } from './injector';

// Decorators attach metadata to the class constructor. They work with
// experimentalDecorators (esbuild honors the tsconfig flag) and can also be
// invoked manually: `Module({ ... })(MyModule)`.
//
// Two stamp families:
//   identity (__view, __controller) — booleans answering "is this class a
//     kind of thing"; they inherit through the constructor chain, so a
//     subclass keeps the kind.
//   config (__module, __component, __injectable) — metadata describing one
//     class; readers use ownMeta so a subclass never borrows its parent's
//     config (Angular's rule: @NgModule/@Component metadata does not
//     inherit). __injectable is the exception at read time: the injector
//     resolves providedIn through the chain, matching Angular's ɵprov.

/** A class's own decorator metadata — never the inherited static chain. */
export function ownMeta<T>(target: any, key: string): T | undefined {
  return target != null && Object.prototype.hasOwnProperty.call(target, key)
    ? (target[key] as T)
    : undefined;
}

// --- Flag accessors -----------------------------------------------------------
// The read surface for the stamps below. Callers go through these instead of
// touching `__x` properties, so the own-vs-inherited rules live in one place.

/** Identity stamp: a subclass of a @Controller stays a controller. */
export function isController(t: any): boolean {
  return typeof t === 'function' && !!t.__controller;
}

/** Injectable metadata — reads the chain on purpose (providedIn inherits). */
export function getInjectableMeta(t: any): InjectableMeta | undefined {
  return t?.__injectable;
}

/** Identity read: the class carries @Injectable metadata. */
export function isInjectable(t: any): boolean {
  return getInjectableMeta(t) != null;
}

/** Component metadata — own-class only; a subclass re-declares its own. */
export function getComponentMeta(t: any): ComponentMeta | undefined {
  return ownMeta<ComponentMeta>(t, '__component');
}

export interface InjectableMeta {
  providedIn?: 'root';
}

export function Injectable(meta: InjectableMeta = {}) {
  return function <T extends Type<any>>(target: T): T {
    (target as any).__injectable = meta;
    return target;
  };
}

export function Controller() {
  return function <T extends Type<any>>(target: T): T {
    (target as any).__controller = true;
    return target;
  };
}

export interface ComponentMeta {
  // Scoped to the component instance — like Angular component-level providers.
  providers?: Provider[];
  // Controllers registered in this view's scope: shared with the entire
  // subtree (a child view injecting the same controller gets this instance).
  // Undeclared controllers stay transient — one per injecting scope.
  controllers?: Type<any>[];
  // Modules whose providers and declared components join this view's scope —
  // Angular's standalone-component `imports`. Enables module-less views that
  // still participate in module-based scoping.
  imports?: any[];
}

export function Component(meta: ComponentMeta = {}) {
  return function <T>(target: T): T {
    (target as any).__component = meta;
    return target;
  };
}

export interface ModuleMeta {
  imports?: any[];
  providers?: Provider[];
  controllers?: Type<any>[];
  components?: any[];
  exports?: any[];
  bootstrap?: any[];
}

// View class -> the module that declared it. Built as module classes are
// decorated; consulted at mount time to enforce scope ownership.
const componentOwners = new Map<any, any>();

export function ownerOf(view: any): any {
  return componentOwners.get(view);
}

export function Module(meta: ModuleMeta) {
  return function <T>(target: T): T {
    (target as any).__module = meta;
    for (const c of [...(meta.components ?? []), ...(meta.bootstrap ?? [])]) {
      const prev = componentOwners.get(c);
      if (prev && prev !== target) {
        console.warn(
          `[framework] ${c.name ?? c} is declared by both ${prev.name} and ${(target as any).name}; keeping ${prev.name}`
        );
        continue;
      }
      componentOwners.set(c, target);
    }
    return target;
  };
}
