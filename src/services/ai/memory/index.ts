import { AppError } from '../../../core/errors.ts';
import type { AiPort, AiRequest, AiResponse } from '../port.ts';

/** IA simulée : réponses scriptées (tests). Applique la même règle de consentement image que la production. */
export function createScriptedAi(reply: (req: AiRequest) => string = () => ''): AiPort {
  return {
    available: () => true,
    async generate(req): Promise<AiResponse> {
      if (req.images?.length && req.imageConsent !== true)
        throw new AppError('image_consent_required', 'Consentement image requis');
      return { text: reply(req), model: 'scripted' };
    },
  };
}
