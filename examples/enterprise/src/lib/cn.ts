import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The shadcn primitive: conditional classes + tailwind-merge dedupe. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
