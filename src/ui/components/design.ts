// Textes et petits composants du design 1.14 : traductions de repli, anneau de progression, niveau, sélecteur de langue
// (reprise de www/js/ui.js).
import { t, LANGS, getLang } from '../../../www/js/i18n.js';
import { tr } from './l10n.ts';
import { esc } from './html.ts';

// Textes du design 1.14 : repli local tant que les clés ne sont pas fusionnées dans i18n.js (voir i18n-new/design.json)
const DS: Record<string, Record<string, string>> = {
  vpCam: {
    fr: 'La caméra compte tes répétitions et corrige ta posture',
    en: 'The camera counts your reps and corrects your form',
    es: 'La cámara cuenta tus repeticiones y corrige tu postura',
    pt: 'A câmara conta as tuas repetições e corrige a tua postura',
    ar: 'الكاميرا تعدّ تكراراتك وتصحّح وضعيتك',
    zh: '摄像头为你计数并纠正动作',
  },
  vpPlan: {
    fr: 'Un programme qui s’ajuste à ta douleur, semaine après semaine',
    en: 'A program that adapts to your pain, week after week',
    es: 'Un programa que se ajusta a tu dolor, semana tras semana',
    pt: 'Um programa que se ajusta à tua dor, semana após semana',
    ar: 'برنامج يتكيّف مع ألمك أسبوعًا بعد أسبوع',
    zh: '计划会根据你的疼痛逐周调整',
  },
  vpClin: {
    fr: 'Ton clinicien peut suivre tes progrès, si tu le veux',
    en: 'Your clinician can follow your progress, if you choose',
    es: 'Tu clínico puede seguir tu progreso, si tú quieres',
    pt: 'O teu clínico pode acompanhar o teu progresso, se quiseres',
    ar: 'يمكن لمعالجك متابعة تقدّمك إن أردت',
    zh: '如果你愿意，治疗师可以跟进你的进展',
  },
  dsRx: { fr: 'Programmes', en: 'Programs', es: 'Programas', pt: 'Programas', ar: 'البرامج', zh: '计划' },
  dsFollow: {
    fr: 'Patients suivis',
    en: 'Patients followed',
    es: 'Pacientes en seguimiento',
    pt: 'Pacientes seguidos',
    ar: 'مرضى متابَعون',
    zh: '跟进中的患者',
  },
  dsWatch: {
    fr: 'À surveiller',
    en: 'Need attention',
    es: 'A vigilar',
    pt: 'A vigiar',
    ar: 'بحاجة إلى متابعة',
    zh: '需要关注',
  },
  dsDone: {
    fr: '{a} sur {b} exercices faits',
    en: '{a} of {b} exercises done',
    es: '{a} de {b} ejercicios hechos',
    pt: '{a} de {b} exercícios feitos',
    ar: '{a} من {b} تمارين منجزة',
    zh: '已完成 {a}/{b} 个练习',
  },
};
export const ds = (k: string, vars?: Record<string, string | number>): string => {
  let s: string = t(k);
  if (s === k) s = tr(DS[k]) || k;
  if (vars) for (const v in vars) s = s.replaceAll(`{${v}}`, String(vars[v]));
  return s;
};
// Anneau de progression (motif « goniomètre ») : pct 0–100
export const ring = (pct: number, label = ''): string => {
  const C = 2 * Math.PI * 40;
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="ring" role="img" aria-label="${esc(label || p + ' %')}"><svg viewBox="0 0 96 96" aria-hidden="true"><circle class="ring-track" cx="48" cy="48" r="40"/><circle class="ring-val" cx="48" cy="48" r="40" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p / 100)).toFixed(1)}"/></svg><b>${p}<small>%</small></b></div>`;
};

export const lvlBar = (n: number): string =>
  `<span class="lvl" aria-label="${t('level')} ${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

// Sélecteur de langue (changement géré globalement dans app.js)
export const langPicker = (cls = ''): string =>
  `<select class="input lang-select ${cls}" data-lang-select aria-label="${t('language')}">${LANGS.map((l: { id: string; name: string }) => `<option value="${l.id}" ${getLang() === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`;
