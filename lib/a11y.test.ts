import { describe, it, expect, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { activateOnKey } from './a11y';

function fakeEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('activateOnKey', () => {
  it('fires and prevents default on Enter and Space', () => {
    for (const key of ['Enter', ' ', 'Spacebar']) {
      const activate = vi.fn();
      const e = fakeEvent(key);
      activateOnKey(activate)(e);
      expect(activate).toHaveBeenCalledOnce();
      expect(e.preventDefault).toHaveBeenCalledOnce();
    }
  });

  it('ignores other keys', () => {
    const activate = vi.fn();
    const e = fakeEvent('a');
    activateOnKey(activate)(e);
    expect(activate).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
