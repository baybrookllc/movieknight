import { describe, it, expect } from 'vitest';
import { SITE_URL } from './site';

describe('SITE_URL', () => {
  it('is an absolute http(s) origin', () => {
    expect(SITE_URL).toMatch(/^https?:\/\//);
  });

  it('has no trailing slash (so `${SITE_URL}/path` never doubles up)', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});
