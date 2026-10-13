# @preact-mvc/core

[![CI](https://github.com/jwhenry3/preact-mvc/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jwhenry3/preact-mvc/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jwhenry3/preact-mvc/graph/badge.svg?branch=main)](https://codecov.io/gh/jwhenry3/preact-mvc)
[![Socket Badge](https://badge.socket.dev/npm/package/@preact-mvc/core)](https://badge.socket.dev/npm/package/@preact-mvc/core)

Angular-inspired architecture rendered by Preact: `@Module`/`@Component`
decorators, hierarchical dependency injection, class-based `View`
components, controllers, an injector-scoped router, and signal reactivity
via `@preact/signals` — all over plain JSX, with no template compiler.

**[PreactMVC — documentation](https://jwhenry3.github.io/preact-mvc/docs/overview/)**

## Install

```bash
npm install @preact-mvc/core preact @preact/signals
```

Point JSX at Preact (`tsconfig.json`):

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

## A view is a class

`View` subclasses are constructed once per mount inside their own injector
scope — `inject()` works in field initializers and constructors, `render()`
stays hook-free, and signals drive re-rendering:

```tsx
import { Component, View, inject, signal, computed } from '@preact-mvc/core';

@Component()
export class CounterView extends View {
  count = signal(0);
  doubled = computed(() => this.count.value * 2);

  render() {
    return (
      <section>
        <button onClick={() => (this.count.value -= 1)}>−</button>
        <span>{this.count.value}</span>
        <button onClick={() => (this.count.value += 1)}>+</button>
        <p>doubled: {this.doubled.value}</p>
      </section>
    );
  }
}
```

## Modules are the app map

```ts
import { Module, RouterModule } from '@preact-mvc/core';
import { AppShell } from './app.shell';
import { routes } from './app.routes';

@Module({
  imports: [RouterModule.forRoot(routes)],
  providers: [{ provide: API_URL, useValue: '/api' }],
  bootstrap: [AppShell],
})
export class AppModule {}
```

```ts
// main.tsx
import { bootstrap } from '@preact-mvc/core';
import { AppModule } from './app/app.module';

bootstrap(AppModule, document.getElementById('app')!);
```

`components`/`bootstrap` declarations are enforced ownership: a declared
view may only mount where its module's injector is an ancestor.
Undeclared views mount anywhere — structure is opt-in per declaration.

## DI, controllers, router

- `@Injectable`/`@Controller` classes resolve through the element-injector
  hierarchy — view providers → module providers → root, closest scope wins.
- `OnInit`/`OnDestroy` lifecycle plus `DestroyRef` make teardown
  declaration-driven instead of `useEffect` cleanup.
- `RouterModule.forRoot(routes)` + `<RouterOutlet/>` + `<Link/>` give you
  nested routes whose `module` boundaries get their own child injectors.

Published builds ship compiled `dist/` (`.js` + `.d.ts`).
