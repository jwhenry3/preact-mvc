import { describe, it, expect } from 'vitest';
import { Injector } from './injector';
import { Module, ownerOf } from './decorators';
import { createModuleInjector, getModuleInjector, getModuleMeta } from './module';
import { View } from './view';

class Shared {}
class ServiceA {}
class ServiceB {}

@Module({ providers: [Shared] })
class SharedMod {}

@Module({ imports: [SharedMod], providers: [ServiceA] })
class FeatureMod {}

// Diamond: both FeatureMod and OtherMod import SharedMod; RootMod imports both.
@Module({ imports: [SharedMod], providers: [ServiceB] })
class OtherMod {}

@Module({ imports: [FeatureMod, OtherMod] })
class RootMod {}

class DeclaredView extends View {
  render() {
    return null;
  }
}

@Module({ components: [DeclaredView] })
class DeclaringMod {}

describe('module injectors', () => {
  it('registers the module’s own providers', () => {
    const root = new Injector();
    const inj = createModuleInjector(FeatureMod, root);
    expect(inj.get(ServiceA)).toBeInstanceOf(ServiceA);
  });

  it('imports contribute providers transitively', () => {
    const root = new Injector();
    const inj = createModuleInjector(RootMod, root);
    expect(inj.get(ServiceA)).toBeInstanceOf(ServiceA);
    expect(inj.get(ServiceB)).toBeInstanceOf(ServiceB);
    expect(inj.get(Shared)).toBeInstanceOf(Shared);
  });

  it('dedupes diamond imports into one shared instance', () => {
    const root = new Injector();
    const inj = createModuleInjector(RootMod, root);
    expect(inj.get(Shared)).toBe(inj.get(Shared));
  });

  it('records the transitive module closure on the injector', () => {
    const root = new Injector();
    const inj = createModuleInjector(RootMod, root);
    expect([...inj.modules]).toEqual(
      expect.arrayContaining([RootMod, FeatureMod, OtherMod, SharedMod])
    );
  });

  it('getModuleInjector caches per parent injector', () => {
    const root = new Injector();
    const a = getModuleInjector(FeatureMod, root);
    expect(getModuleInjector(FeatureMod, root)).toBe(a);
    const other = new Injector();
    expect(getModuleInjector(FeatureMod, other)).not.toBe(a);
  });

  it('throws when given something without module metadata', () => {
    expect(() => createModuleInjector(class {}, new Injector())).toThrow(/not a module/);
  });

  it('exposes module metadata', () => {
    expect(getModuleMeta(FeatureMod)?.providers).toContain(ServiceA);
  });
});

describe('module-declared controllers', () => {
  it('register at module scope — shared across descendant scopes', () => {
    class C {}
    (C as any).__controller = true;
    @Module({ controllers: [C] })
    class M {}
    const modInj = createModuleInjector(M, new Injector());
    const child = new Injector(modInj);
    expect(child.get(C)).toBe(modInj.get(C));
    const otherChild = new Injector(modInj);
    expect(otherChild.get(C)).toBe(modInj.get(C)); // one shared instance
  });
});

describe('component ownership', () => {
  it('maps declared views to their declaring module', () => {
    expect(ownerOf(DeclaredView)).toBe(DeclaringMod);
  });

  it('leaves undeclared views unowned', () => {
    class Free extends View {
      render() {
        return null;
      }
    }
    expect(ownerOf(Free)).toBeUndefined();
  });
});
