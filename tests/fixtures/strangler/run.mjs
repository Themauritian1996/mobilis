import { gaitEnabled } from './legacy-bridge.js';

if (gaitEnabled() !== false) process.exit(1);
console.log('pont legacy → src : OK');
