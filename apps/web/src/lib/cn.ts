/** Minimal className combiner — no extra dependency */
export function cn(...args: (string | undefined | null | false | 0)[]): string {
  return args.filter(Boolean).join(' ');
}
