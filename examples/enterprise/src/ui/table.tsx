import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/lib/cn';

export function Table({ class: c, ...p }: JSX.IntrinsicElements['table'] & { children?: ComponentChildren }): ComponentChildren {
  return (
    <div class="relative w-full overflow-auto">
      <table class={cn('w-full caption-bottom text-sm', c)} {...p} />
    </div>
  );
}
export function TableHeader({ class: c, ...p }: JSX.IntrinsicElements['thead'] & { children?: ComponentChildren }): ComponentChildren {
  return <thead class={cn('[&_tr]:border-b', c)} {...p} />;
}
export function TableBody({ class: c, ...p }: JSX.IntrinsicElements['thead'] & { children?: ComponentChildren }): ComponentChildren {
  return <tbody class={cn('[&_tr:last-child]:border-0', c)} {...p} />;
}
export function TableRow({ class: c, ...p }: JSX.IntrinsicElements['tr'] & { children?: ComponentChildren }): ComponentChildren {
  return (
    <tr
      class={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', c)}
      {...p}
    />
  );
}
export function TableHead({ class: c, ...p }: JSX.IntrinsicElements['td'] & { children?: ComponentChildren }): ComponentChildren {
  return (
    <th
      class={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground', c)}
      {...p}
    />
  );
}
export function TableCell({ class: c, ...p }: JSX.IntrinsicElements['td'] & { children?: ComponentChildren }): ComponentChildren {
  return <td class={cn('p-2 align-middle', c)} {...p} />;
}
export function TableCaption({ class: c, ...p }: JSX.IntrinsicElements['caption'] & { children?: ComponentChildren }): ComponentChildren {
  return <caption class={cn('mt-4 text-sm text-muted-foreground', c)} {...p} />;
}
