/**
 * callbackProp — the shell→worker function channel (Atoll's
 * `callbackProps.ts`). Shell marks a prop `callbackProp(fn)`; the driver
 * marshals it to a `{ __cb: id }` wire handle and keeps the real function;
 * the worker unmarshals it to a callable that pushes an `emit` op under the
 * reserved CALLBACK_EVENT name. Fire-and-forget — no return channel.
 */
import { CALLBACK_EVENT } from './ops';
import { pushOp } from './instance';

const MARKER = Symbol.for('island.callbackProp');

export interface CallbackProp<F extends (...args: never[]) => void> {
  readonly [MARKER]: true;
  readonly fn: F;
}

export const callbackProp = <F extends (...args: any[]) => void>(fn: F): F =>
  ({ [MARKER]: true, fn }) as unknown as F;

export const isCallbackProp = (v: unknown): v is CallbackProp<(...args: never[]) => void> =>
  typeof v === 'object' && v !== null && MARKER in v;

export interface CallbackRegistry {
  /** fn table: __cb id → shell function. */
  fns: Map<number, (...args: unknown[]) => void>;
  nextId: number;
}

export const newCallbackRegistry = (): CallbackRegistry => ({ fns: new Map(), nextId: 1 });

/** Walk props; replace callbackProp markers with `{ __cb: id }` handles
 *  registered in the table. Bare (unmarked) functions throw — the wire is
 *  structuredClone and a silent drop would be worse. */
export function marshalCallbackProps(
  props: Record<string, unknown>,
  reg: CallbackRegistry,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isCallbackProp(v)) {
      const id = reg.nextId++;
      reg.fns.set(id, v.fn as (...args: unknown[]) => void);
      out[k] = { __cb: id };
    } else if (typeof v === 'function') {
      throw new Error(
        `island prop "${k}" is a function — wrap it in callbackProp() to pass it to the worker`,
      );
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = marshalCallbackProps(v as Record<string, unknown>, reg);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const isCbHandle = (v: unknown): v is { __cb: number } =>
  typeof v === 'object' && v !== null && typeof (v as { __cb?: unknown }).__cb === 'number';

/** Worker side: `{ __cb: id }` handles become instance-scoped callables
 *  that emit the reserved callback op. */
export function unmarshalCallbackProps(
  props: Record<string, unknown>,
  instance: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isCbHandle(v)) {
      const id = v.__cb;
      out[k] = (...args: unknown[]) =>
        pushOp(instance, { t: 'emit', name: CALLBACK_EVENT, payload: { id, args } });
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = unmarshalCallbackProps(v as Record<string, unknown>, instance);
    } else {
      out[k] = v;
    }
  }
  return out;
}
