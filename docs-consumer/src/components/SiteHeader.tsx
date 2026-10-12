import { docsRootHref } from '../link';

/**
 * Sticky top bar: brand + site-level tabs. Pure markup (no client JS
 * needed): the same HTML works in the dev app and in the prerendered Pages
 * artifact. Hrefs resolve relative to the docs root so the artifact works
 * under any mount (/, /docs/, /<repo>/docs/).
 */
export function SiteHeader() {
  const home = import.meta.env.DEV ? '/' : `${docsRootHref()}../`;
  const docs = docsRootHref();
  return (
    <header class="site-header">
      <a class="site-brand" href={docs}>
        <img src={`${docsRootHref()}favicon.svg`} alt="" />
        <span class="site-brand-name">
          PREACT<span class="site-brand-js">MVC</span>
        </span>
      </a>
      <nav class="site-tabs" aria-label="Sites">
        <a href={home}>Home</a>
        <a href={docs} class="active">
          Documentation
        </a>
      </nav>
    </header>
  );
}
