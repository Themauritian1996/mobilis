import { describe, expect, it } from 'vitest';
import { endLiveTurn, getCtx, isPlaying, liveLead, pcmToFloat, playRich, pushLive, stopAll } from './audio.ts';

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

describe('audio PCM', () => {
  it('PCM 16 bits little-endian → Float32', () => {
    // 0, 16384 (0,5), -32768 (-1), 32767
    const f = pcmToFloat(b64([0x00, 0x00, 0x00, 0x40, 0x00, 0x80, 0xff, 0x7f]));
    expect(f).toHaveLength(4);
    expect(f[0]).toBe(0);
    expect(f[1]).toBeCloseTo(0.5, 5);
    expect(f[2]).toBe(-1);
    expect(f[3]).toBeCloseTo(32767 / 32768, 5);
  });

  it('longueur impaire : l’octet en trop est ignoré', () => {
    expect(pcmToFloat(b64([0x00, 0x40, 0x7f]))).toHaveLength(1);
    expect(pcmToFloat('')).toHaveLength(0);
  });

  it('sans AudioContext (Node) : rien n’est joué, rien ne plante', () => {
    expect(getCtx()).toBeNull();
    expect(pushLive(b64([0, 0]))).toBe(0);
    expect(playRich(b64([0, 0]))).toBe(false);
    expect(stopAll()).toBe(0);
    expect(isPlaying()).toBe(false);
    expect(liveLead()).toBe(0);
    expect(() => endLiveTurn()).not.toThrow();
  });
});
