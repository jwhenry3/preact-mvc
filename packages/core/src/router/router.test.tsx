import { h } from 'preact';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Injector } from '../injector';
import { inject } from '../injector';
import { InjectorContext } from '../context';
import { route as prRoute } from 'preact-router';
import { Router, ROUTES } from './router';
import { RouterModule, routeComponent } from './module';
import { RouterOutlet } from './outlet';
import { Link } from './link';
import { createModuleInjector } from '../module';
import { lazyModule, lazyView } from '../lazy';
import { Component, Module } from '../decorators';
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

describe('nested routes', () => {
  const nested: Route[] = [
    {
      path: '/users',
      component: () => (
        <p>
          users shell <RouterOutlet />
        </p>
      ),
      children: [
        // Static keys outrank params by config order — same rule as flat lists.
        { path: 'new', component: () => <p>new user</p> },
        { path: ':id', component: () => <p>user detail</p> },
      ],
    },
    { path: '/org/:org', component: () => <p>org</p>, children: [{ path: 'team/:team', component: () => <p>team</p> }] },
    { path: '*', component: () => <p>not found</p> },
  ];

  it('matches a chain and merges params across levels', () => {
    const r = makeRouter(nested);
    r.url.value = '/org/acme/team/eng';
    const chain = r.matches.value!;
    expect(chain).toHaveLength(2);
    expect(chain[0].route.path).toBe('/org/:org');
    expect(chain[1].route.path).toBe('team/:team');
    expect(r.params.value).toEqual({ org: 'acme', team: 'eng' });
  });

  it('matches a parent alone when the tail is exhausted', () => {
    const r = makeRouter(nested);
    r.url.value = '/users';
    expect(r.matches.value).toHaveLength(1);
    expect(r.matches.value![0].route.path).toBe('/users');
  });

  it('prefers static child keys over params by config order', () => {
    const r = makeRouter(nested);
    r.url.value = '/users/new';
    expect(r.matches.value![1].route.path).toBe('new');
  });

  it('falls through to * when no child claims the tail', () => {
    const r = makeRouter(nested);
    r.url.value = '/users/1/extra';
    expect(r.match.value?.route.path).toBe('*');
  });

  it('nested <RouterOutlet/> renders the child match by depth', async () => {
    const M = RouterModule.forRoot(nested, { basePath: '/' });
    const root = new Injector();
    const inj = createModuleInjector(M, root);
    history.pushState(null, '', '/users/42');
    const router = inj.get(Router);
    router.url.value = '/users/42';
    render(h(InjectorContext.Provider, { value: inj }, h(RouterOutlet, {})));
    expect(await screen.findByText('user detail', { exact: false })).toBeTruthy();
    // The parent shell renders too — outlets nest, not replace.
    expect(screen.getByText(/users shell/)).toBeTruthy();
  });
});

describe('navigation', () => {
  it('navigate() updates the url signal and browser history', () => {
    const r = makeRouter();
    r.navigate('/user/5');
    expect(r.url.value).toBe('/user/5');
    expect(location.pathname).toBe('/user/5');
  });

  it('navigate() goes through preact-router when a bridge Router is mounted', async () => {
    // With the outlet's bridge up, navigate() delegates to route() — the
    // bridge's onChange feeds url back. Same URL, same signal; the path
    // differs only in WHO pushes history.
    const M = RouterModule.forRoot(routes, { basePath: '/' });
    const root = new Injector();
    const inj = createModuleInjector(M, root);
    history.pushState(null, '', '/');
    const router = inj.get(Router);
    router.url.value = '/';
    render(h(InjectorContext.Provider, { value: inj }, h(RouterOutlet, {})));
    await act(async () => {
      router.navigate('/user/7');
    });
    expect(router.url.value).toBe('/user/7');
    expect(location.pathname).toBe('/user/7');
    expect(await screen.findByText('user')).toBeTruthy();
  });

  it('foreign route() calls drive our router via the bridge', async () => {
    const M = RouterModule.forRoot(routes, { basePath: '/' });
    const root = new Injector();
    const inj = createModuleInjector(M, root);
    history.pushState(null, '', '/');
    const router = inj.get(Router);
    router.url.value = '/';
    render(h(InjectorContext.Provider, { value: inj }, h(RouterOutlet, {})));
    // A route() call from outside our framework — preact-router Link, a
    // third-party widget — resolves through the bridge into our signal.
    await act(async () => {
      prRoute('/user/11');
    });
    expect(router.url.value).toBe('/user/11');
    expect(await screen.findByText('user')).toBeTruthy();
  });

  it('syncs url on popstate', () => {
    const r = makeRouter();
    history.pushState(null, '', '/user/9');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(r.url.value).toBe('/user/9');
  });

  it('dispose() detaches the popstate listener', () => {
    const r = makeRouter();
    r.url.value = '/';
    history.pushState(null, '', '/user/9');
    r.dispose();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(r.url.value).toBe('/');
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
    const M = RouterModule.forRoot(routes, { basePath: '/' });
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

  it('componentless routes pass through to the next depth', async () => {
    const M = {
      __module: {
        imports: [
          RouterModule.forRoot(
            [
              {
                path: '/wrap',
                children: [{ path: 'x', component: () => <p>wrapped child</p> }],
              },
            ],
            { basePath: '/' },
          ),
        ],
      },
    };
    outletWith(M, '/wrap/x');
    expect(await screen.findByText('wrapped child')).toBeTruthy();
  });
});

function lazyOutlet(routes: Route[], initial = '/', fallback?: any) {
  const M = {
    __module: { imports: [RouterModule.forRoot(routes, { basePath: '/' })] },
  };
  const root = new Injector();
  const inj = createModuleInjector(M, root);
  history.pushState(null, '', initial);
  const router = inj.get(Router);
  router.url.value = location.pathname;
  return {
    inj,
    router,
    ...render(
      h(InjectorContext.Provider, { value: inj }, h(RouterOutlet, { fallback })),
    ),
  };
}

describe('lazy routes', () => {

  it('loadComponent mounts the resolved standalone view', async () => {
    class LazyView extends View {
      render() {
        return <p>lazy view</p>;
      }
    }
    lazyOutlet([{ path: '/l', loadComponent: () => Promise.resolve({ default: LazyView }) }], '/l');
    expect(await screen.findByText('lazy view')).toBeTruthy();
  });

  it('loadComponent finds a View among named exports', async () => {
    class Named extends View {
      render() {
        return <p>named view</p>;
      }
    }
    lazyOutlet(
      [{ path: '/n', loadComponent: () => Promise.resolve({ util: 1, Named }) }],
      '/n',
    );
    expect(await screen.findByText('named view')).toBeTruthy();
  });

  it('lazy standalone views keep their @Component imports scope', async () => {
    class Svc {
      tag = 'lazy-svc';
    }
    @Module({ providers: [Svc] })
    class SvcModule {}
    @Component({ imports: [SvcModule] })
    class LazyStandalone extends View {
      s = inject(Svc);
      render() {
        return <p>{this.s.tag}</p>;
      }
    }
    lazyOutlet(
      [{ path: '/s', loadComponent: () => Promise.resolve({ LazyStandalone }) }],
      '/s',
    );
    expect(await screen.findByText('lazy-svc')).toBeTruthy();
  });

  it('loadChildren mounts the module bootstrap inside its injector', async () => {
    class FeatureSvc {
      name = 'lazy-feature';
    }
    class Boot extends View {
      s = inject(FeatureSvc);
      render() {
        return <p>{this.s.name}</p>;
      }
    }
    @Module({ providers: [FeatureSvc], bootstrap: [Boot] })
    class LazyMod {}
    lazyOutlet(
      [{ path: '/lm', loadChildren: () => Promise.resolve({ default: LazyMod }) }],
      '/lm',
    );
    expect(await screen.findByText('lazy-feature')).toBeTruthy();
  });

  it('loadChildren resolving a Route[] extends the match into the loaded tree', async () => {
    const inner: Route[] = [{ path: 'users', component: () => <p>loaded users</p> }];
    lazyOutlet(
      [{ path: '/admin', loadChildren: () => Promise.resolve({ default: inner }) }],
      '/admin/users',
    );
    // The wrapper route is componentless — the depth-1 outlet renders the
    // loaded child once the chunk lands.
    expect(await screen.findByText('loaded users')).toBeTruthy();
  });

  it('renders an eager shell while lazy children are still loading', async () => {
    let release!: (v: any) => void;
    const gate = new Promise<any>((r) => {
      release = r;
    });
    const Shell = () => (
      <p>
        shell <RouterOutlet />
      </p>
    );
    const { router } = lazyOutlet(
      [
        { path: '/a', component: Shell, loadChildren: () => gate },
        { path: '*', component: () => <p>not found</p> },
      ],
      '/a/x',
    );
    // Still loading: the parent claims the URL alone and renders its shell.
    expect(await screen.findByText(/shell/)).toBeTruthy();
    expect(router.matches.value).toHaveLength(1);
    await act(async () => {
      release({ default: [{ path: 'x', component: () => <p>deep child</p> }] });
    });
    expect(await screen.findByText('deep child')).toBeTruthy();
    expect(router.matches.value).toHaveLength(2);
  });

  it('a lazy route resolves once across repeat visits', async () => {
    const C = () => <p>cached</p>;
    const load = vi.fn(() => Promise.resolve({ default: C }));
    const { router } = lazyOutlet(
      [
        { path: '/a', loadComponent: load },
        { path: '/b', component: () => <p>b</p> },
      ],
      '/a',
    );
    expect(await screen.findByText('cached')).toBeTruthy();
    await act(async () => {
      router.navigate('/b');
    });
    await act(async () => {
      router.navigate('/a');
    });
    expect(await screen.findByText('cached')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a rejected loader logs and renders nothing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    lazyOutlet(
      [{ path: '/bad', loadComponent: () => Promise.reject(new Error('chunk gone')) }],
      '/bad',
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("lazy route '/bad'"),
      expect.anything(),
    );
  });
});

describe('lazy loading states', () => {
  function deferred() {
    let release!: (v: any) => void;
    const gate = new Promise<any>((r) => {
      release = r;
    });
    return { gate, release };
  }

  it('the outlet fallback covers a pending loadComponent', async () => {
    const { gate, release } = deferred();
    lazyOutlet(
      [{ path: '/l', loadComponent: () => gate }],
      '/l',
      <p>loading…</p>,
    );
    expect(await screen.findByText('loading…')).toBeTruthy();
    await act(async () => {
      release({ default: () => <p>arrived</p> });
    });
    expect(await screen.findByText('arrived')).toBeTruthy();
    expect(screen.queryByText('loading…')).toBeNull();
  });

  it('the outlet fallback covers a lazyView facade component', async () => {
    const { gate, release } = deferred();
    const Lazy = lazyView(() => gate);
    lazyOutlet([{ path: '/f', component: Lazy }], '/f', <p>facade loading</p>);
    expect(await screen.findByText('facade loading')).toBeTruthy();
    await act(async () => {
      release({ default: () => <p>facade arrived</p> });
    });
    expect(await screen.findByText('facade arrived')).toBeTruthy();
  });

  it('the outlet fallback covers a lazyModule facade in the module field', async () => {
    const { gate, release } = deferred();
    const LazyMod = lazyModule(() => gate);
    lazyOutlet([{ path: '/m', module: LazyMod }], '/m', <p>module loading</p>);
    expect(await screen.findByText('module loading')).toBeTruthy();
    class Boot extends View {
      render() {
        return <p>module arrived</p>;
      }
    }
    @Module({ bootstrap: [Boot] })
    class M {}
    await act(async () => {
      release({ default: M });
    });
    expect(await screen.findByText('module arrived')).toBeTruthy();
  });

  it('a nested outlet fallback covers pending lazy children', async () => {
    const { gate, release } = deferred();
    const Shell = () => (
      <p>
        shell <RouterOutlet fallback={<p>child loading</p>} />
      </p>
    );
    const { router } = lazyOutlet(
      [
        { path: '/a', component: Shell, loadChildren: () => gate },
        { path: '*', component: () => <p>not found</p> },
      ],
      '/a/x',
      <p>outer fallback</p>,
    );
    // The shell mounts eagerly; only the child slot shows the fallback.
    expect(await screen.findByText(/shell/)).toBeTruthy();
    expect(await screen.findByText('child loading')).toBeTruthy();
    expect(screen.queryByText('outer fallback')).toBeNull();
    await act(async () => {
      release({ default: [{ path: 'x', component: () => <p>deep child</p> }] });
    });
    expect(await screen.findByText('deep child')).toBeTruthy();
    expect(screen.queryByText('child loading')).toBeNull();
    expect(router.matches.value).toHaveLength(2);
  });

  it('router.pending tracks lazy resolution across the chain', async () => {
    const { gate, release } = deferred();
    const { router } = lazyOutlet(
      [
        { path: '/p', loadComponent: () => gate },
        { path: '/home', component: () => <p>home</p> },
      ],
      '/p',
    );
    expect(router.pending.value).toBe(true);
    await act(async () => {
      release({ default: () => <p>done</p> });
    });
    await screen.findByText('done');
    expect(router.pending.value).toBe(false);
    // Navigating to an eager route stays settled.
    await act(async () => {
      router.navigate('/home');
    });
    expect(await screen.findByText('home')).toBeTruthy();
    expect(router.pending.value).toBe(false);
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

  it('restores a static-host deep link from the 404 shim param', () => {
    // The site's 404.html redirects /docs/<app>/<rest> to
    // <app>/?__pmvc_path=<rest>; the Router consumes it on construction.
    history.pushState(null, '', '/?__pmvc_path=user%2F5%3Fx%3D1');
    const r = new Router(routes, '/');
    expect(location.pathname).toBe('/user/5');
    expect(r.url.value).toBe('/user/5?x=1');
    history.pushState(null, '', '/');
  });
});

describe('Link', () => {
  it('navigates without a page reload on click', async () => {
    const M = RouterModule.forRoot(routes, { basePath: '/' });
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
