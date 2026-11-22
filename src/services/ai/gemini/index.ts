/** Adaptateur Gemini (direct / relais). Code actuel : www/js/coach.js `gemini()` → tranche « services » (docs/MIGRATION.md). */
import { NotImplementedError } from '../../../core/errors.ts';
import type { AiPort } from '../port.ts';

export function createGeminiAi(): AiPort {
  throw new NotImplementedError('services/ai/gemini');
}
