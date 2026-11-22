// Calendrier de suivi : rendez-vous et rappels (reprise de www/js/calendar.js, partie sans interface).
// Cette partie a été extraite de la vue pour casser le cycle calendar ↔ onboarding : l'écran d'inscription n'a besoin que
// de `scheduleReminders`. La planification est pure (`planReminders`, `nextReminderAt`) ; seul l'envoi des notifications
// locales de l'APK passe par store.cap() (Capacitor, déplacé vers src/platform par la tranche T2).
import { t } from '../../../www/js/i18n.js';
import * as P from '../../../www/js/program.js';
import * as store from '../../../www/js/store.js';

const DAY = 86400000;

/** Profil : champs lus par les rendez-vous et les rappels. */
export interface ReminderProfile {
  appointments?: Appointment[];
  nextVisit?: string | null | undefined;
  clinician?: string;
  remind?: { on?: boolean; time?: string } | undefined;
  [key: string]: unknown;
}
export interface Appointment {
  date: string;
  time: string;
  note?: string;
  fromRx?: boolean;
  /** Position dans profile.appointments (suppression d'un seul rendez-vous). */
  _i?: number;
}
/** Notification locale (plugin LocalNotifications). */
export interface LocalNotification {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle: boolean };
}

export function appointments(prof: ReminderProfile): Appointment[] {
  const list: Appointment[] = (prof.appointments || []).map((a, i) => ({ ...a, _i: i })); // _i : position dans profile.appointments
  if (prof.nextVisit && !list.some((a) => a.date === prof.nextVisit))
    list.push({
      date: prof.nextVisit,
      time: '',
      note: prof.clinician ? `${t('nextVisit')} — ${prof.clinician}` : t('nextVisit'),
      fromRx: true,
    });
  return list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Heure de rappel « HH:MM » → [heures, minutes] (18:00 par défaut). */
const hm = (time: string | undefined): [number, number] => {
  const [h, m] = (time || '18:00').split(':').map(Number);
  return [h || 0, m || 0];
};

/** Prochain rappel du navigateur : aujourd'hui à l'heure choisie, sinon demain (au moins 1 s plus tard). */
export function nextReminderAt(time: string | undefined, now: Date): Date {
  const [h, m] = hm(time);
  let at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (at.getTime() <= now.getTime() + 1000) at = new Date(at.getTime() + DAY);
  return at;
}

/**
 * Notifications à planifier : rappels ponctuels pour les 6 prochaines semaines, jour par jour (respecte les jours déplacés,
 * de repos et ajoutés), puis la veille (18 h) de chaque rendez-vous. Replanifiées à chaque ouverture de l'app.
 */
export function planReminders(prof: ReminderProfile, now: number = Date.now()): LocalNotification[] {
  const [h, mi] = (prof.remind?.time || '18:00').split(':').map(Number) as [number, number];
  const notifications: LocalNotification[] = [];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  for (let i = 0, n = 0; i < 42 && n < 60; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, mi);
    if (d.getTime() <= now || !P.isPlannedDay(prof, P.todayKey(d.getTime()))) continue;
    notifications.push({
      id: 100 + n++,
      title: 'Mobilis',
      body: t('remindBody'),
      schedule: { at: d, allowWhileIdle: true },
    });
  }
  for (const [i, a] of appointments(prof).entries()) {
    const at = new Date(`${a.date}T${a.time || '09:00'}`);
    at.setDate(at.getDate() - 1);
    at.setHours(18, 0, 0, 0);
    if (at.getTime() > now)
      notifications.push({
        id: 500 + i,
        title: 'Mobilis',
        body: `${t('apptTomorrow')}${a.time ? ' ' + a.time : ''}${a.note ? ' — ' + a.note : ''}`,
        schedule: { at, allowWhileIdle: true },
      });
  }
  return notifications;
}

// ---------- Rappels (APK) ----------
export async function clearReminders(): Promise<boolean> {
  try {
    const { LocalNotifications } = await store.cap();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length)
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n: { id: number }) => ({ id: n.id })),
      });
    return true;
  } catch {
    return false;
  }
}
export async function scheduleReminders(prof: ReminderProfile): Promise<boolean> {
  if (!store.isNative()) return false;
  try {
    const { LocalNotifications } = await store.cap();
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await clearReminders();
    await LocalNotifications.schedule({ notifications: planReminders(prof) });
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}
