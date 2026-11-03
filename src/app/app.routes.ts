import { h } from 'preact';
import { lazyModule, lazyView } from '@preact-mvc/core';
import type { Route } from '@preact-mvc/core';
import { TodoModule } from './todos/todo.module';
import { TodoView } from './todos/todo.view';
import { IslandDemoView } from './islands-demo/island-demo.view';

// Lazy facades double as route entries AND mountable components: the same
// facade used in a route's component/module field can also be dropped into
// JSX, where it suspends on the import and mounts once resolved.
const CounterFeature = lazyModule(() =>
  import('./counter/counter.module').then((m) => m.CounterModule),
);
const HelloView = lazyView(() => import('./hello/hello.view').then((m) => m.HelloView));
const SettingsShellView = lazyView(() =>
  import('./settings/settings.view').then((m) => m.SettingsShellView),
);
const GeneralSettingsView = lazyView(() =>
  import('./settings/settings.view').then((m) => m.GeneralSettingsView),
);
const SecuritySettingsView = lazyView(() =>
  import('./settings/settings.view').then((m) => m.SecuritySettingsView),
);

export const routes: Route[] = [
  { path: '/', module: TodoModule },
  { path: '/todos', module: TodoModule },
  // Declared by TodoModule but mounted without it — demonstrates module
  // ownership enforcement caught by the view's error boundary.
  { path: '/raw-todos', component: TodoView },
  // Lazy feature module in the module slot: the chunk and its providers
  // load on first visit, bootstrap renders inside the module injector.
  { path: '/counter', module: CounterFeature },
  // Lazy standalone view — no module; its own @Component({ imports }) scope
  // still applies once the chunk resolves.
  { path: '/hello/:name', component: HelloView },
  { path: '/island', component: IslandDemoView },
  // Nested lazy standalone routes: the shell and each child split separately;
  // the shell's <RouterOutlet/> mounts whichever child matched.
  {
    path: '/settings',
    component: SettingsShellView,
    children: [
      { path: 'general', component: GeneralSettingsView },
      { path: 'security', component: SecuritySettingsView },
    ],
  },
  { path: '*', component: () => h('p', null, 'Not found.') },
];
