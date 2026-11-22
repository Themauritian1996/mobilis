// Module « legacy » de démonstration : importe du TypeScript de src/ par l'alias, comme le fera le code migré.
import { createFeatureFlags } from '@src/core/flags.ts';

export const gaitEnabled = () => createFeatureFlags().isEnabled('gait');
