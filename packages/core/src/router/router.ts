import { computed, signal } from '@preact/signals';
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

function matchPath(pattern: string, url: string): Record<string, string> | null {
  if (pattern === '*') return {};
  const pSegs = pattern.split('/').filter(Boolean);
  const uSegs = url.split('/').filter(Boolean);
  if (pSegs.length !== uSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i];
    const u = decodeURIComponent(uSegs[i]);
    if (p.startsWith(':')) params[p.slice(1)] = u;
    else if (p !== u) return null;
  }
  return params;
}

function matchRoutes(routes: Route[], url: string): RouteMatch | null {
  const path = url.split('?')[0].split('#')[0];
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

@Injectable()
export class Router {
  /** Mount prefix, normalized to '' or '/demo' (no trailing slash). */
  readonly base: string;
  url = signal(typeof location === 'undefined' ? '/' : '');
  match = computed(() => matchRoutes(this.routes, this.url.value));
  params = computed(() => this.match.value?.params ?? {});

  constructor(
    private routes: Route[],
    base = defaultBasePath(),
  ) {
    this.base = base === '/' ? '' : base.replace(/\/+$/, '');
    if (typeof location !== 'undefined') {
      this.url.value = this.strip(location.pathname) + location.search;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState);
    }
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

  private onPopState = () => {
    this.url.value = this.strip(location.pathname) + location.search;
  };

  navigate(to: string): void {
    history.pushState(null, '', this.base + to);
    this.url.value = to;
  }

  isActive(path: string): boolean {
    return this.url.value === path;
  }
}
