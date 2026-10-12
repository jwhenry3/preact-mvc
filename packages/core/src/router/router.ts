import { computed, signal } from '@preact/signals';
import { route as prRoute } from 'preact-router';
import { Injectable } from '../decorators';
import { InjectionToken } from '../injector';

export interface Route {
  path: string;
  component?: any; // view function
  module?: any; // module class — its bootstrap component renders inside its injector
  children?: Route[];
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

export const ROUTES = new InjectionToken<Route[]>('ROUTES');
export const ROUTER_BASE = new InjectionToken<string>('ROUTER_BASE');

/**
 * The directory the app's document lives at, e.g. '/demo/' when the page is
 * served from `host/demo/index.html`. Deriving the base from baseURI (rather
 * than baking it at build time) means the same bundle works under any mount
 * path — GitHub Pages project dirs, reverse-proxy prefixes, iframed demos.
 */
export function defaultBasePath(): string {
  if (typeof document === 'undefined') return '/';
  const p = new URL(document.baseURI).pathname;
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
}

/**
 * Prefix match: consume the pattern's leading segments off `segs`, returning
 * the captured params and the unconsumed tail. `'*'` consumes everything;
 * `''` consumes nothing (an index route — leaf check decides validity).
 */
function matchPrefix(
  pattern: string,
  segs: string[],
): { params: Record<string, string>; rest: string[] } | null {
  if (pattern === '*') return { params: {}, rest: [] };
  const pSegs = pattern.split('/').filter(Boolean);
  if (pSegs.length > segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i];
    const u = decodeURIComponent(segs[i]);
    if (p.startsWith(':')) params[p.slice(1)] = u;
    else if (p !== u) return null;
  }
  return { params, rest: segs.slice(pSegs.length) };
}

/**
 * Match `segs` against a route list into a chain outermost → innermost.
 * A route with `children` matches by prefix and the tail recurses; a leaf
 * route must consume the whole tail. Parents may match alone when the tail
 * is exhausted (Angular semantics: `/users` renders the parent shell even
 * if it has children).
 */
function matchSegments(routes: Route[], segs: string[]): RouteMatch[] | null {
  for (const route of routes) {
    const m = matchPrefix(route.path, segs);
    if (m === null) continue;
    if (route.children?.length) {
      const child = matchSegments(route.children, m.rest);
      if (child !== null) return [{ route, params: m.params }, ...child];
      if (m.rest.length === 0) return [{ route, params: m.params }];
      continue;
    }
    if (m.rest.length === 0) return [{ route, params: m.params }];
  }
  return null;
}

function matchRoutes(routes: Route[], url: string): RouteMatch[] | null {
  const path = url.split('?')[0].split('#')[0];
  return matchSegments(routes, path.split('/').filter(Boolean));
}

@Injectable()
export class Router {
  /** Mount prefix, normalized to '' or '/demo' (no trailing slash). */
  readonly base: string;
  url = signal(typeof location === 'undefined' ? '/' : '');
  /**
   * The matched chain outermost → innermost — depth d is what the d-th
   * nested <RouterOutlet/> renders.
   */
  matches = computed(() => matchRoutes(this.routes, this.url.value));
  /** Back-compat: the chain's outermost match. */
  match = computed(() => this.matches.value?.[0] ?? null);
  /** Params merged across the whole chain (inner levels win on collision). */
  params = computed(() =>
    Object.assign({}, ...(this.matches.value ?? []).map((m) => m.params)),
  );

  constructor(
    private routes: Route[],
    base = defaultBasePath(),
  ) {
    this.base = base === '/' ? '' : base.replace(/\/+$/, '');
    this.consumeShimParam();
    if (typeof location !== 'undefined') {
      this.url.value = this.strip(location.pathname) + location.search;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState);
    }
  }

  /**
   * Static-host deep links: the site's 404 shim redirects
   * `/docs/<app>/<rest>` to `<app>/?__pmvc_path=<rest>` so the app loads;
   * restore the real URL via replaceState before seeding `url` — the
   * browser history never sees the hop. No-op everywhere else.
   */
  private consumeShimParam(): void {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    const rest = new URL(location.href).searchParams.get('__pmvc_path');
    if (rest === null) return;
    history.replaceState(null, '', this.base + '/' + rest);
  }

  private strip(path: string): string {
    if (this.base && path.startsWith(this.base)) {
      return path.slice(this.base.length) || '/';
    }
    return path;
  }

  /** Absolute href for an in-app path — what <a href> and pushState see. */
  href(to: string): string {
    return this.base + to;
  }

  /** Called by the preact-router bridge on any URL change it sees —
   *  foreign route() calls, its global <a> interceptor, popstate. */
  syncUrl(fullUrl: string): void {
    const [path, search = ''] = fullUrl.split('?');
    const stripped = this.strip(path);
    const next = stripped + (search ? `?${search}` : '');
    if (next !== this.url.value) this.url.value = next;
  }

  private onPopState = () => {
    this.syncUrl(location.pathname + location.search);
  };

  navigate(to: string): void {
    // Through preact-router: updates every mounted <Router> in the tree —
    // ours and foreign ones — not just our own subscriber. route() is a
    // no-op when no mounted PR Router claims the url, so fall back to a
    // manual push when the bridge isn't up yet.
    if (!prRoute(this.base + to)) {
      history.pushState(null, '', this.base + to);
      this.url.value = to;
    }
  }

  isActive(path: string): boolean {
    return this.url.value === path;
  }
}
