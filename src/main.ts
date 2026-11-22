/**
 * Point d'entrée v2. Pendant la migration « strangler » (docs/adr/0005-strangler.md), index.html charge toujours
 * www/js/app.js ; ce module est compilé à chaque build (dist/js/v2/main.js) et sert de racine de composition :
 * il assemble les adaptateurs et expose le conteneur au code legacy quand celui-ci en aura besoin.
 */
import { createEventBus, type AppEvents, type EventBus } from './core/events.ts';
import { DEFAULT_CONFIG, type AppConfig } from './core/config.ts';
import type { FeatureFlags } from './core/flags.ts';
import { DOMAINS } from './domains/index.ts';
import { createBrowserKeyValueStore } from './platform/storage.ts';
import { loadFeatureFlags } from './platform/flags.ts';
import type { KeyValueStore } from './platform/ports.ts';
import { routeVisible } from './ui/index.ts';

export interface AppContainer {
  readonly config: AppConfig;
  readonly bus: EventBus<AppEvents>;
  readonly flags: FeatureFlags;
  readonly kv: KeyValueStore;
  readonly enabledDomains: readonly string[];
}

export function createContainer(opts: { config?: AppConfig; kv?: KeyValueStore; search?: string } = {}): AppContainer {
  const kv = opts.kv ?? createBrowserKeyValueStore();
  const flags = loadFeatureFlags(kv, opts.search ?? globalThis.location?.search ?? '');
  const bus = createEventBus<AppEvents>((err, type) => console.warn('[bus]', String(type), err));
  return {
    config: opts.config ?? DEFAULT_CONFIG,
    bus,
    flags,
    kv,
    enabledDomains: DOMAINS.filter((d) => routeVisible(d, flags)).map((d) => d.id),
  };
}
