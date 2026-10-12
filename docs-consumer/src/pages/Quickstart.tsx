import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function Quickstart() {
  return (
    <article>
      <h1>Quickstart</h1>
      <p class="lead">
        A routed todo app: one module, one store, one controller, one view.
        Six files, and injection replaces prop drilling from the start.
      </p>

      <h2>1 · Install</h2>
      <CodeBlock
        language="bash"
        code={`npm install @preact-mvc/core preact @preact/signals
npm install -D @preact/preset-vite typescript vite`}
      />
      <p>
        Decorators need two tsconfig flags; JSX compiles to Preact's
        automatic runtime:
      </p>
      <CodeBlock
        file="tsconfig.json"
        language="json"
        code={`{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}`}
      />
      <blockquote>
        <p>
          <code>useDefineForClassFields: false</code> matters:{' '}
          <code>inject()</code> field initializers must run inside the
          injection context the constructor opens — class-field semantics
          would evaluate them too early.
        </p>
      </blockquote>

      <h2>2 · A store</h2>
      <CodeBlock
        file="todo.store.ts"
        code={`import { Injectable, signal, computed } from '@preact-mvc/core';

export interface Todo { id: number; text: string; done: boolean }

@Injectable()
export class TodoStore {
  todos = signal<Todo[]>([]);
  remaining = computed(() => this.todos.value.filter(t => !t.done).length);

  add(text: string) {
    this.todos.value = [
      ...this.todos.value,
      { id: Date.now(), text, done: false },
    ];
  }
}`}
      />

      <h2>3 · A controller</h2>
      <CodeBlock
        file="todo.controller.ts"
        code={`import { Controller, inject, signal } from '@preact-mvc/core';
import { TodoStore } from './todo.store';

@Controller()
export class TodoController {
  private store = inject(TodoStore);
  draft = signal('');

  submit() {
    const text = this.draft.value.trim();
    if (text) this.store.add(text);
    this.draft.value = '';
  }
}`}
      />

      <h2>4 · A view</h2>
      <CodeBlock
        file="todo.view.tsx"
        language="tsx"
        code={`import { Component, View, inject } from '@preact-mvc/core';
import { TodoController } from './todo.controller';
import { TodoStore } from './todo.store';

@Component({ controllers: [TodoController] })
export class TodoView extends View {
  private c = inject(TodoController);
  private store = inject(TodoStore);

  render() {
    return (
      <section>
        <h2>Todos ({this.store.remaining.value} left)</h2>
        <input
          value={this.c.draft.value}
          onInput={(e) => (this.c.draft.value = e.currentTarget.value)}
        />
        <button onClick={() => this.c.submit()}>add</button>
        <ul>
          {this.store.todos.value.map((t) => (
            <li key={t.id}>{t.text}</li>
          ))}
        </ul>
      </section>
    );
  }
}`}
      />

      <h2>5 · The module declares it all</h2>
      <CodeBlock
        file="todo.module.ts"
        code={`import { Module } from '@preact-mvc/core';
import { TodoStore } from './todo.store';
import { TodoView } from './todo.view';

@Module({
  providers: [TodoStore],
  components: [TodoView],
  bootstrap: [TodoView],
})
export class TodoModule {}`}
      />

      <h2>6 · Bootstrap</h2>
      <CodeBlock
        file="main.tsx"
        language="tsx"
        code={`import { bootstrap } from '@preact-mvc/core';
import { TodoModule } from './todo.module';

bootstrap(TodoModule, document.getElementById('app')!);`}
      />

      <h2>What just happened</h2>
      <ul>
        <li>
          <code>bootstrap</code> created the app injector from{' '}
          <code>TodoModule</code>, mounted its bootstrap view inside it, and
          installed the JSX interop that turns View classes into host
          components.
        </li>
        <li>
          The view's injector resolved <code>TodoStore</code> (declared on the
          module) and the declared <code>TodoController</code> — once, at
          mount. <code>render()</code> is plain code; signals re-render it.
        </li>
      </ul>
      <p>
        Next: <a href={docHref('di')}>dependency injection</a> for provider
        forms and scopes, or <a href={docHref('router')}>the router</a> to add
        routes.
      </p>
    </article>
  );
}
