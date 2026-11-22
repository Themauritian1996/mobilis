/**
 * services : ports (interfaces) + adaptateurs. Les domaines n'importent QUE les ports (types) ; l'assemblage des
 * adaptateurs se fait dans src/main.ts. Les adaptateurs Firebase ne sont pas réexportés ici (chargement paresseux).
 */
export type * from './auth/port.ts';
export type * from './db/port.ts';
export type * from './ai/port.ts';
export type * from './storage/port.ts';
