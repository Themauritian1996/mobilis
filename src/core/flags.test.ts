import { describe, expect, it } from 'vitest';
import { createFeatureFlags, DEFAULT_FLAGS, parseFlagList } from './flags.ts';

describe('drapeaux de fonctionnalité', () => {
  it('gait est désactivé par défaut (spec §2)', () => {
    expect(DEFAULT_FLAGS.gait).toBe(false);
    expect(createFeatureFlags().isEnabled('gait')).toBe(false);
  });

  it('surcharges booléennes seulement, noms inconnus ignorés', () => {
    const f = createFeatureFlags({ gait: true, inconnu: true });
    expect(f.isEnabled('gait')).toBe(true);
    expect(Object.keys(f.snapshot())).toEqual(['gait']);
    expect(createFeatureFlags({ gait: 'yes' }).isEnabled('gait')).toBe(false);
  });

  it('parseFlagList', () => {
    expect(parseFlagList('gait, -x,,')).toEqual({ gait: true, x: false });
    expect(parseFlagList(null)).toEqual({});
  });
});
