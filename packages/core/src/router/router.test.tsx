import { h } from 'preact';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import { Injector } from '../injector';
import { inject } from '../injector';
import { InjectorContext } from '../context';
import { Router, ROUTES } from './router';
import { RouterModule, routeComponent } from './module';
import { RouterOutlet } from './outlet';
import { Link } from './link';
import { createModuleInjector } from '../module';
import { Module } from '../decorators';
import { View } from '../view';
import type { Route } from './router';

afterEach(() => cleanup());

const routes: Route[] = [
  { path: '/', component: () => <p>home</p> },
  { path: '/user/:id', component: () => <p>user</p> },
  { path: '*', component: () => <p>not found</p> },
];

function makeRouter(rs: Route[] = routes) {
  // Explicit '/' base — document.baseURI tracks earlier tests' pushState
  // calls, so the default would inherit a stale mount dir.
  return new Router(rs, '/');
}

describe('route matching', () => {
  it('matches exact paths and captures :params', () => {
    const r = makeRouter();
    r.url.value = '/user/42';
    expect(r.match.value?.params.id).toBe('42');
  });

  it('decodes URI components in params', () => {
    const r = makeRouter();
    r.url.value = '/user/a%20b';
    expect(r.match.value?.params.id).toBe('a b');
  });

  it('falls back to * wildcard and returns null when nothing matches', () => {
    const r = makeRouter();
    r.url.value = '/anything';
    expect(r.match.value?.route.path).toBe('*');
    const noWild = new Router([{ path: '/only', component: () => null }], '/');
    noWild.url.value = '/other';
    expect(noWild.match.value).toBeNull();
  });

  it('exposes params as a computed signal', () => {
    const r = makeRouter();
    r.url.value = '/user/7';
    expect(r.params.value.id).toBe('7');
  });
});

describe('navigation', () => {
  it('navigate() updates the url signal and browser history', () => {
    const r = makeRouter();
    r.navigate('/user/5');
    expect(r.url.value).toBe('/user/5');
    expect(location.pathname).toBe('/user/5');
  });

  it('syncs url on popstate', () => {
    const r = makeRouter();
    history.pushState(null, '', '/user/9');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(r.url.value).toBe('/user/9');
  });
});

describe('RouterOutlet', () => {
  function outletWith(module: any, initial = '/') {
    const root = new Injector();
    const inj = createModuleInjector(module, root);
    history.pushState(null, '', initial);
    // Router is constructed lazily; force url sync after pushState.
    const router = inj.get(Router);
    router.url.value = location.pathname;
    return {
      inj,
      router,
      ...render(h(InjectorContext.Provider, { value: inj }, h(RouterOutlet, {}))),
    };
  }

  it('renders the matched route component', async () => {
    const M = RouterModule.forRoot(routes);
    outletWith(M, '/user/3');
    expect(await screen.findByText('user')).toBeTruthy();
  });

  it('mounts module routes inside the module injector', async () => {
    class FeatureSvc {
      name = 'feature-scoped';
    }
    class FeatureView extends View {
      s = inject(FeatureSvc);
      render() {
        return <p>{this.s.name}</p>;
      }
    }
    @Module({ providers: [FeatureSvc], components: [FeatureView], bootstrap: [FeatureView] })
    class FeatureMod {}
    const M = {
      __module: {
        imports: [RouterModule.forRoot([{ path: '/f', module: FeatureMod }])],
      },
    };
    outletWith(M, '/f');
    expect(await screen.findByText('feature-scoped')).toBeTruthy();
  });

  it('routeComponent prefers an explicit component over module bootstrap', () => {
    const C = () => null;
    const match = { route: { path: '/x', component: C } };
    expect(routeComponent(match)).toBe(C);
  });
});

describe('base path', () => {
  it('strips the mount prefix when reading location and matches routes', () => {
    const r = new Router(routes, '/demo/');
    history.pushState(null, '', '/demo/user/8');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(r.url.value).toBe('/user/8');
    expect(r.match.value?.params.id).toBe('8');
  });

  it('normalizes the base and defaults it from document.baseURI', () => {
    expect(new Router(routes, '/demo/').base).toBe('/demo');
    expect(new Router(routes, '/').base).toBe('');
    // At the document root the default derivation yields no prefix.
    history.pushState(null, '', '/');
    expect(new Router(routes).base).toBe('');
    // And under a mount dir it yields that dir.
    history.pushState(null, '', '/docs/demo/');
    expect(new Router(routes).base).toBe('/docs/demo');
    history.pushState(null, '', '/');
  });

  it('prepends the base on navigate() and href()', () => {
    const r = new Router(routes, '/demo/');
    r.navigate('/user/2');
    expect(location.pathname).toBe('/demo/user/2');
    expect(r.url.value).toBe('/user/2');
    expect(r.href('/user/2')).toBe('/demo/user/2');
    history.pushState(null, '', '/');
  });

  it('forRoot accepts an explicit basePath', () => {
    const M = RouterModule.forRoot(routes, { basePath: '/app/' });
    const inj = createModuleInjector(M, new Injector());
    expect(inj.get(Router).base).toBe('/app');
  });
});

describe('Link', () => {
  it('navigates without a page reload on click', async () => {
    const M = RouterModule.forRoot(routes);
    const root = new Injector();
    const inj = createModuleInjector(M, root);
    const router = inj.get(Router);
    router.url.value = '/';
    render(
      h(
        InjectorContext.Provider,
        { value: inj },
        h('div', {}, h(Link, { to: '/user/1' }, 'go'), h(RouterOutlet, {}))
      )
    );
    await act(async () => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(router.url.value).toBe('/user/1');
    expect(location.pathname).toBe('/user/1');
    expect(await screen.findByText('user')).toBeTruthy();
  });
});
