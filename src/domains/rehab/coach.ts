// Coach : textes locaux (repli hors ligne / sans clé) et commentaires de fin de série. Les appels à l'IA et la voix sont
// injectés (le domaine ne connaît ni Gemini ni l'appareil) : voir src/ui/compat/coach.ts pour le branchement v1.15.
import { CUES, t, tp, tr } from '../../core/i18n/engine.ts';

/** Données d'un commentaire de série ou de semaine (forme produite par la séance et par la revue hebdomadaire). */
export interface CoachData {
  kind?: string;
  mode?: string;
  holdSec?: number;
  reps?: number;
  full?: number;
  faults?: Readonly<Record<string, number>>;
  painDelta?: number;
  sessions?: number;
  planned?: number;
  week?: number;
  [key: string]: unknown;
}

export const cueText = (key: string): string => (CUES[key] ? tr(CUES[key]) : t('cue_' + key));

// Repli local (hors ligne / sans clé) : phrase construite à partir des métriques
export function localComment(d: CoachData): string {
  if (d.kind === 'week') return localWeek(d);
  if (d.mode === 'hold' ? !d.holdSec : !d.reps) return t('lcNone');
  const top = Object.entries(d.faults || {}).sort((a, b) => b[1] - a[1])[0];
  const fix = top ? cueText(top[0]) + '.' : t('lcClean');
  const lead = d.mode === 'hold' ? t('lcHold', { n: d.holdSec }) : t('lcReps', { full: d.full, reps: d.reps });
  return `${lead} ${fix}`;
}
function localWeek(d: CoachData): string {
  const delta = d.painDelta as number;
  const trend = delta < -0.5 ? t('lwDown') : delta > 0.5 ? t('lwUp') : t('lwSame');
  return `${tp('lwLine', d.sessions as number, { w: d.week, s: d.sessions, p: d.planned, trend })} ${
    (d.sessions as number) >= (d.planned as number) ? t('lwGood') : t('lwMore')
  }`;
}

export interface CoachReply {
  text: string;
  source: 'gemini' | 'local';
  capped?: boolean;
}

/** Ce que le domaine attend du monde extérieur. */
export interface CoachBackend {
  /** Texte produit par l'IA (lève si indisponible : le coach retombe sur le texte local). */
  ask(kind: 'set' | 'week' | 'reply', data: CoachData, imageB64?: string | null): Promise<string>;
  /** Plafond quotidien de l'accès partagé atteint. */
  capped(): boolean;
}

export function createCoachComments(backend: CoachBackend): {
  coachComment(d: CoachData, imageB64?: string | null): Promise<CoachReply>;
  coachReply(d: CoachData): Promise<CoachReply>;
} {
  return {
    async coachComment(d, imageB64) {
      try {
        const txt = await backend.ask(d.kind === 'week' ? 'week' : 'set', d, imageB64);
        if (txt) return { text: txt, source: 'gemini' };
      } catch {
        /* repli local */
      }
      return { text: localComment(d), source: 'local', capped: backend.capped() };
    },
    // Réponse du coach au commentaire écrit / dicté du patient
    async coachReply(d) {
      try {
        const txt = await backend.ask('reply', d);
        if (txt) return { text: txt, source: 'gemini' };
      } catch {
        /* repli local */
      }
      return { text: t('lcReplyLocal'), source: 'local' };
    },
  };
}
