import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiAi, isImagePart, parseJSON, stripImages } from './index.ts';

const mem: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(mem)) Reflect.deleteProperty(mem, k);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => void (mem[k] = v),
    removeItem: (k: string) => void Reflect.deleteProperty(mem, k),
  });
  vi.stubGlobal('navigator', { language: 'fr', onLine: true });
  vi.stubGlobal('document', { documentElement: {} });
});
afterEach(() => vi.unstubAllGlobals());

const img = { mime: 'image/jpeg' as const, base64: 'AAAA' };

describe('adaptateur Gemini (réseau simulé)', () => {
  it('JSON entouré de texte ou de balises', () => {
    expect(parseJSON('{"a":1}')).toEqual({ a: 1 });
    expect(parseJSON('Voici : ```json\n{"cue":"none"}\n```')).toEqual({ cue: 'none' });
    expect(() => parseJSON('rien')).toThrow('json');
  });

  it('images : retirées sans consentement', () => {
    const parts = [
      { text: 'x' },
      { inline_data: { mime_type: 'image/jpeg', data: 'A' } },
      { inlineData: { mimeType: 'image/png', data: 'B' } },
    ];
    expect(parts.filter(isImagePart)).toHaveLength(2);
    expect(stripImages(parts, false)).toEqual([{ text: 'x' }]);
    expect(stripImages(parts, true)).toHaveLength(3);
  });

  it('AiPort : image sans consentement refusée, aucun appel réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mem['mobilis.settings'] = JSON.stringify({ geminiKey: 'K', imageConsent: true });
    const ai = createGeminiAi();
    expect(ai.available()).toBe(true);
    await expect(ai.generate({ prompt: 'p', lang: 'fr', images: [img] })).rejects.toThrow(/Consentement/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AiPort : appel direct avec la clé de l’utilisateur (en-tête, pas d’URL)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Bravo' }] }, finishReason: 'STOP' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    mem['mobilis.settings'] = JSON.stringify({ geminiKey: 'MA-CLE', imageConsent: true });
    const r = await createGeminiAi().generate({ prompt: 'p', lang: 'fr', images: [img], imageConsent: true });
    expect(r.text).toBe('Bravo');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('MA-CLE');
    expect(init.headers['x-goog-api-key']).toBe('MA-CLE');
  });
});
