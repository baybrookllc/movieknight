import type { KeyboardEvent } from 'react';

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
