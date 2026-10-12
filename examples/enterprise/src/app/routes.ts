import type { Route } from '@preact-mvc/core';
import { DashboardView } from '@/pages/dashboard.view';
import { UsersView } from '@/pages/users.view';
import { SettingsView } from '@/pages/settings.view';
import { ComponentsView } from '@/pages/components.view';

export const routes: Route[] = [
  { path: '/', component: DashboardView },
  { path: '/users', component: UsersView },
  { path: '/settings', component: SettingsView },
  { path: '/components', component: ComponentsView },
  { path: '*', component: DashboardView },
];
