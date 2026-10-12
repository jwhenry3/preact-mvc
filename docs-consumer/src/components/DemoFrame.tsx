import { docsRootHref } from '../link';

interface DemoFrameProps {
  /** Mount name inside the docs tree: demos land at <docs>/<id>/. */
  id: 'demo' | 'enterprise';
  /** Dev-server port the example runs on (npm run dev / dev:enterprise). */
  port: number;
  name: string;
  /** Non-index page within the app: e.g. 'users'. */
  path?: string;
}

/**
 * Embeds one of the example apps. In the docs dev server the examples run on
 * their own ports; in the built site they are mounted at ./<id>/ relative to
 * the docs root: works under any base path (serve:pages, GitHub Pages).
 */
export function DemoFrame({ id, port, name, path = '' }: DemoFrameProps) {
  const base = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:${port}/`
    : `${docsRootHref()}${id}/`;
  // ?v=<build stamp>: index.html keeps a stable name, so a fresh stamp per
  // build forces browsers past aggressively cached documents.
  const src = `${base}${path.replace(/^\//, '')}?v=${__BUILD_ID__}`;
  const label = import.meta.env.DEV
    ? `${window.location.hostname}:${port}/${path.replace(/^\//, '')}`
    : `${id}/${path.replace(/^\//, '')}`;
  return (
    <div class="demo-frame">
      <div class="demo-frame-bar">
        <span class="demo-label">
          <code>{name}</code>
        </span>
        <a href={src} target="_blank" rel="noreferrer">
          {label} ↗
        </a>
      </div>
      <iframe src={src} title={`${name} live demo`} />
      <p class="demo-hint">
        If the frame is blank, the example isn't running: start it with{' '}
        <code>npm run dev</code> (framework demo) or{' '}
        <code>npm run dev:enterprise</code> from the repository root, or serve
        the built site with <code>npm run serve:pages</code>.
      </p>
    </div>
  );
}
