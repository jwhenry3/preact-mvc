import { h } from 'preact';
import type { Route } from '@preact-mvc/core';
import { WorkerPage } from '@/pages/worker-page';
import { DashboardView } from '@/pages/dashboard.view';

/**
 * The dashboard is the main-thread page — its chart and ticker are
 * dedicated worker islands mounted inside the view. The heavier routed
 * pages (users/settings/components) each render inside their own page
 * worker via WorkerPage + PageWorkerHost: the route table only names the
 * island app and the host maps that to the page's worker entry.
 */
const page = (app: string) => () => h(WorkerPage, { app });

export const routes: Route[] = [
  { path: '/', component: DashboardView },
  { path: '/users', component: page('users') },
  { path: '/settings', component: page('settings') },
  { path: '/components', component: page('components') },
  { path: '*', component: DashboardView },
];
