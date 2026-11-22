import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveAvailable, liveSocketAvailable, similar, startLiveCoach } from './live.ts';

// platform/speech.ts teste `window` au chargement (comme coach.js en v1.15)
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = {};
});

const mem: Record<string, string> = {};

class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => Promise<void>) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send(s: string): void {
    this.sent.push(s);
  }
  close(): void {
    this.readyState = 3;
  }
}

beforeEach(() => {
  for (const k of Object.keys(mem)) Reflect.deleteProperty(mem, k);
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => void (mem[k] = v),
    removeItem: (k: string) => void Reflect.deleteProperty(mem, k),
  });
  vi.stubGlobal('navigator', { language: 'fr', onLine: true });
  vi.stubGlobal('document', { documentElement: {}, createElement: () => ({}) });
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('coach en direct', () => {
  it('similarité de remarques', () => {
    expect(similar('Garde le dos droit', 'garde le dos droit !')).toBe(true);
    expect(similar('Garde le dos droit', 'Plie un peu plus les genoux')).toBe(false);
    expect(similar('', 'abc')).toBe(false);
  });

  it('disponibilité : clé personnelle ou relais (pas de WebSocket par le relais)', () => {
    expect(liveAvailable()).toBe(false);
    mem['mobilis.settings'] = JSON.stringify({ geminiKey: 'K' });
    expect(liveAvailable()).toBe(true);
    expect(liveSocketAvailable()).toBe(true);
  });

  it('session : configuration envoyée, CHECK sur évènement (sans image sans consentement)', async () => {
    mem['mobilis.settings'] = JSON.stringify({ geminiKey: 'K' });
    const states: string[] = [];
    const texts: unknown[] = [];
    const coach = startLiveCoach({
      context: { exercise: 'Squat', condition: 'genou', target: 10, painLimit: 4, steps: ['a'], keys: ['b'] },
      getState: () => ({ reps: 3, target: 10, tracked: true, faults: ['trunk'] }),
      onText: (t, f) => texts.push([t, f]),
      onState: (s) => states.push(s),
    });
    const sock = FakeSocket.last as FakeSocket;
    expect(sock.url).toContain('key=K');
    sock.onopen?.();
    expect(JSON.parse(sock.sent[0] as string).setup.systemInstruction.parts[0].text).toContain('Exercise: Squat');
    await sock.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    expect(states).toEqual(['connecting', 'live']);
    coach.event('fault', { fault: 'trunk' });
    await vi.advanceTimersByTimeAsync(3000); // écart minimal entre deux CHECK
    expect(sock.sent.some((s) => s.includes('"video"'))).toBe(false); // pas de consentement : aucune image
    const check = sock.sent.map((s) => JSON.parse(s)).find((m) => m.realtimeInput?.text);
    expect(check.realtimeInput.text).toContain('The app just measured a fault: trunk');
    await sock.onmessage?.({
      data: JSON.stringify({ serverContent: { outputTranscription: { text: 'Redresse le dos' }, turnComplete: true } }),
    });
    expect(texts.at(-1)).toEqual(['Redresse le dos', true]);
    coach.stop();
    expect(states.at(-1)).toBe('off');
  });
});
