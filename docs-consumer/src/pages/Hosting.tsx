import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function Hosting() {
  return (
    <article>
      <h1>Hosting &amp; Pages</h1>
      <p class="lead">
        Everything ships as static assets — the SPA bundle plus one emitted
        file per worker entry. Any static host works; the only real
        consideration is history routing.
      </p>

      <h2>Build</h2>
      <CodeBlock
        language="bash"
        code={`npm run build   # vite build → dist/

# worker entries become real chunks, bundled separately:
#   dist/assets/ticker.worker-XXXX.js`}
      />

      <h2>Subpath mounts: zero config</h2>
      <p>
        The router derives its base from <code>document.baseURI</code> at
        construction — an app deployed to <code>example.com/app/</code>{' '}
        automatically routes within <code>/app/</code> (hrefs and{' '}
        <code>navigate()</code> carry the prefix). Pair it with a relative
        asset base and one build serves any mount:
      </p>
      <CodeBlock
        language="bash"
        code={`vite build --base=./    # asset URLs relative — works under any path`}
      />
      <p>
        Explicit override when needed:{' '}
        <code>RouterModule.forRoot(routes, &#123; basePath: '/app/' &#125;)</code>.
        Details in <a href={docHref('router')}>Router</a>.
      </p>

      <h2>History routing on static hosts</h2>
      <p>
        <code>/users</code> deep links need the server to return the app
        shell. Your options by host:
      </p>
      <table class="doc-table">
        <thead>
          <tr><th>Host</th><th>Approach</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Netlify / Vercel</td>
            <td><code>_redirects</code> / rewrite rule → <code>/index.html</code></td>
          </tr>
          <tr>
            <td>GitHub Pages</td>
            <td>
              No rewrites — either accept root-entry navigation (deep links
              404), ship a <code>404.html</code> that redirects into the
              app, or emit per-route <code>index.html</code> files via a
              prerender step like this site's.
            </td>
          </tr>
          <tr>
            <td>nginx / S3+CDN</td>
            <td>Standard SPA fallback to <code>index.html</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Worker islands on static hosts</h2>
      <p>
        Islands need nothing special: the worker bundle is a static asset
        fetched same-origin, and the default transport (
        <code>mode: 'poll'</code>) is plain <code>postMessage</code> — no{' '}
        <code>SharedArrayBuffer</code>, no COOP/COEP headers. The opt-in push
        mode's SAB doorbell is the only piece that would need cross-origin
        isolation, and it's off by default for exactly this reason.
      </p>

      <h2>This site</h2>
      <p>
        The docs you're reading are the worked example:{' '}
        <code>docs-consumer/</code> prerenders one HTML file per route,
        demos build with <code>--base=./</code> and mount inside the docs
        tree, and <code>scripts/assemble-pages.mjs</code> produces a{' '}
        <code>dist-pages/</code> artifact deployable to any Pages-style
        host. <code>.nojekyll</code> keeps GitHub from filtering the
        underscore-free but hashed asset names.
      </p>
    </article>
  );
}
