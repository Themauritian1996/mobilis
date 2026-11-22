import { describe, expect, it } from 'vitest';
import { isNetworkError } from './errors.ts';

describe('erreurs réseau', () => {
  it('codes Firestore connus, TypeError et messages réseau', () => {
    expect(isNetworkError({ code: 'firestore/unavailable' })).toBe(true);
    expect(isNetworkError({ code: 'deadline-exceeded' })).toBe(true);
    expect(isNetworkError(new TypeError('x'))).toBe(true);
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ code: 'permission-denied' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
