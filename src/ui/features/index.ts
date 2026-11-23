// Charge les routes de chaque volet (effet de bord : registerRoute / registerNav).
import './patients/routes.ts';
import './gait/routes.ts';
import './prosthetics/routes.ts';
import './treatment/routes.ts';
import './research/routes.ts';

export { findRoute, navItems } from './registry.ts';
