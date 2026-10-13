/**
 * The shell-side host for worker-rendered pages: routes point here and
 * this mounts the page's island app on the shared worker client.
 *
 * Boundary rules the props encode:
 * - theme is main-thread state (document/localStorage/matchMedia) — it
 *   crosses as props + a callbackProp setter.
 * - Signal reads in this component auto-subscribe the shell side; island
 *   props go over the wire as structured-cloneable values only.
 */
import type { FunctionComponent } from 'preact';
import { useService } from '@preact-mvc/core';
import { Island, callbackProp } from '@preact-mvc/atoll-island';
import { PageWorkerHost } from '@/services/page-worker.service';
import { ThemeService, type Theme } from '@/services/theme.service';

export const WorkerPage: FunctionComponent<{ app: string }> = ({ app }) => {
  const host = useService(PageWorkerHost);
  const theme = useService(ThemeService);
  const client = host.clientFor(app);

  const props: Record<string, unknown> = {};
  if (app === 'dashboard') {
    // Theme is main-thread state — the worker's view receives it as a prop
    // and feeds it to the chart sub-island.
    props.dark = theme.resolved.value === 'dark';
  }
  if (app === 'settings') {
    props.theme = theme.theme.value;
    props.onThemeChange = callbackProp((t: Theme) => (theme.theme.value = t));
  }

  return <Island client={client} app={app} props={props} />;
};
