import { Component, View, inject, signal, computed } from '@preact-mvc/core';
import type { OnInit } from '@preact-mvc/core';
import { SessionService } from '../core/session.service';

// The other end of the spectrum: no separate controller — the component class
// holds its own signals (React-style freedom) while still participating in
// mount-time DI and lifecycle.
@Component()
export class CounterView extends View implements OnInit {
  private session = inject(SessionService); // root-scoped, shared with todos

  count = signal(0);
  doubled = computed(() => this.count.value * 2);

  onInit() {
    this.session.recordVisit();
  }

  render() {
    return (
      <section>
        <h2>Counter</h2>
        <p>
          Count: {this.count.value} (doubled: {this.doubled.value})
        </p>
        <button onClick={() => (this.count.value -= 1)}>−</button>{' '}
        <button onClick={() => (this.count.value += 1)}>+</button>
        <p>Page visits this session: {this.session.visits.value}</p>
      </section>
    );
  }
}
