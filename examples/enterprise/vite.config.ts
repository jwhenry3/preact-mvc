import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  server: {
    // Pinned so the docs site's DemoFrame can find the dev demo reliably.
    port: 5175,
    strictPort: true,
    // The @preact-mvc/* workspace packages live OUTSIDE this package's root —
    // /@fs/ URLs and symlinked resolution need explicit allowance. Use the
    // absolute path: relative allow entries normalize differently than
    // resolved paths on Windows and resolution silently fails.
    fs: { allow: [r('../..')] },
  },
  resolve: {
    alias: [
      { find: '@', replacement: r('./src') },
      // ONE preact/signals instance for the whole graph: the framework's
      // vnode interception, our views, and preact-query's hooks must share
      // the same module copies or the runtime splits in two. Regex find on
      // the BARE specifier only — a directory alias breaks exports-map
      // subpaths like 'preact/jsx-dev-runtime'.
      { find: /^preact$/, replacement: r('../../node_modules/preact') },
      { find: /^@preact\/signals$/, replacement: r('../../node_modules/@preact/signals') },
    ],
  },
});
