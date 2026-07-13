import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

/**
 * Returns an onKeyDown handler that fires `activate` on Enter or Space — the
 * keyboard equivalent of a click for elements given role="button". Use with
 * `tabIndex={0}` on non-native-button elements (divs/spans wired to onClick) so
 * keyboard and screen-reader users can operate them. Prevents Space from
 * scrolling the page.
 */
export function activateOnKey(activate: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      activate();
    }
  };
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wires the standard modal/dialog keyboard contract onto `containerRef`'s
 * subtree while `isOpen` is true: Escape calls `onClose`, Tab/Shift+Tab wrap
 * within the container's focusable elements instead of escaping to the page
 * behind it, focus moves onto the first focusable element (or the container
 * itself) when the dialog opens, and returns to whatever was focused before
 * the dialog opened once it closes.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const getFocusable = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    const first = getFocusable()[0];
    (first ?? container)?.focus();

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, containerRef]);
}
