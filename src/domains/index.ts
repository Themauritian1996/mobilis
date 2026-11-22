import { DOMAIN as clinic } from './clinic/index.ts';
import { DOMAIN as gait } from './gait/index.ts';
import { DOMAIN as outcomes } from './outcomes/index.ts';
import { DOMAIN as prosthetics } from './prosthetics/index.ts';
import { DOMAIN as rehab } from './rehab/index.ts';
import { DOMAIN as research } from './research/index.ts';
import { DOMAIN as treatment } from './treatment/index.ts';

export type { DomainDescriptor } from './types.ts';
export const DOMAINS = [rehab, clinic, outcomes, gait, prosthetics, treatment, research] as const;
