import { Component, View, inject, RouterOutlet, Link } from '@preact-mvc/core';
import { SessionService } from './core/session.service';
import { APP_TITLE } from './core/tokens';

@Component()
export class AppShell extends View {
  private session = inject(SessionService);
  private title = inject(APP_TITLE);

  render() {
    return (
      <div class="app">
        <header>
          <h1>{this.title}</h1>
          <nav>
            <Link to="/todos">Todos</Link> <Link to="/counter">Counter</Link>{' '}
            <Link to="/hello/ada">Hello</Link> <Link to="/island">Islands</Link>
            <span class="session">
              {this.session.user.value.name} — visits: {this.session.visits.value}
            </span>
          </nav>
        </header>
        <main>
          <RouterOutlet />
        </main>
      </div>
    );
  }
}
