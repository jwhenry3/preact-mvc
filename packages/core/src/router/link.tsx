import type { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { useService } from '../context';
import { Router } from './router';

export function Link(props: {
  to: string;
  class?: string;
  children?: ComponentChildren;
}) {
  const router = useService(Router);
  const onClick = (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    // preact-router's document-level <a> interceptor routes any plain
    // anchor click it sees — stop propagation so ours doesn't double-nav.
    e.stopPropagation();
    router.navigate(props.to);
  };
  return (
    <a href={router.href(props.to)} class={props.class} onClick={onClick}>
      {props.children}
    </a>
  );
}
