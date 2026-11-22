import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events.ts';

interface E {
  ping: { n: number };
  other: string;
}

describe('createEventBus', () => {
  it('livre le bon payload aux abonnés du bon type', () => {
    const bus = createEventBus<E>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('other', b);
    bus.emit('ping', { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).not.toHaveBeenCalled();
  });

  it('désabonnement, once et clear', () => {
    const bus = createEventBus<E>();
    const a = vi.fn();
    const off = bus.on('ping', a);
    const o = vi.fn();
    bus.once('ping', o);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(o).toHaveBeenCalledTimes(1);
    bus.on('other', a);
    bus.clear();
    bus.emit('other', 'x');
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("isole l'erreur d'un abonné", () => {
    const onError = vi.fn();
    const bus = createEventBus<E>(onError);
    const ok = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', ok);
    bus.emit('ping', { n: 3 });
    expect(ok).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'ping');
  });
});
