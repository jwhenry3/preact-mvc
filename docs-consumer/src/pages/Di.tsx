import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function Di() {
  return (
    <article>
      <h1>Dependency injection</h1>
      <p class="lead">
        A hierarchical injector resolves services by scope: each module and
        each mounted view gets its own injector, parents delegate upward, and
        where a provider is registered decides who shares the instance.
      </p>

      <h2>Providers</h2>
      <p>Four provider forms, same as Angular:</p>
      <CodeBlock
        code={`@Module({
  providers: [
    TodoStore,                                   // class → singleton per scope
    { provide: API_URL, useValue: '/api/v2' },   // value
    { provide: Logger, useClass: HttpLogger },   // alias another class
    { provide: QueryClient, useFactory: () => new QueryClient() }, // factory
    { provide: Clock, useFactory: (api: Api) => new Clock(api), deps: [Api] },
  ],
})
class AppModule {}`}
      />
      <p>
        <code>InjectionToken&lt;T&gt;</code> gives non-class dependencies a
        typed, rename-safe key:
      </p>
      <CodeBlock
        code={`export const API_URL = new InjectionToken<string>('API_URL');

// consumer side
private apiUrl = inject(API_URL);`}
      />

      <h2>inject() — construction-time only</h2>
      <p>
        <code>inject()</code> reads from the injector that is currently
        constructing the instance. It belongs in field initializers or the
        constructor — never in <code>render()</code>, callbacks, or async
        work, where it throws <code>No active injection context</code>:
      </p>
      <CodeBlock
        code={`@Component()
export class TodoView extends View {
  private store = inject(TodoStore);      // field initializer — correct
  private c = inject(TodoController);     // resolved in this view's scope

  render() {
    // inject(Anything) here would throw — render is not a context
    return <p>{this.store.todos.value.length}</p>;
  }
}`}
      />
      <p>
        For code outside construction — a factory, an integration helper —
        wrap the call in <code>runInInjectionContext(injector, fn)</code>, or
        read the injector with <code>getCurrentInjector()</code> during
        construction and call <code>injector.get(token)</code> later.
      </p>

      <h2>Scoping — where a provider lives decides its lifetime</h2>
      <table class="doc-table">
        <thead>
          <tr>
            <th>Registered on</th>
            <th>Instance lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>providedIn: 'root'</code> on <code>@Injectable</code></td>
            <td>One for the whole app, resolved from the root injector</td>
          </tr>
          <tr>
            <td><code>@Module(&#123; providers &#125;)</code></td>
            <td>One per module injector — shared by every route, view, and controller under that module</td>
          </tr>
          <tr>
            <td><code>@Component(&#123; providers &#125;)</code></td>
            <td>One per mounted view instance — the view's own Angular-style component providers</td>
          </tr>
          <tr>
            <td>Declared <code>controllers</code> (module or component)</td>
            <td>Shared down that injector's subtree</td>
          </tr>
          <tr>
            <td>Undeclared <code>@Controller</code> / injectable</td>
            <td>Transient — a fresh instance per injecting scope</td>
          </tr>
        </tbody>
      </table>
      <p>
        Resolution walks the chain view → route module → app → root. A closer
        registration shadows a farther one — an Angular-style override at any
        level.
      </p>

      <h2>Lifecycle and cleanup</h2>
      <p>
        Every injector owns a <code>DestroyRef</code>. Inject it during
        construction and register teardown — it fires when the scope
        deactivates (view unmounts, module injector is released):
      </p>
      <CodeBlock
        code={`@Injectable()
export class ThemeService {
  theme = signal<Theme>(this.readStored());

  constructor() {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => this.theme.value = 'system';
    mq.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() =>
      mq.removeEventListener('change', onChange));
  }
}`}
      />
      <p>
        Views and controllers implement <code>onInit()</code>/
        <code>onDestroy()</code> — called when their scope activates and
        deactivates, guaranteed paired even on same-tick mount/unmount. See{' '}
        <a href={docHref('views')}>Views & lifecycle</a>.
      </p>
    </article>
  );
}
