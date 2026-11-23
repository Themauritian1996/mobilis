// Semaine : jour de début selon le réglage ou la langue (reprise de www/js/ui.js).
import { locale } from '../../../www/js/i18n.js';
import { weekStartFor, weekOrder as wOrder } from '../../../www/js/longterm.js';
import * as store from '../../../www/js/store.js';

/** 0 = la semaine commence le dimanche, 1 = lundi (réglage « auto » : selon la langue). */
export const weekStartDay = () => weekStartFor(store.settings().weekStart, locale());
export const weekOrder = () => wOrder(weekStartDay());
