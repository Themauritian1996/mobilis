// #/prothese/<patientId> : profil prothétique (document `patients`, champ `prosthesis`), historique des évaluations
// `prosthetic_gait`, avant/après ajustement. Vue réservée au clinicien et au prothésiste.
import type { Assessment, Patient, ProstheticProfile } from '../../../core/types/clinical.ts';
import {
  compareProstheticAssessments,
  parseProstheticAssessment,
  prostheticHistory,
  PROSTHESIS_LEVELS,
  PROSTHESIS_SIDES,
  summarize,
  validateProfile,
  type DeviationDelta,
  type ProstheticComparison,
} from '../../../domains/prosthetics/index.ts';
import { esc } from '../../components/html.ts';
import { toast } from '../../components/toast.ts';
import { hostOf, type Host } from '../../util.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { db, ensureCss, errMsg, fmtDate, lang, notice, screen, topbar } from './shared.ts';
import { t } from './strings.ts';

type TextField = 'etiology' | 'footType' | 'kneeType' | 'socket' | 'suspension' | 'assistiveDevice';

const opts = (values: readonly string[], prefix: string, current: string | undefined): string =>
  `<option value="">${esc(t('choose'))}</option>${values
    .map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(t(`${prefix}${v}`))}</option>`)
    .join('')}`;

function profileForm(p: ProstheticProfile | undefined): string {
  const text = (k: TextField): string =>
    `<label class="field"><span>${esc(t(k))}</span><input class="input" name="${k}" type="text" autocomplete="off" value="${esc(p?.[k] ?? '')}"></label>`;
  return `<form class="card pros-form" data-pros-form novalidate>
    <h2>${esc(t('profile'))}</h2>
    <label class="field"><span>${esc(t('level'))}</span><select class="input" name="level" required>${opts(PROSTHESIS_LEVELS, 'lvl_', p?.level)}</select></label>
    <label class="field"><span>${esc(t('side'))}</span><select class="input" name="side" required>${opts(PROSTHESIS_SIDES, 'side_', p?.side)}</select></label>
    ${text('etiology')}
    <label class="field"><span>${esc(t('amputationDate'))}</span><input class="input" name="amputationDate" type="date" value="${esc(p?.amputationDate ?? '')}"></label>
    ${text('footType')}${text('kneeType')}${text('socket')}${text('suspension')}${text('assistiveDevice')}
    <p class="pros-error small" data-pros-error role="alert" aria-live="assertive" hidden></p>
    <button class="btn" type="submit">${esc(t('save'))}</button>
  </form>`;
}

const nameOf = (d: DeviationDelta): string => (lang() === 'en' ? d.name_en : d.name_fr);

const group = (title: string, items: readonly DeviationDelta[], cls: string): string =>
  `<div class="pros-cmp-group ${cls}"><h3>${esc(title)} <span class="chip sm">${items.length}</span></h3>${
    items.length
      ? `<ul class="list-plain">${items
          .map(
            (d) =>
              `<li>${esc(nameOf(d))}${d.trend ? ` <span class="muted small">(${esc(t(`trend_${d.trend}`))})</span>` : ''}</li>`,
          )
          .join('')}</ul>`
      : `<p class="muted small">${esc(t('none'))}</p>`
  }</div>`;

/** Résumé prothétique comparé (déviations apparues, résolues, persistantes). */
export function comparisonHtml(c: ProstheticComparison): string {
  return `<div class="pros-cmp" aria-live="polite"><h3 class="pros-cmp-title">${esc(t('cmpTitle'))}</h3>
    ${c.warnings.map((w) => `<p class="banner">${esc(t(`w_${w}`))}</p>`).join('')}
    ${group(t('resolved'), c.resolved, 'pos')}${group(t('appeared'), c.appeared, 'neg')}${group(t('persistent'), c.persistent, 'warn')}
    ${c.unassessable.length ? group(t('unassessable'), c.unassessable, 'muted') : ''}
    <p class="muted small">${esc(t('absentBoth', { n: c.absentBoth }))}</p>
    <p class="muted small">${esc(t('validate'))}</p></div>`;
}

function historyHtml(list: readonly Assessment[], patientId: string): string {
  const rows = list
    .map((a) => {
      const p = parseProstheticAssessment(a.result);
      const s = p ? summarize(p) : null;
      const sum = s ? t('summary', { p: s.present, q: s.possible, o: s.observe }) : t('noReport');
      return `<div class="row between pros-hist-row"><span><b>${esc(fmtDate(a.performedAt))}</b><br><small class="muted">${esc(sum)}</small></span>
        <button class="btn sm ghost" data-go="#/prothese-res/${esc(a.id)}">${esc(t('open'))}</button></div>`;
    })
    .join('');
  return `<div class="card"><div class="row between"><h2 style="margin:0">${esc(t('history'))}</h2>
    <button class="btn sm" data-go="#/marche/${esc(patientId)}">${esc(t('newAnalysis'))}</button></div>
    ${rows ? `<div class="list" style="margin-top:12px">${rows}</div>` : `<p class="muted">${esc(t('noHistory'))}</p>`}</div>`;
}

function abHtml(list: readonly Assessment[]): string {
  if (list.length < 2)
    return `<div class="card muted"><h2 style="margin-top:0">${esc(t('ab'))}</h2><p>${esc(t('abNeedTwo'))}</p></div>`;
  const label = (a: Assessment): string => {
    const p = parseProstheticAssessment(a.result);
    const s = p ? summarize(p) : null;
    return t('evalLabel', {
      date: fmtDate(a.performedAt),
      s: s ? t('summary', { p: s.present, q: s.possible, o: s.observe }) : t('noReport'),
    });
  };
  const o = (sel: number): string =>
    list
      .map((a, i) => `<option value="${esc(a.id)}"${i === sel ? ' selected' : ''}>${esc(label(a))}</option>`)
      .join('');
  // Liste triée de la plus récente à la plus ancienne : A (avant) = la deuxième, B (après) = la plus récente.
  return `<div class="card pros-ab"><h2 style="margin-top:0">${esc(t('ab'))}</h2><p class="muted small">${esc(t('abHelp'))}</p>
    <label class="field"><span>${esc(t('evalA'))}</span><select class="input" data-pros-a>${o(1)}</select></label>
    <label class="field"><span>${esc(t('evalB'))}</span><select class="input" data-pros-b>${o(0)}</select></label>
    <div data-pros-cmp></div>
    <button class="btn" data-pros-open>${esc(t('abOpen'))}</button></div>`;
}

export async function viewProsthesisPatient(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = hostOf(ctx.root as Host);
  const patientId = ctx.arg;
  const hash = location.hash;
  if (!patientId) {
    root.innerHTML = screen(`${topbar(t('title'), '#/patients')}${notice(t('noPatientNav'))}`);
    return;
  }
  root.innerHTML = screen(
    `${topbar(t('title'), `#/patient/${patientId}`)}<p class="muted" aria-live="polite">${esc(t('loading'))}</p>`,
  );
  let patient: Patient | null;
  let list: Assessment[];
  try {
    patient = await db().get('patients', patientId);
    list = prostheticHistory(
      await db().query('assessments', [{ field: 'patientId', op: '==', value: patientId }]),
      patientId,
    );
  } catch (e) {
    if (location.hash === hash)
      root.innerHTML = screen(`${topbar(t('title'), '#/patients')}${notice(t('loadError', { msg: errMsg(e) }))}`);
    return;
  }
  if (location.hash !== hash) return; // l'utilisateur a changé d'écran pendant le chargement
  if (!patient) {
    root.innerHTML = screen(`${topbar(t('title'), '#/patients')}${notice(t('notFound'))}`);
    return;
  }
  let current: Patient = patient;
  const name = patient.displayName ? ` — ${patient.displayName}` : '';
  root.innerHTML = screen(`${topbar(`${t('title')}${name}`, `#/patient/${patientId}`)}
    ${profileForm(patient.prosthesis)}${historyHtml(list, patientId)}${abHtml(list)}
    <p class="muted small">${esc(t('validate'))}</p>`);

  // Profil
  const form = root.querySelector<HTMLFormElement>('[data-pros-form]');
  const err = root.querySelector<HTMLElement>('[data-pros-error]');
  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const get = (k: string): string => String(fd.get(k) ?? '');
    const res = validateProfile({
      level: get('level'),
      side: get('side'),
      etiology: get('etiology'),
      amputationDate: get('amputationDate'),
      footType: get('footType'),
      kneeType: get('kneeType'),
      socket: get('socket'),
      suspension: get('suspension'),
      assistiveDevice: get('assistiveDevice'),
    });
    if (!res.ok) {
      const first = res.errors[0];
      if (err) {
        err.textContent = res.errors
          .map((e) => t(e === 'level' ? 'errLevel' : e === 'side' ? 'errSide' : 'errDate'))
          .join(' ');
        err.hidden = false;
      }
      form.querySelector<HTMLElement>(first === 'date' ? '[name=amputationDate]' : `[name=${first}]`)?.focus();
      return;
    }
    if (err) err.hidden = true;
    const next: Patient = {
      ...current,
      prosthesis: res.profile as unknown as ProstheticProfile,
      updatedAt: new Date().toISOString() as Patient['updatedAt'],
    };
    void db()
      .set('patients', patientId, next)
      .then(() => {
        current = next;
        toast(t('saved'));
      })
      .catch((e: unknown) => toast(t('saveError', { msg: errMsg(e) })));
  });

  // Avant / après
  const selA = root.querySelector<HTMLSelectElement>('[data-pros-a]');
  const selB = root.querySelector<HTMLSelectElement>('[data-pros-b]');
  const out = root.querySelector<HTMLElement>('[data-pros-cmp]');
  const open = root.querySelector<HTMLButtonElement>('[data-pros-open]');
  const refresh = (): void => {
    if (!selA || !selB || !out || !open) return;
    const same = selA.value === selB.value;
    open.disabled = same;
    if (same) {
      out.innerHTML = `<p class="muted small">${esc(t('abSame'))}</p>`;
      return;
    }
    const pa = parseProstheticAssessment(list.find((x) => x.id === selA.value)?.result);
    const pb = parseProstheticAssessment(list.find((x) => x.id === selB.value)?.result);
    out.innerHTML =
      pa && pb
        ? comparisonHtml(compareProstheticAssessments(pa, pb))
        : `<p class="muted small">${esc(t('noReport'))}</p>`;
  };
  selA?.addEventListener('change', refresh);
  selB?.addEventListener('change', refresh);
  open?.addEventListener('click', () => {
    if (selA && selB && selA.value !== selB.value) location.hash = `#/marche-ab/${selA.value}/${selB.value}`;
  });
  refresh();
}
