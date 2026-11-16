import { useLayoutEffect, useRef, type ReactNode } from 'react';

export type ReturnFocus = (invoker: HTMLElement | null) => HTMLElement | null;

interface ModalProps {
  titleId: string;
  onClose(): void;
  pending?: boolean;
  returnFocus?: ReturnFocus;
  children: ReactNode;
}

export function hasActiveModal() {
  return !!document.querySelector('dialog[data-linkshelf-modal][open]');
}

function canFocus(element: HTMLElement | null): element is HTMLElement {
  return !!element?.isConnected && !element.matches(':disabled') &&
    !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible';
}

export function Modal({ titleId, onClose, pending = false, returnFocus, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef(returnFocus);
  const backdropPress = useRef(false);

  useLayoutEffect(() => {
    returnFocusRef.current = returnFocus;
  }, [returnFocus]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open || hasActiveModal()) return;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitial = () => {
      const initial = dialog.querySelector<HTMLElement>('[data-modal-initial]');
      const heading = document.getElementById(titleId);
      if (canFocus(initial)) initial.focus();
      else if (heading && dialog.contains(heading)) heading.focus();
    };

    dialog.showModal();
    focusInitial();
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !dialog.contains(active) || !canFocus(active)) focusInitial();
    });
    observer.observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert', 'style', 'class', 'tabindex'] });

    return () => {
      observer.disconnect();
      const active = document.activeElement;
      const ownedFocus = dialog.contains(active) || active === document.body;
      dialog.close();
      queueMicrotask(() => {
        if (!ownedFocus || dialog.open || hasActiveModal()) return;
        if (document.activeElement !== invoker && document.activeElement !== document.body &&
            !dialog.contains(document.activeElement)) return;
        const eligibleInvoker = canFocus(invoker) ? invoker : null;
        const target = returnFocusRef.current ? returnFocusRef.current(eligibleInvoker) : eligibleInvoker;
        if (canFocus(target)) target.focus();
      });
    };
  }, [titleId]);

  function outside(dialog: HTMLDialogElement, x: number, y: number) {
    const bounds = dialog.getBoundingClientRect();
    return x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom;
  }

  return (
    <dialog ref={ref} data-linkshelf-modal aria-labelledby={titleId} aria-modal="true"
      className="linkshelf-modal rounded-2xl border border-white/60 bg-white p-5 text-slate-900 shadow-2xl shadow-slate-950/25"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = !pending && event.button === 0 && event.target === event.currentTarget &&
          outside(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerCancel={() => { backdropPress.current = false; }}
      onClick={(event) => {
        const pressedOutside = backdropPress.current;
        backdropPress.current = false;
        if (pressedOutside && !pending && event.target === event.currentTarget &&
            outside(event.currentTarget, event.clientX, event.clientY)) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // Native inertness protects the document. Wrap at the edges to avoid moving into browser chrome.
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'button, select, input, textarea, a[href], summary, [tabindex], [contenteditable="true"]',
        )].filter((control) => control.tabIndex >= 0 && canFocus(control));
        const active = document.activeElement;
        const index = active instanceof HTMLElement ? controls.indexOf(active) : -1;
        if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
      }}
    >
      {children}
    </dialog>
  );
}
