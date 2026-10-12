import { Component, View, inject } from '@preact-mvc/core';
import { TodoController } from './todo.controller';

// View layer as a class: injection happens once at mount inside this view's
// own injector scope. render() is a pure JSX projection — it reads signals
// (auto-tracked) and delegates events to the controller.
// Declaring the controller here registers it in this view's scope — shared
// with any nested views, per-instance of the mounted view.
@Component({ controllers: [TodoController] })
export class TodoView extends View {
  private c = inject(TodoController);

  render() {
    const c = this.c;
    return (
      <section>
        <h2>Todos</h2>
        <p>{c.remaining.value} remaining</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            c.submit();
          }}
        >
          <input
            placeholder="What needs doing?"
            value={c.draft.value}
            onInput={(e) => (c.draft.value = (e.target as HTMLInputElement).value)}
          />
          <button type="submit">Add</button>
        </form>
        <ul>
          {c.todos.value.map((t) => (
            <li key={t.id}>
              <label style={{ textDecoration: t.done ? 'line-through' : 'none' }}>
                <input type="checkbox" checked={t.done} onChange={() => c.toggle(t.id)} /> {t.text}
              </label>{' '}
              <button onClick={() => c.remove(t.id)}>✕</button>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}
