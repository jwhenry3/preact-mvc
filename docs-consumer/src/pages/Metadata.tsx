import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function Metadata() {
  return (
    <article>
      <h1>Component metadata</h1>
      <p class="lead">
        <code>@Component</code> is where a view declares its slice of the
        world: scoped providers, module imports for standalone-style
        composition, and the controllers its subtree shares.
      </p>

      <h2>The three fields</h2>
      <CodeBlock
        code={`@Component({
  providers:   [DraftStore],            // this view's own scope only
  controllers: [EditorController],      // shared with the whole subtree
  imports:     [SharedModule],          // pull a module's providers in scope
})
export class EditorView extends View { /* … */ }`}
      />
      <table class="doc-table">
        <thead>
          <tr><th>Field</th><th>Effect</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>providers</code></td>
            <td>
              Component-level providers, Angular-style: one instance per
              mounted view, visible to the view and its descendants. Overrides
              a module provider of the same token for this subtree.
            </td>
          </tr>
          <tr>
            <td><code>controllers</code></td>
            <td>
              Registered in the view's injector — parent and nested child
              views injecting the same controller share one instance. See{' '}
              <a href={docHref('controllers')}>Controllers</a>.
            </td>
          </tr>
          <tr>
            <td><code>imports</code></td>
            <td>
              Standalone-component imports: the module's providers and
              declared components join <em>this view's</em> scope, no module
              needed. See below.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Standalone views: imports without a module</h2>
      <p>
        A view that isn't declared by any module can still pull a module's
        providers into its own injector — Angular's{' '}
        <code>standalone: true</code> + <code>imports</code> pattern:
      </p>
      <CodeBlock
        file="shared.module.ts"
        code={`@Module({ providers: [ThemeService] })
export class SharedModule {}

// hello.view.tsx — declared in NO module, still gets ThemeService:
@Component({ imports: [SharedModule] })
export class HelloView extends View {
  private theme = inject(ThemeService); // resolved from the imported module
  render() { /* … */ }
}`}
      />
      <p>
        The imported module's declared components are also mountable inside
        this view's subtree — the ownership check treats the view's injector
        as part of that module's closure.
      </p>

      <h2>Choosing a scope</h2>
      <table class="doc-table">
        <thead>
          <tr><th>Need</th><th>Declare on</th></tr>
        </thead>
        <tbody>
          <tr><td>App-wide singleton</td><td><code>@Injectable(&#123; providedIn: 'root' &#125;)</code> or root module providers</td></tr>
          <tr><td>Feature-wide state</td><td><code>@Module(&#123; providers &#125;)</code></td></tr>
          <tr><td>Per-screen state reset on navigation</td><td><code>@Component(&#123; providers &#125;)</code></td></tr>
          <tr><td>Shared form/interaction controller</td><td><code>@Component(&#123; controllers &#125;)</code></td></tr>
          <tr><td>Module-less view needing module services</td><td><code>@Component(&#123; imports &#125;)</code></td></tr>
        </tbody>
      </table>
    </article>
  );
}
