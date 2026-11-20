import type { ComponentPropsWithRef, ReactNode } from 'react';
import { buttonClass, type ButtonVariant } from './styles';

export function Button({ variant = 'secondary', className = '', children, ...props }: ComponentPropsWithRef<'button'> & { variant?: ButtonVariant; children: ReactNode }) {
  return <button {...props} className={buttonClass(variant, className)}>{children}</button>;
}
