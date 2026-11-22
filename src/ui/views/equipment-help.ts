// Aide « matériel de remplacement » : objets de maison proposés (kg + prise + sécurité) et avis sur un autre objet
// (IA ou règle locale). Reprise de www/js/equipui.js.
import { t, tr, getLang, aiLangInfo } from '../../../www/js/i18n.js';
import { EXERCISES as EXERCISE_DATA, EQUIP as EQUIP_DATA } from '../../../www/js/data/exercises.js';
import { substitutesFor, localVerdict, targetKg, missing, haveList } from '../../../www/js/equip.js';
import { kgText } from '../../../www/js/data/substitutes.js';
import * as P from '../../../www/js/program.js';
import { aiKey } from '../../../www/js/store.js';
import { gemini, parseJSON, langLine, startDictation, dictationMode } from '../../../www/js/coach.js';
import { profile as currentProfile, updateProfile, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { isNil } from '../util.ts';

interface EquipExercise {
  name: unknown;
  region: string;
  steps: unknown;
  equip?: string[];
}
const EXERCISES = EXERCISE_DATA as unknown as Record<string, EquipExercise | undefined>;
const EQUIP = EQUIP_DATA as unknown as Record<string, unknown>;

/** Objet choisi par le patient pour un exercice (profil.equipChoice[exId]). */
export interface EquipChoice {
  id?: string;
  name: string;
  kg?: number | null;
  verdict?: string;
  custom?: boolean;
  ts?: number;
}
interface EquipProfile extends Profile {
  equipChoice?: Record<string, EquipChoice>;
}
/** Avis sur un objet : { verdict, kgEstimate, reason, source }. */
export interface EquipVerdict {
  verdict: string;
  kgEstimate: number | null;
  reason: string;
  source?: string;
}
/** Remplaçant proposé par equip.js (substitutesFor). */
interface Substitute {
  equip: string;
  match?: string;
  kg: number | number[] | null;
  useKg?: number;
  sub: { id: string; name: unknown; grip: unknown; safety: unknown };
}

const VERDICTS = ['ok', 'caution', 'no'];
const kgStr = (kg: number | number[]): string => {
  const s: string = kgText(kg);
  return getLang() === 'fr' || /^(es|pt)$/.test(getLang()) ? s : s.replace(',', '.');
};
const kgOf = (x: Substitute): number | number[] =>
  (x.useKg && Array.isArray(x.kg) ? x.useKg : x.kg) as number | number[];
const levelOf = (ex: string, profile: unknown): number => {
  try {
    return P.levelOf(profile || {}, ex);
  } catch {
    return 3;
  }
};

// Avis : IA si une clé est disponible (perso ou partagée par le clinicien), sinon règle locale ; repli local si l'IA échoue.
export async function judgeObject(
  exId: string,
  level: number,
  text: string,
  { ai = !!aiKey() }: { ai?: boolean } = {},
): Promise<EquipVerdict | null> {
  const local: EquipVerdict | null = localVerdict(exId, level, text);
  if (!local) return null;
  if (!ai) return local;
  const ex = EXERCISES[exId]!;
  const target: number | null = targetKg(exId, level);
  const sys = `You are a careful physiotherapy assistant. A patient has no gym equipment and wants to use a household object for ONE exercise. Judge if it suits THIS exercise: estimated weight vs target load, grip, safety and stability. ${langLine()} Reason: at most 2 short sentences. verdict: "ok" = suitable, "caution" = suitable with precautions, "no" = not suitable. kgEstimate: estimated weight of the object in kg (0 if not applicable).`;
  const info = `Exercise: ${tr(ex.name)} (${ex.region}), level ${level}/5. Planned equipment: ${(ex.equip || []).map((e) => tr(EQUIP[e])).join(', ') || 'none'}. Target load: ${isNil(target) ? 'no added weight' : target + ' kg'}. Steps: ${([] as unknown[]).concat(tr(ex.steps)).join(' ')}\nObject proposed by the patient (answer in ${aiLangInfo()!.label}): ${String(text).slice(0, 200)}`;
  const schema = {
    type: 'OBJECT',
    properties: {
      verdict: { type: 'STRING', enum: VERDICTS },
      kgEstimate: { type: 'NUMBER' },
      reason: { type: 'STRING' },
    },
    required: ['verdict', 'kgEstimate', 'reason'],
  };
  try {
    const r = parseJSON(
      await gemini({
        sys,
        parts: [{ text: info }],
        maxTokens: 220,
        temperature: 0.2,
        schema,
        timeout: 10000,
      } as unknown as Parameters<typeof gemini>[0]),
    ) as { verdict: string; kgEstimate: unknown; reason?: unknown };
    if (!VERDICTS.includes(r.verdict) || !String(r.reason || '').trim()) return local;
    // L'IA ne peut pas rendre « adéquat » un objet manifestement dangereux selon la règle locale
    const verdict = local.verdict === 'no' && /unsafe|fragile/.test(local.reason) ? 'no' : r.verdict;
    return {
      verdict,
      kgEstimate: Number.isFinite(+(r.kgEstimate as number)) ? +(r.kgEstimate as number) : local.kgEstimate,
      reason: String(r.reason).trim(),
      source: 'ai',
    };
  } catch (e) {
    console.warn('equip AI', e);
    return local;
  }
}

const saved = (profile: EquipProfile | null | undefined, exId: string): EquipChoice | null =>
  profile?.equipChoice?.[exId] || null;
export const choiceLabel = (c: { name: string; kg?: number | string | null }): string =>
  `${c.name}${c.kg ? ` ≈ ${kgStr(+c.kg)} kg` : ''}`;
const verdictHtml = (v: EquipVerdict): string =>
  `<div class="eq-verdict ${v.verdict}" role="status"><b>${t('eqV_' + v.verdict)}</b>${v.kgEstimate ? ` · ≈ ${kgStr(+v.kgEstimate)} kg` : ''}<p>${esc(v.reason)}</p><small class="muted">${t(v.source === 'ai' ? 'eqSrcAI' : 'eqSrcLocal')}</small></div>`;

// Bloc « Tu n'as pas ce matériel ? Utilise : … » + champ « Autre objet ? ». '' si l'exercice n'a pas de matériel remplaçable.
export function equipHelpHtml(exId: string, level: number, profile?: EquipProfile | null): string {
  const ex = EXERCISES[exId];
  if (!ex) return '';
  const have = haveList(profile);
  const miss: string[] = have ? missing(exId, have) : ex.equip || [];
  const subs: Substitute[] = substitutesFor(exId, level, have);
  if (!subs.length) return '';
  const target: number | null = targetKg(exId, level);
  const mine = saved(profile, exId);
  const top = subs.slice(0, 3);
  const missNames = (miss.length ? miss : (ex.equip ?? []))
    .filter((e) => subs.some((s) => s.equip === e))
    .map((e) => String(tr(EQUIP[e])).toLowerCase())
    .join(', ');
  const open = miss.length ? 'open' : '';
  return `<details class="eq-help" data-eqhelp="${esc(exId)}" ${open}><summary>${t('eqNoX', { x: esc(missNames) })}</summary>
    ${mine ? `<div class="eq-mine"><b>${t('eqYours', { obj: esc(choiceLabel(mine)) })}</b> <button class="btn sm ghost" data-eq-forget>${t('eqForget')}</button></div>` : ''}
    ${!isNil(target) ? `<p class="small muted eq-target">${t('eqTarget', { kg: kgStr(target), lv: level })}</p>` : ''}
    <ul class="eq-subs">${top
      .map(
        (
          x,
          i,
        ) => `<li><div class="eq-sub-h"><b>${esc(tr(x.sub.name))}</b>${x.kg ? ` <span class="chip sm ${x.match === 'ok' ? 'pos' : ''}">≈ ${kgStr(kgOf(x))} kg</span>` : ''}<button class="btn sm ghost" data-eq-pick="${i}">${t('eqUse')}</button></div>
      <div class="small">${esc(tr(x.sub.grip))}</div><div class="small muted">${esc(tr(x.sub.safety))}</div></li>`,
      )
      .join('')}</ul>
    <label class="eq-other"><b>${t('eqOther')}</b>
      <div class="row" style="gap:6px"><input type="text" class="eq-input" maxlength="120" placeholder="${esc(t('eqOtherPh'))}" autocomplete="off">
      ${dictationMode() ? `<button class="btn sm ghost" type="button" data-eq-mic aria-label="${esc(t('eqMic'))}">&#127908;</button>` : ''}
      <button class="btn sm" type="button" data-eq-check>${t('eqCheck')}</button></div></label>
    <div class="eq-out" aria-live="polite"></div></details>`;
}

// Petit résumé pour l'aperçu de séance : objet choisi, sinon meilleur remplacement si du matériel manque. '' sinon.
export function equipChipHtml(exId: string, profile?: EquipProfile | null): string {
  const mine = saved(profile, exId);
  if (mine) return `<span class="chip sm eq-chip">${esc(choiceLabel(mine))}</span>`;
  const have = haveList(profile);
  if (!have || !missing(exId, have).length) return '';
  const b: Substitute | undefined = substitutesFor(exId, levelOf(exId, profile), have)[0];
  if (!b) return '';
  return `<span class="chip sm eq-chip">${t('eqChipSub', { obj: esc(`${tr(b.sub.name)}${b.kg ? ` ≈ ${kgStr(kgOf(b))} kg` : ''}`) })}</span>`;
}

async function remember(exId: string, choice: EquipChoice): Promise<void> {
  const cur = (currentProfile() as EquipProfile | undefined)?.equipChoice || {};
  await updateProfile({ equipChoice: { ...cur, [exId]: { ...choice, ts: Date.now() } } });
}
async function forget(exId: string): Promise<void> {
  const cur: Record<string, EquipChoice> = { ...((currentProfile() as EquipProfile | undefined)?.equipChoice || {}) };
  Reflect.deleteProperty(cur, exId);
  await updateProfile({ equipChoice: cur });
}

/** Séance de dictée vocale (coach.js). */
interface DictationSession {
  stop(): void;
}

// Branche le bloc (appeler après avoir inséré equipHelpHtml dans `root`).
export function bindEquipHelp(root: ParentNode | null | undefined, exId: string, level: number): void {
  const box = root?.querySelector?.<HTMLElement>(`[data-eqhelp="${exId}"]`);
  if (!box) return;
  const out = box.querySelector<HTMLElement>('.eq-out')!;
  const input = box.querySelector<HTMLInputElement>('.eq-input')!;
  const ranked = (): Substitute[] => substitutesFor(exId, level, haveList(currentProfile()));
  box.querySelectorAll<HTMLElement>('[data-eq-pick]').forEach((b) => {
    b.onclick = async () => {
      const x = ranked()[+(b.dataset['eqPick'] ?? 0)];
      if (!x) return;
      await remember(exId, {
        id: x.sub.id,
        name: tr(x.sub.name),
        kg: (Array.isArray(x.kg) ? x.useKg : x.kg) as number | null,
        verdict: 'ok',
      });
      out.innerHTML = `<div class="eq-verdict ok" role="status">${t('eqSaved')}</div>`;
    };
  });
  const f = box.querySelector<HTMLElement>('[data-eq-forget]');
  if (f)
    f.onclick = async () => {
      await forget(exId);
      box.querySelector('.eq-mine')?.remove();
    };
  const check = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    out.innerHTML = `<p class="muted small">${t('eqChecking')}</p>`;
    try {
      const v = (await judgeObject(exId, level, text))!;
      out.innerHTML =
        verdictHtml(v) + (v.verdict !== 'no' ? `<button class="btn sm ghost" data-eq-keep>${t('eqUse')}</button>` : '');
      const keep = out.querySelector<HTMLElement>('[data-eq-keep]');
      if (keep)
        keep.onclick = async () => {
          await remember(exId, { name: text, kg: v.kgEstimate || null, verdict: v.verdict, custom: true });
          keep.replaceWith(Object.assign(document.createElement('small'), { textContent: t('eqSaved') }));
        };
    } catch (e) {
      console.warn(e);
      out.innerHTML = `<p class="small">${t('eqErr')}</p>`;
    }
  };
  box.querySelector<HTMLElement>('[data-eq-check]')!.onclick = check;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void check();
    }
  });
  const mic = box.querySelector<HTMLElement>('[data-eq-mic]');
  if (mic) {
    let ses: DictationSession | null = null;
    mic.onclick = async () => {
      if (ses) {
        ses.stop();
        return;
      }
      mic.classList.add('on');
      ses = await startDictation({
        onText: (txt: string, fin: boolean) => {
          input.value = txt;
          if (fin) {
            mic.classList.remove('on');
            ses = null;
            if (txt) void check();
          }
        },
        onState: (s: string) => {
          if (s !== 'listening' && s !== 'transcribing') {
            mic.classList.remove('on');
            if (s !== 'idle') ses = null;
          }
        },
      });
      if (!ses) mic.classList.remove('on');
    };
  }
}
