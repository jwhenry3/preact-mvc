/**
 * shadcn-style Tabs without Radix: a tiny signal-driven version, framework
 * native. Tabs owns a `signal` for the active value; triggers/contents read
 * it in render so everything stays reactive.
 */
import { signal, type Signal } from '@preact/signals';
import type { ComponentChildren, JSX } from 'preact';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { cn } from '@/lib/cn';

const TabsCtx = createContext<Signal<string>>(signal(''));

export function Tabs({
  value,
  defaultValue = '',
  class: c,
  ...p
}: JSX.IntrinsicElements['div'] & { children?: ComponentChildren } & {
  value?: Signal<string>;
  defaultValue?: string;
}): ComponentChildren {
  const state = value ?? signal(defaultValue);
  return (
    <TabsCtx.Provider value={state}>
      <div class={cn('w-full', c)} {...p} />
    </TabsCtx.Provider>
  );
}

export function TabsList({ class: c, ...p }: JSX.IntrinsicElements['div'] & { children?: ComponentChildren }): ComponentChildren {
  return (
    <div
      class={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        c,
      )}
      {...p}
    />
  );
}

export function TabsTrigger({
  value,
  class: c,
  ...p
}: JSX.IntrinsicElements['button'] & { children?: ComponentChildren } & { value: string }): ComponentChildren {
  const state = useContext(TabsCtx);
  const active = state.value === value;
  return (
    <button
      class={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        active && 'bg-background text-foreground shadow',
        c,
      )}
      onClick={() => (state.value = value)}
      {...p}
    />
  );
}

export function TabsContent({
  value,
  class: c,
  ...p
}: JSX.IntrinsicElements['div'] & { children?: ComponentChildren } & { value: string }): ComponentChildren {
  const state = useContext(TabsCtx);
  if (state.value !== value) return null;
  return <div class={cn('mt-2 focus-visible:outline-none', c)} {...p} />;
}
