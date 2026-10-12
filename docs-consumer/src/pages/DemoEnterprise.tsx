import { DemoFrame } from '../components/DemoFrame';
import { docHref } from '../link';

export function DemoEnterprise() {
  return (
    <article>
      <h1>Enterprise example</h1>
      <p class="lead">
        <code>examples/enterprise/</code> — a realistic application shell:
        Tailwind v4 + shadcn-style components, TanStack Query through DI,
        zod-validated forms, ECharts, and a worker island in the dashboard.
      </p>

      <DemoFrame id="enterprise" port={5175} name="examples/enterprise" />

      <h2>What to try</h2>
      <table class="doc-table">
        <thead>
          <tr><th>Route</th><th>What it demonstrates</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/</code> (dashboard)</td>
            <td>
              Query-backed stat cards, an ECharts area chart, recent
              activity, and a live <strong>worker island</strong> — the
              uptime ticker renders off-thread and emits{' '}
              <code>worker-ping</code> events back to the shell.
            </td>
          </tr>
          <tr>
            <td><code>/users</code></td>
            <td>
              <code>querySignal</code> in action: debounced search input →
              signal → reactive query key → filtered table. Refresh triggers{' '}
              <code>invalidateQueries</code>.
            </td>
          </tr>
          <tr>
            <td><code>/components</code></td>
            <td>
              The shadcn-style <code>src/ui/</code> layer: CVA button
              variants, badges, tabs, dialog, inputs, skeletons — all plain
              function components over <code>cn()</code>.
            </td>
          </tr>
          <tr>
            <td><code>/settings</code></td>
            <td>
              Declared-controller forms: field signals, zod validation on
              submit, error display, dirty/saved state — plus the{' '}
              <code>ThemeService</code> light/dark/system switcher (also in
              the header).
            </td>
          </tr>
        </tbody>
      </table>

      <h2>The integration recipes it embodies</h2>
      <ul>
        <li><a href={docHref('guide-integrations')}>Integrating libraries</a> — client-as-provider + subscribe→signal</li>
        <li><a href={docHref('guide-query')}>Data fetching</a> — QueryModule + querySignal</li>
        <li><a href={docHref('guide-forms')}>Forms & validation</a> — controller + zod</li>
        <li><a href={docHref('guide-styling')}>Styling</a> — tokens, cn(), CVA</li>
      </ul>
    </article>
  );
}
