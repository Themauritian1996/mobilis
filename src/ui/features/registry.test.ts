import { describe, it, expect, beforeEach } from 'vitest';
import { registerRoute, registerNav, findRoute, navItems, _resetRegistry } from './registry.ts';

const on = { isEnabled: () => true };
const off = { isEnabled: () => false };

describe('registre des volets', () => {
  beforeEach(() => _resetRegistry());

  it('retrouve une route selon le drapeau et le rôle', () => {
    registerRoute({ name: 'marche', flag: 'gait', roles: ['clinician'], render: () => 'ok' });
    expect(findRoute('marche', on, 'clinician')).toBeDefined();
    expect(findRoute('marche', off, 'clinician')).toBeUndefined();
    expect(findRoute('marche', on, 'patient')).toBeUndefined();
    expect(findRoute('inconnue', on, 'clinician')).toBeUndefined();
  });

  it('refuse un doublon de route', () => {
    registerRoute({ name: 'x', render: () => null });
    expect(() => registerRoute({ name: 'x', render: () => null })).toThrow();
  });

  it('filtre et trie la navigation', () => {
    registerNav({ id: 'b', labelKey: 'b', href: '#/b', place: 'clinic', order: 2 });
    registerNav({ id: 'a', labelKey: 'a', href: '#/a', place: 'clinic', order: 1, flag: 'gait' });
    registerNav({ id: 'c', labelKey: 'c', href: '#/c', place: 'home' });
    expect(navItems('clinic', on, 'clinician').map((n) => n.id)).toEqual(['a', 'b']);
    expect(navItems('clinic', off, 'clinician').map((n) => n.id)).toEqual(['b']);
  });
});
