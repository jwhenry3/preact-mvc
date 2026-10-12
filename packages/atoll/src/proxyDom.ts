/**
 * The worker-side proxy DOM — modeled on Atoll's
 * `packages/islands/src/worker/dom/*` (docs/atoll/islands-worker.md).
 *
 * A DOM-free surface: every mutation serializes to an op on the owning
 * instance's queue; the main-thread driver replays them onto real DOM.
 * Reads traverse the shadow tree (`children`, `firstChild`, `nextSibling`,
 * `closest`, `textContent`); geometry is the one honest box — the pushed
 * container size on `body`/marked elements, honest 0 elsewhere.
 *
 * Reflected-property accessors (`id`, `value`, `checked`, `className`…)
 * exist as real prototype accessors because Preact's prop diffing picks the
 * property path only when `name in dom` — every other name falls through to
 * `setAttribute`, which is what we want.
 */
import { pushOp, registerHandler, getHandler, setInstanceSize, instances } from './instance';
import type { EventPayload, Op } from './ops';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface ListenerRec {
  type: string;
  fn: (e: unknown) => void;
  opts?: { once?: boolean; passive?: boolean; capture?: boolean };
  handlerId: number;
}

export abstract class ProxyNode {
  readonly nodeId: number;
  abstract readonly nodeType: number;
  parentNode: ProxyElement | null = null;
  childNodes: ProxyNode[] = [];
  /** Expandos Preact writes (`__e`, `__k`, `l`, `_listeners`…) land here
   *  naturally — own properties never emit ops. */
  [key: string]: unknown;

  constructor(public doc: ProxyDocument, id?: number) {
    this.nodeId = id ?? doc.allocNode(this);
  }

  get ownerDocument(): ProxyDocument {
    return this.doc;
  }
  get nextSibling(): ProxyNode | null {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[i + 1] ?? null;
  }
  get previousSibling(): ProxyNode | null {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return i > 0 ? this.parentNode.childNodes[i - 1] : null;
  }
  get firstChild(): ProxyNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): ProxyNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get isConnected(): boolean {
    let n: ProxyNode = this;
    while (n.parentNode) n = n.parentNode;
    return n.nodeId === 0; // connected = parented to the island root
  }

  appendChild<N extends ProxyNode>(child: N): N {
    return this.insertBefore(child, null);
  }

  insertBefore<N extends ProxyNode>(child: N, ref: ProxyNode | null): N {
    if (child.parentNode) child.parentNode.removeChild(child);
    const parent = this as unknown as ProxyElement;
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx === -1) this.childNodes.push(child);
    else this.childNodes.splice(idx, 0, child);
    child.parentNode = parent;
    pushOp(this.doc.instance, {
      t: 'append',
      parent: this.nodeId,
      child: child.nodeId,
      ...(ref ? { before: ref.nodeId } : {}),
    });
    return child;
  }

  removeChild<N extends ProxyNode>(child: N): N {
    const i = this.childNodes.indexOf(child);
    if (i !== -1) {
      this.childNodes.splice(i, 1);
      child.parentNode = null;
      pushOp(this.doc.instance, { t: 'remove', child: child.nodeId });
    }
    return child;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  get textContent(): string {
    return '';
  }
  set textContent(text: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    pushOp(this.doc.instance, { t: 'utext', id: this.nodeId, text });
  }
}

export class ProxyText extends ProxyNode {
  readonly nodeType: number = 3;
  readonly nodeName: string = '#text';
  private _data: string;

  constructor(doc: ProxyDocument, text: string, id?: number) {
    super(doc, id);
    this._data = text;
  }

  get data(): string {
    return this._data;
  }
  set data(v: string) {
    this._data = v;
    pushOp(this.doc.instance, { t: 'utext', id: this.nodeId, text: v });
  }
  get nodeValue(): string {
    return this._data;
  }
  set nodeValue(v: string) {
    this.data = v;
  }
  get textContent(): string {
    return this._data;
  }
  set textContent(v: string) {
    this.data = v;
  }
}

export class ProxyComment extends ProxyText {
  readonly nodeType: number = 8;
  readonly nodeName: string = '#comment';
}

const kebab = (k: string): string => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

class ProxyStyle {
  [key: string]: unknown;
  private _values = new Map<string, string>();
  constructor(private el: ProxyElement) {}

  private emit(): void {
    // style ops are merged sets — send the full known set; '' clears keys.
    const props: Record<string, string> = {};
    for (const [k, v] of this._values) props[k] = v;
    pushOp(this.el.doc.instance, { t: 'style', id: this.el.nodeId, props });
  }

  setProperty(k: string, v: string): void {
    this._values.set(k, v);
    this.emit();
  }
  removeProperty(k: string): void {
    this._values.delete(k);
    this._values.set(k, '');
    this.emit();
    this._values.delete(k);
  }
  getPropertyValue(k: string): string {
    return this._values.get(k) ?? '';
  }
  set cssText(v: string) {
    this._values.clear();
    this._values.set('cssText', v);
    this.emit();
    this._values.delete('cssText');
    if (v) for (const part of v.split(';')) {
      const i = part.indexOf(':');
      if (i > 0) this._values.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }
  get cssText(): string {
    return [...this._values.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
  }
}

export class ProxyElement extends ProxyNode {
  readonly nodeType = 1;
  readonly namespaceURI: string;
  listeners: ListenerRec[] = [];
  private attrs = new Map<string, string>();
  private _classes = new Set<string>();
  private _innerHTML = '';
  private isContainer = false;
  private _style: ProxyStyle;

  constructor(doc: ProxyDocument, public localName: string, ns: string = HTML_NS, id?: number) {
    super(doc, id);
    this.namespaceURI = ns;
    this._style = new ProxyStyle(this);
  }

  get nodeName(): string {
    return this.localName.toUpperCase();
  }
  get tagName(): string {
    return this.nodeName;
  }
  get children(): ProxyElement[] {
    return this.childNodes.filter((n): n is ProxyElement => n.nodeType === 1);
  }

  // --- attributes -----------------------------------------------------------

  setAttribute(name: string, value: unknown): void {
    const v = String(value);
    this.attrs.set(name, v);
    pushOp(this.doc.instance, { t: 'attr', id: this.nodeId, name, value: v });
  }
  setAttributeNS(_ns: string, name: string, value: unknown): void {
    this.setAttribute(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
    pushOp(this.doc.instance, { t: 'attr', id: this.nodeId, name, value: null });
  }

  // --- reflected properties (emit `prop` ops) --------------------------------

  private prop(name: string, value: unknown): void {
    pushOp(this.doc.instance, { t: 'prop', id: this.nodeId, name, value });
  }
  /** Set a property without emitting — used to stamp dispatched form state
   *  (the real DOM already has it; the op would bounce it back). */
  setSilent(name: string, value: unknown): void {
    (this as unknown as Record<string, unknown>)[`__s_${name}`] = value;
  }
  private silentGet(name: string): unknown {
    return (this as unknown as Record<string, unknown>)[`__s_${name}`];
  }

  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  set id(v: string) {
    this.attrs.set('id', v);
    this.prop('id', v);
  }
  get className(): string {
    return this.attrs.get('class') ?? '';
  }
  set className(v: string) {
    this.attrs.set('class', v);
    this.prop('className', v);
  }
  get value(): string {
    return (this.silentGet('value') as string) ?? this.attrs.get('value') ?? '';
  }
  set value(v: string) {
    this.setSilent('value', v);
    this.prop('value', v);
  }
  get checked(): boolean {
    return (this.silentGet('checked') as boolean) ?? false;
  }
  set checked(v: boolean) {
    this.setSilent('checked', v);
    this.prop('checked', v);
  }
  get selected(): boolean {
    return (this.silentGet('selected') as boolean) ?? false;
  }
  set selected(v: boolean) {
    this.setSilent('selected', v);
    this.prop('selected', v);
  }
  get disabled(): boolean {
    return (this.silentGet('disabled') as boolean) ?? this.attrs.has('disabled');
  }
  set disabled(v: boolean) {
    this.setSilent('disabled', v);
    this.prop('disabled', v);
  }
  get readOnly(): boolean {
    return (this.silentGet('readOnly') as boolean) ?? false;
  }
  set readOnly(v: boolean) {
    this.setSilent('readOnly', v);
    this.prop('readOnly', v);
  }
  get tabIndex(): number {
    return (this.silentGet('tabIndex') as number) ?? -1;
  }
  set tabIndex(v: number) {
    this.setSilent('tabIndex', v);
    this.prop('tabIndex', v);
  }
  get title(): string {
    return this.attrs.get('title') ?? '';
  }
  set title(v: string) {
    this.attrs.set('title', v);
    this.prop('title', v);
  }
  get href(): string {
    return this.attrs.get('href') ?? '';
  }
  set href(v: string) {
    this.attrs.set('href', v);
    this.prop('href', v);
  }
  get src(): string {
    return this.attrs.get('src') ?? '';
  }
  set src(v: string) {
    this.attrs.set('src', v);
    this.prop('src', v);
  }
  get scrollTop(): number {
    return (this.silentGet('scrollTop') as number) ?? 0;
  }
  set scrollTop(v: number) {
    this.setSilent('scrollTop', v);
    this.prop('scrollTop', v);
  }

  // --- style / dataset / classList -------------------------------------------

  get style(): ProxyStyle {
    return this._style;
  }
  set style(v: unknown) {
    if (typeof v === 'string') this._style.cssText = v;
    else if (v && typeof v === 'object')
      for (const [k, val] of Object.entries(v)) this._style.setProperty(kebab(k), String(val));
  }

  get dataset(): Record<string, string> {
    const el = this;
    return new Proxy({} as Record<string, string>, {
      get: (_t, k: string) => el.attrs.get(`data-${kebab(k)}`) ?? undefined,
      set: (_t, k: string, v: string) => {
        el.setAttribute(`data-${kebab(k)}`, v);
        return true;
      },
      deleteProperty: (_t, k: string) => {
        el.removeAttribute(`data-${kebab(k)}`);
        return true;
      },
    });
  }

  get classList() {
    const el = this;
    const sync = (): void => el.setAttribute('class', [...el._classes].join(' '));
    return {
      add: (...cs: string[]) => {
        cs.forEach((c) => el._classes.add(c));
        sync();
      },
      remove: (...cs: string[]) => {
        cs.forEach((c) => el._classes.delete(c));
        sync();
      },
      toggle: (c: string, force?: boolean) => {
        const on = force ?? !el._classes.has(c);
        on ? el._classes.add(c) : el._classes.delete(c);
        sync();
        return on;
      },
      contains: (c: string) => el._classes.has(c),
    };
  }

  // --- content ----------------------------------------------------------------

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    pushOp(this.doc.instance, { t: 'html', id: this.nodeId, html });
  }

  get textContent(): string {
    const walk = (n: ProxyNode): string =>
      n.nodeType === 3 || n.nodeType === 8
        ? (n as ProxyText).data
        : n.childNodes.map(walk).join('');
    return walk(this);
  }
  set textContent(text: string) {
    this._innerHTML = '';
    super.textContent = text;
  }

  // --- queries ---------------------------------------------------------------

  private matches(sel: string): boolean {
    if (sel.startsWith('.')) return (this.attrs.get('class') ?? '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('#')) return this.attrs.get('id') === sel.slice(1);
    if (sel.startsWith('[')) {
      const m = /\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/.exec(sel);
      if (!m) return false;
      const v = this.attrs.get(m[1]);
      return m[2] === undefined ? v !== undefined : v === m[2];
    }
    return this.localName === sel.toLowerCase();
  }

  private *descendants(): Generator<ProxyElement> {
    for (const c of this.childNodes) {
      if (c.nodeType === 1) {
        yield c as ProxyElement;
        yield* (c as ProxyElement).descendants();
      }
    }
  }

  querySelector(sel: string): ProxyElement | null {
    for (const d of this.descendants()) if (d.matches(sel)) return d;
    return null;
  }
  querySelectorAll(sel: string): ProxyElement[] {
    return [...this.descendants()].filter((d) => d.matches(sel));
  }
  getElementById(id: string): ProxyElement | null {
    for (const d of this.descendants()) if (d.attrs.get('id') === id) return d;
    return null;
  }
  getElementsByTagName(tag: string): ProxyElement[] {
    return [...this.descendants()].filter((d) => d.localName === tag.toLowerCase());
  }
  getElementsByClassName(cls: string): ProxyElement[] {
    return [...this.descendants()].filter((d) => d.matches('.' + cls));
  }
  closest(sel: string): ProxyElement | null {
    let n: ProxyNode | null = this as unknown as ProxyNode;
    while (n) {
      if (n.nodeType === 1 && (n as ProxyElement).matches(sel)) return n as ProxyElement;
      n = n.parentNode;
    }
    return null;
  }
  contains(node: ProxyNode): boolean {
    let n: ProxyNode | null = node;
    while (n) {
      if (n === this) return true;
      n = n.parentNode;
    }
    return false;
  }

  // --- events ------------------------------------------------------------------

  addEventListener(
    type: string,
    fn: (e: unknown) => void,
    opts?: boolean | { once?: boolean; passive?: boolean; capture?: boolean },
  ): void {
    const o = typeof opts === 'boolean' ? { capture: opts } : opts;
    if (this.listeners.some((l) => l.type === type && l.fn === fn)) return;
    const rec = this as unknown as ProxyElement;
    const handlerId = registerHandler(this.doc.instance, (payload) => {
      const wrapped = this.doc.wrapEvent(payload as EventPayload, rec);
      fn.call(rec, wrapped);
      if (o?.once) rec.removeEventListener(type, fn, opts);
    });
    this.listeners.push({ type, fn, opts: o, handlerId });
    pushOp(this.doc.instance, {
      t: 'listen',
      id: this.nodeId,
      type,
      handler: handlerId,
      ...(o ? { opts: o } : {}),
    });
  }

  removeEventListener(
    type: string,
    fn: (e: unknown) => void,
    opts?: boolean | { once?: boolean; passive?: boolean; capture?: boolean },
  ): void {
    const o = typeof opts === 'boolean' ? { capture: opts } : opts;
    const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i === -1) return;
    const [rec] = this.listeners.splice(i, 1);
    pushOp(this.doc.instance, {
      t: 'unlisten',
      id: this.nodeId,
      type,
      handler: rec.handlerId,
      ...(o ? { opts: o } : {}),
    });
  }

  dispatchEvent(_e: unknown): boolean {
    return true;
  }

  // --- geometry / misc -----------------------------------------------------------

  private rect() {
    const s = this.doc.sizeOf(this);
    return { x: 0, y: 0, top: 0, left: 0, right: s.w, bottom: s.h, width: s.w, height: s.h };
  }
  getBoundingClientRect() {
    return this.rect();
  }
  get clientWidth(): number {
    return this.doc.sizeOf(this).w;
  }
  get clientHeight(): number {
    return this.doc.sizeOf(this).h;
  }
  get offsetWidth(): number {
    return this.doc.sizeOf(this).w;
  }
  get offsetHeight(): number {
    return this.doc.sizeOf(this).h;
  }

  focus(): void {}
  blur(): void {}
  click(): void {
    this.dispatchEvent({ type: 'click' });
  }
  markContainer(): void {
    this.isContainer = true;
  }
  get isContainerEl(): boolean {
    return this.isContainer;
  }

  cloneNode(deep = false): ProxyElement {
    const el = this.doc.wrap(new ProxyElement(this.doc, this.localName, this.namespaceURI));
    for (const [k, v] of this.attrs) el.setAttribute(k, v);
    if (deep)
      for (const c of this.childNodes) {
        if (c.nodeType === 1) el.appendChild((c as ProxyElement).cloneNode(true));
        else el.appendChild(new ProxyText(this.doc, (c as ProxyText).data));
      }
    return el;
  }
}

interface ProxyDocumentInit {
  instance: string;
}

export class ProxyDocument {
  readonly instance: string;
  private nextId = 1;
  nodes = new Map<number, ProxyNode>();
  readonly body: ProxyElement;
  readonly documentElement: ProxyElement;
  readonly head: ProxyElement;
  private containers = new Set<number>();
  private elementCache = new WeakMap<ProxyElement, ProxyElement>();
  /** Ops emitted for detached (never-appended) nodes still land in the
   *  instance queue — harmless: the driver creates orphans that are never
   *  parented. */

  constructor({ instance }: ProxyDocumentInit) {
    this.instance = instance;
    // Node id 0 IS the island container on the driver: body/documentElement
    // both alias it, so `render(v, doc.body)` appends into the real el.
    this.body = this.wrap(new ProxyElement(this, 'body', HTML_NS, 0));
    this.documentElement = this.body;
    this.head = this.wrap(new ProxyElement(this, 'head', HTML_NS, 0x7fffffff));
    this.body.markContainer();
    instances.get(instance)!.doc = this;
  }

  /** Wrap an element in a Proxy whose `has` trap reports lowercase `on*`
   *  names as present — Preact's prop diff decides the event-handler dict
   *  key via `'onclick' in el`, and on the bare class that check fails, so
   *  listeners would be stored under `'Click'` while the event proxy
   *  dispatches `e.type` ('click'). Cached so identity stays stable. */
  wrap<T extends ProxyElement>(el: T): T {
    let w = this.elementCache.get(el);
    if (!w) {
      w = new Proxy(el, {
        has: (t, k) => k in t || (typeof k === 'string' && /^on[a-z]/.test(k)),
      }) as T;
      this.elementCache.set(el, w);
    }
    return w as T;
  }

  allocNode(n: ProxyNode): number {
    const id = this.nextId++;
    this.nodes.set(id, n);
    return id;
  }
  nodeById(id: number): ProxyNode | undefined {
    const n = id === 0 ? this.body : this.nodes.get(id);
    return n instanceof ProxyElement ? this.wrap(n) : n;
  }

  createElement(tag: string): ProxyElement {
    const el = this.wrap(new ProxyElement(this, tag.toLowerCase(), HTML_NS));
    pushOp(this.instance, { t: 'create', id: el.nodeId, type: el.localName });
    return el;
  }
  createElementNS(ns: string, tag: string): ProxyElement {
    const el = this.wrap(new ProxyElement(this, tag.toLowerCase(), ns || HTML_NS));
    pushOp(this.instance, {
      t: 'create',
      id: el.nodeId,
      type: el.localName,
      ...(el.namespaceURI !== HTML_NS ? { ns: el.namespaceURI } : {}),
    });
    return el;
  }
  createTextNode(text: string): ProxyText {
    const t = new ProxyText(this, text);
    pushOp(this.instance, { t: 'text', id: t.nodeId, text });
    return t;
  }
  createComment(_text = ''): ProxyComment {
    const c = new ProxyComment(this, _text);
    pushOp(this.instance, { t: 'comment', id: c.nodeId });
    return c;
  }

  addEventListener(
    type: string,
    fn: (e: unknown) => void,
    opts?: boolean | { once?: boolean; passive?: boolean; capture?: boolean },
  ): void {
    this.body.addEventListener(type, fn, opts);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.body.removeEventListener(type, fn);
  }

  querySelector(sel: string): ProxyElement | null {
    return this.body.querySelector(sel);
  }
  querySelectorAll(sel: string): ProxyElement[] {
    return this.body.querySelectorAll(sel);
  }
  getElementById(id: string): ProxyElement | null {
    return this.body.getElementById(id);
  }

  /** Container geometry — pushed by the driver's ResizeObserver. Only
   *  body/documentElement and `markContainer`ed elements report it. */
  sizeOf(el: ProxyElement): { w: number; h: number } {
    const inst = instances.get(this.instance);
    if (el.nodeId === 0 || el.isContainerEl) return inst?.size ?? { w: 0, h: 0 };
    return { w: 0, h: 0 };
  }
  markContainer(el: ProxyElement): void {
    el.markContainer();
    this.containers.add(el.nodeId);
  }
  onResize(cb: (w: number, h: number) => void): void {
    instances.get(this.instance)?.resizeCbs.add(cb);
  }

  /** Wrap a wire payload for listener invocation: synthesize target/
   *  currentTarget proxy nodes and no-op cancellers. */
  wrapEvent(payload: EventPayload, currentTarget: ProxyElement): EventPayload {
    const target =
      (payload.targetId !== undefined ? this.nodeById(payload.targetId) : undefined) ??
      currentTarget;
    if (target instanceof ProxyElement) {
      if (payload.value !== undefined) target.setSilent('value', payload.value);
      if (payload.checked !== undefined) target.setSilent('checked', payload.checked);
    }
    return {
      ...payload,
      target,
      currentTarget,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
    };
  }

  dispose(): void {
    this.nodes.clear();
  }
}

/** Create a proxy document bound to an instance. `createElement`/`createElementNS`
 *  emit `create` ops immediately — the driver must see the node before the
 *  `append` that parents it; nodes that never get appended stay driver-side
 *  orphans, which is harmless. */
export function createProxyDocument(instance: string): ProxyDocument {
  return new ProxyDocument({ instance });
}
