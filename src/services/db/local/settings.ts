// Réglages locaux à l'appareil, accès IA partagé par le clinicien, code clinicien en attente.
// Clés de stockage inchangées (`mobilis.settings`, `mobilis.aiUse`, `mobilis.pendingRx`…).
import { LS, dayKey } from './local-store.ts';

// Clé Gemini utilisée par l'app : la clé personnelle, sinon l'accès IA partagé par le clinicien (settings().sharedAI).
// sharedAI = { key? | proxy?+token?, from, until?: 'AAAA-MM-JJ', cap?: appels/jour, rxCode? }. Mode relais : aiKey() renvoie PROXY_KEY
// (valeur factice « vraie clé absente ») ; le coach route alors les appels par le relais au lieu de Google.
export const PROXY_KEY = '@proxy';

export interface SharedAI {
  key?: string | undefined;
  proxy?: string | undefined;
  token?: string | undefined;
  from?: string | undefined;
  until?: string | undefined;
  cap?: number | undefined;
  rxCode?: string | null | undefined;
}

// imageConsent : null = jamais demandé, true / false = choix du patient (aucune image n'est envoyée à Gemini sans true)
// voiceRate 0,8–1,3 · cueLevel 'all' | 'essential' · textSize 100 | 115 | 130 · weekStart 'auto' | 0 | 1 · webRemind : rappel du navigateur
export interface Settings {
  voice: string;
  countAloud: boolean;
  geminiKey: string;
  sendFrame: boolean;
  camera: string;
  theme: string;
  anatomy: boolean;
  selfView: boolean;
  guides: boolean;
  vibrate: boolean;
  liveAI: boolean;
  imageConsent: boolean | null;
  voiceRate: number;
  cueLevel: string;
  textSize: number;
  contrast: boolean;
  weekStart: string | number;
  webRemind: boolean;
  sharedAI?: SharedAI | null | undefined;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: Settings = {
  voice: 'local',
  countAloud: true,
  geminiKey: '',
  sendFrame: false,
  camera: 'user',
  theme: 'auto',
  anatomy: false,
  selfView: true,
  guides: true,
  vibrate: true,
  liveAI: false,
  imageConsent: null,
  voiceRate: 1,
  cueLevel: 'all',
  textSize: 100,
  contrast: false,
  weekStart: 'auto',
  webRemind: false,
};
export const settings = (): Settings => ({ ...DEFAULT_SETTINGS, ...LS.get<Partial<Settings>>('mobilis.settings', {}) });
export const saveSettings = (patch: Partial<Settings>): void => LS.set('mobilis.settings', { ...settings(), ...patch });

// Accès partagé actif : présent, valide et non expiré (la clé personnelle reste prioritaire ailleurs)
export const sharedAIActive = (s: Settings = settings(), today: string = dayKey()): SharedAI | null => {
  const a = s.sharedAI;
  if (!a || (!a.key && !a.proxy)) return null;
  if (a.until && today > a.until) return null;
  return a;
};
const AIUSE = 'mobilis.aiUse';
export const aiUsed = (today: string = dayKey()): number => {
  const u = LS.get<{ day?: string; n?: number } | null>(AIUSE, null);
  return u && u.day === today ? u.n || 0 : 0;
};
export const aiCapReached = (s: Settings = settings(), today: string = dayKey()): boolean => {
  const a = sharedAIActive(s, today);
  return !!(a && (a.cap as number) > 0 && !s.geminiKey && aiUsed(today) >= (a.cap as number));
};
// Compte les appels IA du jour (seulement si on consomme l'accès du clinicien)
export function aiCount(n = 1, s: Settings = settings(), today: string = dayKey()): void {
  const a = sharedAIActive(s, today);
  if (!a || s.geminiKey) return;
  const used = aiUsed(today) + n;
  LS.set(AIUSE, { day: today, n: used });
  if ((a.cap as number) > 0 && used >= (a.cap as number) && used - n < (a.cap as number)) {
    try {
      window.dispatchEvent(new CustomEvent('mobilis:aicap'));
    } catch {
      /* pas de fenêtre (tests Node) */
    }
  }
}
export const aiKey = (): string => {
  const s = settings();
  if (s.geminiKey) return s.geminiKey;
  const a = sharedAIActive(s);
  if (!a || aiCapReached(s)) return ''; // plafond atteint → coach local
  return a.proxy ? PROXY_KEY : a.key || '';
};
// Relais utilisé (si l'accès effectif est un relais)
export const aiProxy = (): { url: string; token: string } | null => {
  const s = settings();
  if (s.geminiKey) return null;
  const a = sharedAIActive(s);
  return a && a.proxy && !aiCapReached(s) ? { url: a.proxy, token: a.token || '' } : null;
};
// Infos pour l'affichage du profil
export const sharedAIInfo = () => {
  const s = settings(),
    a = sharedAIActive(s);
  return a
    ? {
        from: a.from || '',
        until: a.until || '',
        cap: a.cap || 0,
        used: aiUsed(),
        mode: a.proxy ? ('proxy' as const) : ('key' as const),
        personal: !!s.geminiKey,
        capped: aiCapReached(s),
      }
    : null;
};
const okUrl = (u: unknown): boolean => {
  try {
    return new URL(String(u)).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Accès IA d'un programme du clinicien (champ `ai` de `rx`). */
export interface RxAi {
  mode?: string | undefined;
  proxy?: string | undefined;
  token?: string | undefined;
  key?: string | undefined;
  cap?: number | string | undefined;
  until?: string | undefined;
}
// Applique (ou retire) l'accès IA d'un programme du clinicien. Retourne l'accès appliqué ou null.
export function applySharedAI(
  rx: { ai?: RxAi | null; clinician?: string; code?: string | null } | null | undefined,
): SharedAI | null {
  const a = rx?.ai;
  const valid = a && ((a.mode === 'proxy' && okUrl(a.proxy)) || (a.mode !== 'proxy' && a.key));
  if (!valid) {
    if (settings().sharedAI) saveSettings({ sharedAI: null });
    return null;
  }
  const cap = Math.max(0, Math.min(1000, Math.round(+(a.cap as number)) || 0));
  const sh: SharedAI = {
    from: String(rx.clinician || '').slice(0, 60),
    until: /^\d{4}-\d{2}-\d{2}$/.test(a.until || '') ? a.until : '',
    cap,
    rxCode: rx.code || null,
  };
  if (a.mode === 'proxy') {
    sh.proxy = a.proxy;
    sh.token = String(a.token || '').slice(0, 300);
  } else sh.key = String(a.key).trim();
  saveSettings({ sharedAI: sh });
  return sh;
}

// Consentement explicite pour envoyer une image de la caméra à Gemini (Loi 25 / RGPD) : sans « true », aucune image ne quitte l'appareil
export const imageConsent = (s: Settings = settings()): boolean => s.imageConsent === true;
export const setImageConsent = (v: unknown): void =>
  saveSettings({ imageConsent: !!v, ...(v ? {} : { sendFrame: false, liveAI: false }) });
export const clampRate = (v: unknown): number => {
  const n = +(v as number);
  return Number.isFinite(n) ? Math.max(0.8, Math.min(1.3, Math.round(n * 20) / 20)) : 1;
};
// Efface la clé Gemini personnelle de cet appareil
export const purgeApiKey = (): void => saveSettings({ geminiKey: '' });

// ---------- Code clinicien en attente ----------
// #/rx/CODE mémorise le code pour finir l'import après la connexion. Un code introuvable ou injoignable doit toujours être effacé :
// sinon toutes les routes y redirigent (l'app serait bloquée).
const PENDING = 'mobilis.pendingRx';
export const getPendingRx = (): string | null => {
  try {
    return localStorage.getItem(PENDING);
  } catch {
    return null;
  }
};
export const setPendingRx = (c: string): void => {
  try {
    localStorage.setItem(PENDING, c);
  } catch {
    /* stockage indisponible */
  }
};
export const clearPendingRx = (): void => {
  try {
    localStorage.removeItem(PENDING);
  } catch {
    /* stockage indisponible */
  }
};
