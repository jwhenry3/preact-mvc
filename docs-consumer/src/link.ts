/**
 * Route-depth plumbing for the prerendered site.
 *
 * Docs pages are emitted one level (or more) below the docs root, so every
 * relative link needs `../` steps matching the depth of the page currently
 * being rendered. Renders are sequential (one page per renderToString call,
 * and dev re-renders never interleave), so a module-level depth is safe and
 * keeps pages free of prop drilling.
 */
let currentDepth = 0;

export function setRouteDepth(depth: number) {
  currentDepth = depth;
}

/** `../` × the current page's depth: resolves to the docs site root. */
export function docsRootHref() {
  return '../'.repeat(currentDepth);
}

/** Href to route `id` relative to this page. 'overview' is emitted as the
 *  docs root index, so it links to root. */
export function docHref(id: string) {
  return id === 'overview' ? docsRootHref() : `${docsRootHref()}${id}/`;
}
