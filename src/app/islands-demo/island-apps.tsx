/**
 * Island app components — WORKER SIDE ONLY. Imported by demo.worker.ts and
 * never by the shell: the shell reaches these by registry key ('counter',
 * 'clock'). Everything here runs inside the worker against the proxy DOM;
 * `@Component`, `View`, signals, inject() all work unchanged because the
 * framework's machinery is realm-agnostic.
 */
import { Component, View, signal } from '@preact-mvc/core';
import { emit } from '@preact-mvc/atoll-island/worker';

@Component()
export class CounterIsland extends View<{ start?: number; label?: string }> {
  count = signal(this.props.start ?? 0);

  render() {
    return (
      <div class="island-card">
        <h3>{this.props.label ?? 'Worker counter'}</h3>
        <button
          onClick={() => {
            this.count.value++;
            if (this.count.value % 5 === 0) emit('milestone', { count: this.count.value });
          }}
        >
          count: {this.count.value}
        </button>
      </div>
    );
  }
}

@Component()
export class ClockIsland extends View {
  time = signal(new Date().toLocaleTimeString());
  private timer: ReturnType<typeof setInterval> | undefined;

  onInit() {
    // Out-of-task signal writes: each tick re-renders in the worker and the
    // op batch pushes to the driver on a microtask — no task call needed.
    this.timer = setInterval(() => (this.time.value = new Date().toLocaleTimeString()), 1000);
  }
  onDestroy() {
    clearInterval(this.timer);
  }

  render() {
    return (
      <div class="island-card">
        <h3>Worker clock</h3>
        <p class="island-clock">{this.time.value}</p>
        <p class="muted">This text re-renders entirely inside the worker.</p>
      </div>
    );
  }
}
