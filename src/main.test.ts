import { describe, expect, it } from 'vitest';
import { createContainer } from './main.ts';
import { createMemoryKeyValueStore } from './platform/storage.ts';
import { FLAGS_STORAGE_KEY } from './platform/flags.ts';

describe('conteneur v2', () => {
  it('par défaut, les domaines derrière « gait » sont masqués', () => {
    const c = createContainer({ kv: createMemoryKeyValueStore(), search: '' });
    expect(c.flags.isEnabled('gait')).toBe(false);
    expect(c.enabledDomains).toEqual(['rehab', 'clinic', 'outcomes']);
  });

  it('surcharge enregistrée puis URL (?flags=)', () => {
    const kv = createMemoryKeyValueStore({ [FLAGS_STORAGE_KEY]: JSON.stringify({ gait: true }) });
    expect(createContainer({ kv, search: '' }).enabledDomains).toContain('research');
    expect(createContainer({ kv, search: '?flags=-gait' }).flags.isEnabled('gait')).toBe(false);
    const bad = createMemoryKeyValueStore({ [FLAGS_STORAGE_KEY]: '{oops' });
    expect(createContainer({ kv: bad, search: '' }).flags.isEnabled('gait')).toBe(false);
  });
});
