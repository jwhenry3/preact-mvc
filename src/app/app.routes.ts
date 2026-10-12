import { h } from 'preact';
import type { Route } from '@preact-mvc/core';
import { TodoModule } from './todos/todo.module';
import { CounterModule } from './counter/counter.module';
import { HelloView } from './hello/hello.view';
import { TodoView } from './todos/todo.view';
import { IslandDemoView } from './islands-demo/island-demo.view';

export const routes: Route[] = [
  { path: '/', module: TodoModule },
  { path: '/todos', module: TodoModule },
  // Declared by TodoModule but mounted without it — demonstrates module
  // ownership enforcement caught by the view's error boundary.
  { path: '/raw-todos', component: TodoView },
  { path: '/counter', module: CounterModule },
  { path: '/hello/:name', component: HelloView },
  { path: '/island', component: IslandDemoView },
  { path: '*', component: () => h('p', null, 'Not found.') },
];
