import { describe, expect, it } from 'vitest';
import { confirmedBefore, homeCardProtocol, protocolViewHtml, rxExtrasProtocol, summaryPart } from './protocol.ts';

describe('protocol (vue)', () => {
  it('sans protocole : résumé vide, pas de carte, écran « aucun protocole »', () => {
    expect(summaryPart({})).toEqual({});
    expect(homeCardProtocol({})).toBe('');
    expect(protocolViewHtml({})).toContain('class="card muted"');
  });

  it('rxExtrasProtocol ignore un protocole inconnu et garde les confirmations déjà faites', () => {
    expect(rxExtrasProtocol(null)).toEqual({ protocol: null });
    expect(rxExtrasProtocol({ protocol: { id: 'inconnu', surgeryDate: '2026-01-05' } })).toEqual({ protocol: null });
    const rx = { protocol: { id: 'acl', surgeryDate: '2026-01-05', confirmed: { p1: 1 } } };
    const prev = { protocol: { id: 'acl', surgeryDate: '2026-01-05', confirmed: { p2: 2 } } };
    expect(rxExtrasProtocol(rx, prev).protocol?.confirmed).toEqual({ p1: 1, p2: 2 });
    const other = { protocol: { id: 'acl', surgeryDate: '2025-12-01', confirmed: { p2: 2 } } };
    expect(rxExtrasProtocol(rx, other).protocol?.confirmed).toEqual({ p1: 1 });
  });

  it('confirmedBefore : protocole inconnu → {} ; chirurgie ancienne → phases terminées confirmées', () => {
    expect(confirmedBefore('inconnu', null, '2026-01-05')).toEqual({});
    const now = Date.UTC(2026, 11, 1);
    const done = confirmedBefore('acl', null, '2026-01-05', now);
    expect(Object.values(done).every((v) => v === now)).toBe(true);
    expect(Object.keys(done).length).toBeGreaterThan(0);
  });
});
