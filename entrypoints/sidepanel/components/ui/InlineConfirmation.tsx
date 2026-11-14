import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface InlineConfirmationProps {
  title: ReactNode;
  titleId: string;
  className?: string;
  titleClassName?: string;
  initialFocus?(): HTMLElement | null;
  returnFocus(): HTMLElement | null;
  children: ReactNode;
}

export function InlineConfirmation({
  title, titleId, className, titleClassName = 'font-semibold', initialFocus, returnFocus, children,
}: InlineConfirmationProps) {
  const region = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialTarget = useRef(initialFocus);
  const target = useRef(returnFocus);
  useLayoutEffect(() => { target.current = returnFocus; }, [returnFocus]);
  useLayoutEffect(() => {
    const section = region.current;
    (initialTarget.current?.() ?? heading.current)?.focus();
    return () => {
      if (!section?.contains(document.activeElement) && document.activeElement !== document.body) return;
      queueMicrotask(() => {
        if (!section?.isConnected && document.activeElement === document.body) target.current()?.focus();
      });
    };
  }, []);

  return <section ref={region} className={className} aria-labelledby={titleId}>
    <h3 ref={heading} id={titleId} tabIndex={-1} className={titleClassName}>{title}</h3>
    {children}
  </section>;
}
