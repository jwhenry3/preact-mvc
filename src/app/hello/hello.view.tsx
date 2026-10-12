import { Component, View, inject, computed, Router } from '@preact-mvc/core';
import { SharedModule } from '../shared/shared.module';
import { ThemeService } from '../shared/theme.service';

// Standalone component: declared in NO module, mounts anywhere, yet still
// pulls SharedModule's providers into its own injector via `imports` —
// Angular's standalone-component model.
@Component({ imports: [SharedModule] })
export class HelloView extends View {
  private router = inject(Router);
  private theme = inject(ThemeService); // provided by the imported module
  private name = computed(() => this.router.params.value.name ?? 'stranger');

  render() {
    return (
      <section>
        <h2 style={this.theme.headingStyle}>Hello, {this.name.value}!</h2>
        <p>
          Try <code>/hello/world</code> — the name comes from a <code>:name</code> route param. The
          accent color comes from a module this component imported itself.
        </p>
      </section>
    );
  }
}
