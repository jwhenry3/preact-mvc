import { CodeBlock } from '../components/CodeBlock';
import { docHref } from '../link';

export function IslandProtocol() {
  return (
    <article>
      <h1>How it works</h1>
      <p class="lead">
        The worker never touches DOM. It renders into a proxy document whose
        every mutation serializes to an op; the main-thread driver replays
        those ops onto real nodes and routes real events back. Everything
        else — instances, emit, callbacks — is built on that one stream.
      </p>

      <h2>The op protocol</h2>
      <p>
        A small vocabulary covers every DOM effect (modeled on the Atoll
        islands design — see <code>docs/atoll/</code> in the repo for the
        original architecture docs this implements):
      </p>
      <table class="doc-table">
        <thead>
          <tr><th>Op</th><th>Effect on the shell DOM</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create</code></td><td>Allocate a node id for a tag/text node</td></tr>
          <tr><td><code>text</code></td><td>Set a text node's data</td></tr>
          <tr><td><code>append</code> / <code>insertBefore</code> / <code>remove</code></td><td>Tree structure</td></tr>
          <tr><td><code>attr</code> / <code>style</code></td><td>Attributes and inline style</td></tr>
          <tr><td><code>listen</code></td><td>Register a handler id for an event name on a node</td></tr>
          <tr><td><code>emit</code></td><td>Worker → shell named event (lands on <code>onEvent</code>)</td></tr>
        </tbody>
      </table>

      <h2>The proxy DOM</h2>
      <p>
        Inside the worker, <code>document</code> resolves to a{' '}
        <code>ProxyDocument</code> — enough of the DOM surface for Preact to
        render against (<code>createElement</code>,{' '}
        <code>createTextNode</code>, <code>insertBefore</code>,{' '}
        <code>removeChild</code>, <code>data</code>, <code>innerHTML</code>,{' '}
        <code>style</code>, <code>addEventListener</code>) where every method
        appends ops to the instance's queue instead of mutating anything.
      </p>
      <CodeBlock
        side="worker"
        code={`// Inside the worker, this Preact render:
<button onClick={inc}>count: {n}</button>

// …serializes to roughly:
//   create #1 'button'
//   create #2 text 'count: 0'
//   append #1 <- #2
//   listen #1 'click' handler#7
//   append body <- #1`}
        language="tsx"
      />

      <h2>Instance scoping</h2>
      <p>
        Each mounted island is an instance keyed <code>app@N</code> with its
        own op queue, handler table, and proxy document. Ambient{' '}
        <code>document</code> in worker code resolves through the
        active-instance dispatcher: inside a Preact render or an event
        handler, the current instance is tracked explicitly (a render-scope
        hook tags vnodes), so concurrent islands in one worker never cross
        streams.
      </p>
      <p>
        Timer/signal-driven updates happen <em>outside</em> any dispatched
        task: signal writes re-render the island, the instance re-enters its
        scope, and the op batch pushes to the shell unsolicited — that's why
        a worker clock keeps ticking with zero shell involvement.
      </p>

      <h2>Events: shell → worker</h2>
      <p>
        The driver attaches real listeners for every <code>listen</code> op.
        A DOM event serializes into a small payload (type, target node id,
        plus the fields islands care about) and posts to the worker, which
        looks up the handler id and invokes the Preact listener — the same
        function the app registered.
      </p>

      <h2>Mount lifecycle</h2>
      <p>
        <code>connectIslandWorker</code> wraps the worker in a tiny RPC
        client (mount/update/dispatch/setSize/unmount).{' '}
        <code>mountIsland</code> sends the app name + initial props, replays
        ops as they stream back, wires <code>ResizeObserver</code> to push
        size changes into the worker, and enforces a mount timeout so a
        failed worker surfaces as an error state instead of a blank box.
      </p>
      <blockquote>
        <p>
          Deep internals — per-instance state, the render-scope tracking, the
          in-process test transport — live in the repo's{' '}
          <code>docs/islands.md</code>. This page is the consumer-facing
          model; that doc is the invariant list.
        </p>
      </blockquote>
    </article>
  );
}
