import type { ReactNode, Ref } from 'react';
import { useDisclosure } from '../useDisclosure';

export function Disclosure({ label, triggerContent, disabled, unavailable, triggerRef, panelWidth = 'w-52', children }: {
  label: string;
  triggerContent: ReactNode;
  disabled?: boolean;
  unavailable?: { reason: string; descriptionId: string };
  triggerRef?: Ref<HTMLButtonElement>;
  /** Tailwind width class for the panel. */
  panelWidth?: string;
  children(close: () => void): ReactNode;
}) {
  const disclosure = useDisclosure();
  return <div ref={disclosure.root} onKeyDown={event => {
    if (event.key !== 'Escape' || !disclosure.open) return;
    event.preventDefault();
    event.stopPropagation();
    disclosure.closeAndFocus();
  }}>
    <button ref={element => {
      disclosure.trigger.current = element;
      if (typeof triggerRef === 'function') triggerRef(element);
      else if (triggerRef) triggerRef.current = element;
    }} type="button" aria-label={label} title={unavailable?.reason ?? label} aria-expanded={disclosure.open}
      aria-disabled={unavailable ? true : undefined} aria-describedby={unavailable?.descriptionId}
      aria-controls={disclosure.open ? disclosure.id : undefined} disabled={disabled}
      className="dropdown-trigger aria-disabled:opacity-65"
      onClick={() => { if (!unavailable) disclosure.toggle(); }}>
      {triggerContent}
    </button>
    {disclosure.open && <div id={disclosure.id} role="group" aria-label={label}
      className={`dropdown-panel absolute top-full right-0 z-30 mt-1 grid ${panelWidth} max-w-[calc(100vw-2rem)] gap-1`}>
      {children(disclosure.closeAndFocus)}
    </div>}
  </div>;
}
