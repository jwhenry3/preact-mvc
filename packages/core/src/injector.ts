export type Type<T> = new (...args: any[]) => T;

export class InjectionToken<T> {
  constructor(protected readonly _desc: string) {}
  toString() {
    return `InjectionToken ${this._desc}`;
  }
}

export type Token<T> = Type<T> | InjectionToken<T> | (abstract new (...args: any[]) => T);

export type Provider =
  | Type<any>
  | { provide: Token<any>; useClass: Type<any> }
  | { provide: Token<any>; useValue: any }
  | { provide: Token<any>; useFactory: (...deps: any[]) => any; deps?: Token<any>[] };

interface Record {
  factory: () => any;
  resolving: boolean;
  resolved: boolean;
  value: any;
}

// --- Injection context -----------------------------------------------------
// While an Injector constructs a class (service, controller, factory), it
// becomes the "current" injector so `inject()` calls inside the constructor
// or field initializers resolve against it — the same model as Angular's
// injection context.

let currentInjector: Injector | null = null;

export function runInInjectionContext<T>(injector: Injector, fn: () => T): T {
  const prev = currentInjector;
  currentInjector = injector;
  try {
    return fn();
  } finally {
    currentInjector = prev;
  }
}

export function inject<T>(token: Token<T>): T {
  if (!currentInjector) {
    throw new Error(
      'inject() called outside an injection context. It can only be used in the ' +
        'constructor/field initializers of a class instantiated by the framework.'
    );
  }
  return currentInjector.get(token);
}

export function getCurrentInjector(): Injector | null {
  return currentInjector;
}

// --- Injector ---------------------------------------------------------------

function tokenName(token: Token<any>): string {
  return typeof token === 'function' ? token.name : token.toString();
}

// Injectable handle to the enclosing scope's destruction — inject(DestroyRef)
// anywhere to register cleanup that runs when the scope is deactivated.
export class DestroyRef {
  constructor(private readonly injector: Injector) {}
  onDestroy(fn: () => void): void {
    this.injector.registerCleanup(fn);
  }
}

export class Injector {
  private records = new Map<Token<any>, Record>();

  // Every module whose providers AND declared components are visible in this
  // scope: the module this injector was created for plus its transitive
  // imports. Populated by registerModule(); read by view-mount enforcement.
  readonly modules = new Set<any>();

  constructor(
    readonly parent: Injector | null = null,
    readonly name = 'injector'
  ) {
    this.records.set(DestroyRef, {
      factory: () => null,
      resolving: false,
      resolved: true,
      value: new DestroyRef(this),
    });
  }

  get root(): Injector {
    let node: Injector = this;
    while (node.parent) node = node.parent;
    return node;
  }

  provide(provider: Provider): void {
    if (typeof provider === 'function') {
      const cls = provider;
      this.records.set(cls, {
        factory: () => this.instantiate(cls),
        resolving: false,
        resolved: false,
        value: undefined,
      });
    } else if ('useValue' in provider) {
      this.records.set(provider.provide, {
        factory: () => provider.useValue,
        resolving: false,
        resolved: false,
        value: undefined,
      });
    } else if ('useClass' in provider) {
      const cls = provider.useClass;
      this.records.set(provider.provide, {
        factory: () => this.instantiate(cls),
        resolving: false,
        resolved: false,
        value: undefined,
      });
    } else {
      const { useFactory, deps = [] } = provider;
      this.records.set(provider.provide, {
        factory: () => useFactory(...deps.map((d) => this.get(d))),
        resolving: false,
        resolved: false,
        value: undefined,
      });
    }
  }

  has(token: Token<any>): boolean {
    if (this.records.has(token)) return true;
    if ((token as any).__controller) return true;
    if (this.parent) return this.parent.has(token);
    return this.isRootProvided(token);
  }

  get<T>(token: Token<T>): T {
    // Nearest explicit registration wins, walking up the scope chain. This is
    // what makes declaring a controller/provider in a scope meaningful: every
    // descendant resolves that shared instance.
    let node: Injector | null = this;
    while (node) {
      const rec = node.records.get(token);
      if (rec) return node.resolveRecord(token, rec);
      node = node.parent;
    }
    // Controllers are transient unless explicitly provided: one instance per
    // requesting scope, so a view always gets its own controller.
    if ((token as any).__controller) {
      this.provide(token as Type<any>);
      return this.resolveRecord(token, this.records.get(token)!);
    }
    // providedIn: 'root' lazily registers at the top — local providers still
    // shadow it because the chain walk runs first.
    const root = this.root;
    if (root.isRootProvided(token)) {
      root.provide({ provide: token, useClass: token as Type<T> });
      return root.get(token);
    }
    throw new Error(`No provider for ${tokenName(token)} (looked up from "${this.name}")`);
  }

  private resolveRecord<T>(token: Token<T>, rec: Record): T {
    if (rec.resolving) {
      throw new Error(`Circular dependency detected while resolving ${tokenName(token)}`);
    }
    if (!rec.resolved) {
      rec.resolving = true;
      try {
        rec.value = rec.factory();
        rec.resolved = true;
      } finally {
        rec.resolving = false;
      }
    }
    return rec.value;
  }

  private isRootProvided(token: Token<any>): boolean {
    const meta = (token as any).__injectable as { providedIn?: 'root' } | undefined;
    return meta?.providedIn === 'root';
  }

  instantiate<T>(cls: Type<T>, ...args: any[]): T {
    const inst = runInInjectionContext(this, () => new cls(...args));
    this.trackLifecycle(inst);
    return inst;
  }

  // --- Scope lifecycle -----------------------------------------------------
  // Every class this injector constructs (view, injected controllers,
  // view-scoped providers) is managed together: activate() fires onInit on
  // all of them at mount, deactivate() fires onDestroy at unmount — the same
  // way Angular ties provider lifecycles to their injector's scope.

  private managed: any[] = [];
  private active = false;

  private trackLifecycle(inst: any): void {
    if (typeof inst?.onInit !== 'function' && typeof inst?.onDestroy !== 'function') return;
    this.managed.push(inst);
    if (this.active) inst.onInit?.();
  }

  activate(): void {
    this.active = true;
    for (const inst of this.managed) inst.onInit?.();
  }

  deactivate(): void {
    for (const inst of this.managed) inst.onDestroy?.();
    for (const cleanup of this.cleanups) cleanup();
    this.managed.length = 0;
    this.cleanups.length = 0;
    this.active = false;
  }

  private cleanups: Array<() => void> = [];

  // Register teardown (effect disposers, subscriptions, timers) that runs
  // when this scope is deactivated. Exposed to classes via DestroyRef.
  registerCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }
}
