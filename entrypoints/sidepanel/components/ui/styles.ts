/**
 * Shared LinkShelf control and heading styles. These are plain Tailwind class
 * strings so the dark theme's class-based overrides (bg-white, text-blue-700…)
 * keep applying to them.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'quiet' | 'ghost';

const buttonBase = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-center text-sm font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60';

const buttonVariants: Record<ButtonVariant, string> = {
  /** The one main action in a place. */
  primary: 'bg-blue-700 text-white hover:bg-blue-800',
  /** Other actions. */
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  /** Confirms something that removes data. */
  danger: 'bg-red-700 text-white hover:bg-red-800',
  /** Starts something that removes data; a confirmation follows. */
  'danger-outline': 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  /** A low-emphasis action shown as text. */
  quiet: 'text-blue-700 hover:bg-blue-50',
  /** Cancel and dismiss. */
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function buttonClass(variant: ButtonVariant = 'secondary', extra = '') {
  return `${buttonBase} ${buttonVariants[variant]}${extra ? ` ${extra}` : ''}`;
}

/** The h2 at the top of a sidebar section. Panel titles inside a section use `font-semibold text-slate-900`. */
export const sectionTitle = 'text-lg font-bold text-slate-900';
