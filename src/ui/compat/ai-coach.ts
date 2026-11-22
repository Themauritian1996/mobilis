// Branchement du coach précis de v1.15 : le domaine (src/domains/rehab/ai-coach.ts) reçoit l'IA, la clé et le glossaire des
// mesures par injection. Couche « ui » = racine de composition pendant la migration ; remplacé par src/main.ts à l'intégration.
import { METRIC_INFO } from '../../../www/js/pose.js';
import {
  createPreciseCoach as createDomainCoach,
  replySchema,
  type PreciseCoach,
  type PreciseContext,
  type PreciseHandlers,
} from '../../domains/rehab/ai-coach.ts';
import { gemini, parseJSON } from '../../services/ai/gemini/index.ts';
import { aiKey } from '../../services/db/local/settings.ts';

export * from '../../domains/rehab/ai-coach.ts';

async function askJSON(
  key: string,
  sys: string,
  parts: readonly Record<string, unknown>[],
  ids: readonly string[],
): Promise<unknown> {
  const txt = await gemini({
    key,
    sys,
    parts,
    maxTokens: 200,
    temperature: 0.2,
    schema: replySchema(ids),
    timeout: 7000,
  });
  return parseJSON(txt);
}

export function createPreciseCoach(ctx: PreciseContext, handlers: PreciseHandlers): PreciseCoach {
  return createDomainCoach(ctx, handlers, {
    key: aiKey(),
    askJSON,
    metricInfo: METRIC_INFO as Readonly<Record<string, string>>,
  });
}
