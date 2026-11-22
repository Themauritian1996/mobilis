/**
 * Adaptateur Gemini (direct avec la clé de l'utilisateur, ou relais du clinicien / du site : docs/ai-proxy.md).
 * Code de www/js/coach.js (v1.15) : appel « generateContent » avec repli de modèle et de réglage de réflexion,
 * consentement image, mode relais. L'IA ne sert qu'à reformuler ou expliquer (spec §4.5). Aucune clé dans le dépôt :
 * la clé vient des réglages de l'utilisateur ou de l'accès partagé du clinicien.
 */
import { AppError } from '../../../core/errors.ts';
import { aiLangInfo, getAiLang, langInfo } from '../../../core/i18n/engine.ts';
import { CONFIG, coachUrl } from '../../../platform/assets.ts';
import {
  PROXY_KEY,
  aiCapReached,
  aiCount,
  aiKey,
  aiProxy,
  imageConsent,
  settings,
  sharedAIActive,
} from '../../db/local/settings.ts';
import type { AiPort, AiRequest, AiResponse } from '../port.ts';

// ---------- Consignes (en anglais : meilleure fiabilité), réponse demandée dans la langue du patient ----------
const SYS = {
  set: 'You are a musculoskeletal rehab coach supervised by a physiatrist. Speak directly to the patient, 2 sentences max (40 words), warm and concrete, no jargon. From the JSON set data (full reps, camera-detected faults, quality 0-1, filmed plane), give ONE priority correction and ONE encouragement. If an image is provided, use the visible posture. Never diagnose or change the program. If pain exceeds the limit, advise easing off or stopping and talking to their clinician.',
  week: 'You are an MSK rehab coach supervised by a physiatrist. Write a weekly review for the patient in max 3 sentences from the JSON data (sessions done/planned, mean pain, movement quality, pain change, patient comments). Highlight one real gain and one priority for next week, no diagnosis, no jargon.',
  reply:
    'You are an MSK rehab coach supervised by a physiatrist. The patient just finished an exercise and left a comment (JSON: exercise, condition, pain 0-10, pain limit, difficulty 1-5, comment). Answer the comment in max 2 short sentences (35 words): acknowledge it, give one safe practical tip. Never diagnose or change the program. If the comment suggests worsening pain, numbness, weakness, swelling or anything unusual, tell them to ease off and contact their clinician. No jargon.',
} as const;
const REG: Record<string, string> = {
  fr: ' Address the patient informally with "tu"/"ton", never "vous".',
  es: ' Use informal "tú", never "usted".',
  pt: ' Use informal "você", never "o senhor/a senhora".',
};
export const langLine = (): string =>
  `Always answer in ${aiLangInfo().label}.${REG[getAiLang()] || ' Use a warm, informal register.'}`;
export const aiAvailable = (): boolean => !!(aiKey() || CONFIG.coachEndpoint);
// Accès partagé épuisé pour aujourd'hui (plafond du clinicien) : le coach local prend le relais
export const aiCapped = (): boolean => !settings().geminiKey && !!sharedAIActive() && aiCapReached();

// ---------- Appel « generateContent » ----------
// Direct chez Google avec une clé, ou par le relais du clinicien (mode proxy : POST {kind:'gen', model, ...}
// + jeton en en-tête ; le relais renvoie la réponse de Gemini telle quelle, donc le reste du code est identique).
export function genFetch(model: string, body: object, key: string, signal?: AbortSignal): Promise<Response> {
  if (key === PROXY_KEY) {
    const px = aiProxy();
    if (!px) return Promise.reject(new Error('no proxy'));
    return fetch(px.url, {
      method: 'POST',
      signal: signal as AbortSignal,
      headers: { 'Content-Type': 'application/json', ...(px.token ? { 'x-mobilis-token': px.token } : {}) },
      body: JSON.stringify({ kind: 'gen', model, ...body }),
    });
  }
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: signal as AbortSignal,
    body: JSON.stringify(body),
  });
}

// Appel Gemini direct (clé personnelle). Rapide par défaut : modèle « lite », réflexion minimale, limite de temps stricte.
// Les modèles récents (3.x) n'acceptent plus « thinkingBudget: 0 » mais « thinkingLevel: minimal » ; les plus anciens l'inverse.
// La réflexion compte dans la limite de jetons : on garde une marge pour que la réponse (JSON) ne soit jamais tronquée.
// Si un modèle ou une option est refusé, on passe au suivant (mémorisé pour la session).
type ThinkMode = 'level' | 'budget' | 'none';
const flags: { think: ThinkMode; dead: Set<string> } = { think: 'level', dead: new Set() };
const THINK: Record<ThinkMode, object | null> = {
  level: { thinkingLevel: 'minimal' },
  budget: { thinkingBudget: 0 },
  none: null,
};
/** Modèles refusés pendant cette session (mémorisés : on ne les ré-essaie pas). */
export const isModelDead = (m: string): boolean => flags.dead.has(m);
export const markModelDead = (m: string): void => void flags.dead.add(m);
const NEXT_THINK: Record<ThinkMode, ThinkMode | null> = { level: 'budget', budget: 'none', none: null };
export function modelChain(fast = true): string[] {
  const list = fast ? [...(CONFIG.geminiFastModels || []), CONFIG.geminiModel] : [CONFIG.geminiModel];
  return [...new Set(list)].filter((m) => m && !flags.dead.has(m));
}
// Texte d'une réponse JSON, même entourée de texte ou de balises ```json
export function parseJSON(txt: string): unknown {
  try {
    return JSON.parse(txt);
  } catch {
    /* texte autour du JSON */
  }
  const a = txt.indexOf('{'),
    b = txt.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(txt.slice(a, b + 1));
  throw new Error('json');
}

/** Partie d'un message Gemini : texte ou donnée en ligne (snake_case de l'API REST, camelCase du SDK). */
export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type?: string; data: string };
  inlineData?: { mimeType?: string; data: string };
  thought?: boolean;
}
// Aucune image de la caméra ne part vers Gemini sans le consentement explicite du patient (réglage imageConsent)
export const isImagePart = (p: GeminiPart | null | undefined): boolean =>
  !!(
    p &&
    ((p.inline_data && /^image\//.test(p.inline_data.mime_type || '')) ||
      (p.inlineData && /^image\//.test(p.inlineData.mimeType || '')))
  );
export const stripImages = (
  parts: readonly GeminiPart[] | null | undefined,
  ok: boolean = imageConsent(),
): GeminiPart[] => (ok ? (parts as GeminiPart[]) : (parts || []).filter((p) => !isImagePart(p)));

export interface GeminiOptions {
  key?: string;
  sys: string;
  parts: readonly GeminiPart[];
  maxTokens?: number;
  temperature?: number;
  schema?: object | null;
  timeout?: number;
  fast?: boolean;
  _retry?: boolean;
}
interface GeminiError extends Error {
  status?: number;
  body?: string;
}
interface GeminiReply {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
}
export async function gemini({
  key = aiKey(),
  sys,
  parts,
  maxTokens = 180,
  temperature = 0.5,
  schema = null,
  timeout = 8000,
  fast = true,
  _retry = false,
}: GeminiOptions): Promise<string> {
  parts = stripImages(parts);
  if (!_retry) aiCount();
  const chain = modelChain(fast);
  const model = chain[0] || CONFIG.geminiModel;
  const gen: Record<string, unknown> = { temperature, maxOutputTokens: maxTokens + 400 };
  if (schema) {
    gen['responseMimeType'] = 'application/json';
    gen['responseSchema'] = schema;
  }
  if (THINK[flags.think]) gen['thinkingConfig'] = THINK[flags.think];
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  const again = (): Promise<string> =>
    gemini({ key, sys, parts, maxTokens, temperature, schema, timeout, fast, _retry: true });
  try {
    const r = await genFetch(
      model,
      { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts }], generationConfig: gen },
      key,
      ctl.signal,
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (r.status === 400 && /think/i.test(body) && NEXT_THINK[flags.think] !== undefined && flags.think !== 'none') {
        flags.think = NEXT_THINK[flags.think] || 'none';
        return again();
      }
      if (
        (r.status === 404 ||
          (r.status === 400 && /model|not (found|supported)/i.test(body)) ||
          (r.status === 403 && /model/i.test(body))) &&
        chain.length > 1
      ) {
        flags.dead.add(model);
        return again();
      }
      const err: GeminiError = new Error('gemini ' + r.status);
      err.status = r.status;
      err.body = body.slice(0, 300);
      throw err;
    }
    const j = (await r.json()) as GeminiReply;
    const out = (j.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || '')
      .join('')
      .trim();
    if (!out && j.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('gemini max tokens');
    return out;
  } finally {
    clearTimeout(tm);
  }
}
export const geminiDirect = (
  key: string,
  sys: string,
  parts: readonly GeminiPart[],
  maxTokens = 180,
): Promise<string> => gemini({ key, sys, parts, maxTokens });

/** Appel du relais du site (Cloudflare Pages : `coachEndpoint`) : texte renvoyé par le serveur, qui garde la clé secrète. */
export async function callProxy(body: object): Promise<string> {
  if (!CONFIG.coachEndpoint) throw new Error('no endpoint');
  const r = await fetch(coachUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: getAiLang(), langLabel: aiLangInfo().label, ...body }),
  });
  if (!r.ok) throw new Error('proxy ' + r.status);
  const j = (await r.json()) as { text?: string };
  return (j.text || '').trim();
}

/** Commentaire du coach : type de demande ('set' fin de série, 'week' revue, 'reply' réponse au commentaire du patient). */
export type CoachKind = keyof typeof SYS;
export async function askCoach(kind: CoachKind, d: unknown, imageB64?: string | null): Promise<string> {
  const key = aiKey();
  if (!navigator.onLine) throw new Error('offline');
  if (!imageConsent()) imageB64 = null;
  if (key) {
    const parts: GeminiPart[] = [{ text: JSON.stringify(d) }];
    if (imageB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageB64 } });
    return gemini({
      key,
      sys: `${SYS[kind]} ${langLine()}`,
      parts,
      maxTokens: 160,
      timeout: kind === 'week' ? 15000 : 8000,
    });
  }
  return callProxy({ data: d, image: imageB64 || null, kind });
}

/** Port IA (AiPort) : Gemini direct ou relais ; refuse toute image sans le consentement de l'utilisateur. */
export function createGeminiAi(): AiPort {
  return {
    available: () => aiAvailable(),
    async generate(req: AiRequest): Promise<AiResponse> {
      if (req.images?.length && req.imageConsent !== true)
        throw new AppError('image_consent_required', 'Consentement image requis');
      const parts: GeminiPart[] = [{ text: req.prompt }];
      for (const im of req.images || []) parts.push({ inline_data: { mime_type: im.mime, data: im.base64 } });
      const model = modelChain(true)[0] || CONFIG.geminiModel;
      const sys = `${req.system || ''} Always answer in ${langInfo(req.lang).label}.`.trim();
      const text = await gemini({
        sys,
        parts,
        ...(req.json ? { schema: { type: 'OBJECT' } } : {}),
      });
      return { text, model };
    },
  };
}
