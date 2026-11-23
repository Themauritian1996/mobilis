// Écrans du dossier patient : liste (#/patients), fiche (#/patient/<id>), « Mon dossier » (#/dossier, patient connecté).
import {
  AMPUTATION_LEVELS,
  SEXES,
  SIDES,
  buildTimeline,
  deletePatientRecord,
  ensureSelfPatient,
  loadPatientRecords,
  newPatient,
  newRecordId,
  searchPatients,
  updatePatient,
  validatePatientInput,
  type PatientInput,
  type TimelineItem,
} from '../../../domains/clinic/patients.ts';
import type { Assessment, Patient } from '../../../core/types/clinical.ts';
import { accountRecords } from '../../../services/db/records-install.ts';
import { go, profile } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { nav } from '../../components/nav.ts';
import { confirmSheet, sheet } from '../../components/sheet.ts';
import { toast } from '../../components/toast.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { mountAnnotations } from './annotations-ui.ts';
import {
  bannerHtml,
  db,
  ensureCss,
  fmtDate,
  isForeign,
  isOnlineAccount,
  myUid,
  nowIso,
  patientSubtitle,
  role,
  shareState,
  syncThen,
  topbar,
} from './shared.ts';
import { tp } from './strings.ts';

const navRoleNow = (): string | undefined => (profile()?.role === 'clinician' ? 'clinician' : 'patient');
const screen = (inner: string, active: string): string =>
  `<section class="screen pt-screen">${bannerHtml()}${inner}</section>${nav(active, navRoleNow())}`;
const stillOn = (hash: string): boolean => location.hash === hash;

// ---------------------------------------------------------------- Formulaire d'identité
const opt = (v: string, label: string, cur: unknown): string =>
  `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;

function identityForm(p?: Patient): string {
  return `<form class="pt-form" novalidate>
    <label class="field"><span>${esc(tp('name'))}</span><input class="input" name="displayName" required maxlength="120" autocomplete="off" value="${esc(p?.displayName ?? '')}"><small class="muted">${esc(tp('nameHint'))}</small></label>
    <div class="pt-grid">
      <label class="field"><span>${esc(tp('birthYear'))}</span><input class="input" name="birthYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" value="${esc(p?.birthYear ?? '')}"></label>
      <label class="field"><span>${esc(tp('sex'))}</span><select class="input" name="sex">${opt('', tp('choose'), p?.sex ?? '')}${SEXES.map((s) => opt(s, tp(`sex_${s}`), p?.sex)).join('')}</select></label>
      <label class="field"><span>${esc(tp('height'))}</span><input class="input" name="heightCm" type="number" inputmode="decimal" min="50" max="250" step="0.5" value="${esc(p?.heightCm ?? '')}"><small class="muted">${esc(tp('heightHint'))}</small></label>
      <label class="field"><span>${esc(tp('side'))}</span><select class="input" name="affectedSide">${opt('', tp('choose'), p?.affectedSide ?? '')}${SIDES.map((s) => opt(s, tp(`side_${s}`), p?.affectedSide)).join('')}</select></label>
    </div>
    <fieldset class="pt-fieldset"><legend>${esc(tp('prosthesis'))}</legend><div class="pt-grid">
      <label class="field"><span>${esc(tp('amputLevel'))}</span><select class="input" name="level">${opt('', tp('choose'), p?.prosthesis?.level ?? '')}${AMPUTATION_LEVELS.map((s) => opt(s, tp(`level_${s}`), p?.prosthesis?.level)).join('')}</select></label>
      <label class="field"><span>${esc(tp('amputSide'))}</span><select class="input" name="pside">${SIDES.filter(
        (s) => s !== 'none',
      )
        .map((s) => opt(s, tp(`side_${s}`), p?.prosthesis?.side ?? 'left'))
        .join('')}</select></label>
    </div></fieldset>
    <p class="pt-errors neg small" role="alert" aria-live="assertive"></p>
  </form>`;
}

function readForm(form: HTMLFormElement): PatientInput {
  const f = new FormData(form);
  const s = (k: string): string => String(f.get(k) ?? '').trim();
  const n = (k: string): number | null => (s(k) ? Number(s(k).replace(',', '.')) : null);
  const level = s('level');
  return {
    displayName: s('displayName'),
    birthYear: n('birthYear'),
    heightCm: n('heightCm'),
    sex: (s('sex') || null) as NonNullable<Patient['sex']> | null,
    affectedSide: (s('affectedSide') || null) as NonNullable<Patient['affectedSide']> | null,
    prosthesis: level ? ({ level, side: s('pside') || 'left' } as NonNullable<PatientInput['prosthesis']>) : null,
  };
}

/** Feuille de saisie : renvoie la saisie validée, ou null si annulée. */
function identitySheet(title: string, p?: Patient): Promise<PatientInput | null> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: PatientInput | null): void => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const bg = sheet(
      `<h3>${esc(title)}</h3>${identityForm(p)}<div class="row"><button class="btn ghost" data-f="no">${esc(tp('cancel'))}</button><button class="btn" data-f="ok">${esc(tp('save'))}</button></div>`,
      { onClose: () => fin(null) },
    );
    const form = bg.querySelector<HTMLFormElement>('form')!;
    const ok = (): void => {
      const input = readForm(form);
      const errs = validatePatientInput(input, new Date().getFullYear());
      if (errs.length) {
        form.querySelector('.pt-errors')!.textContent = errs.map((e) => tp(`err_${e}`)).join(' ');
        return;
      }
      bg.remove();
      fin(input);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      ok();
    };
    bg.querySelector<HTMLButtonElement>('[data-f="no"]')!.onclick = () => {
      bg.remove();
      fin(null);
    };
    bg.querySelector<HTMLButtonElement>('[data-f="ok"]')!.onclick = ok;
    form.querySelector<HTMLInputElement>('[name="displayName"]')?.focus();
  });
}

// ---------------------------------------------------------------- Liste
let lastQuery = '';

export async function viewPatientList(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const hash = location.hash;
  ctx.root.innerHTML = screen(
    `<div class="topbar"><h1>${esc(tp('listTitle'))}</h1><button class="btn sm" data-a="new">${icon('plus', 16)} ${esc(tp('newPatient'))}</button></div>
    ${isOnlineAccount() ? '' : `<div class="banner" style="margin-bottom:12px">${icon('shield', 20)}<div>${esc(tp('localOnly'))}</div></div>`}
    <label class="field pt-search"><span class="sr-only">${esc(tp('search'))}</span><input class="input" type="search" id="pt-q" placeholder="${esc(tp('search'))}" aria-label="${esc(tp('search'))}" value="${esc(lastQuery)}"></label>
    <div id="pt-list" aria-live="polite"><div class="card muted">${esc(tp('loading'))}</div></div>`,
    'clinic',
  );
  let all: Patient[] = [];
  const box = ctx.root.querySelector<HTMLElement>('#pt-list')!;
  const draw = (): void => {
    const list = searchPatients(all, lastQuery);
    if (!all.length) {
      box.innerHTML = `<div class="card empty"><div class="empty-ic">${icon('stetho', 26)}</div><h3>${esc(tp('noPatients'))}</h3><p class="small" style="margin:4px 0 0">${esc(tp('noPatientsD'))}</p></div>`;
      return;
    }
    box.innerHTML = list.length
      ? `<div class="list linklist">${list
          .map(
            (p) =>
              `<button class="toggle" data-go="#/patient/${esc(encodeURIComponent(p.id))}"><span class="li-ic">${icon('user', 18)}</span><span class="grow"><b>${esc(p.displayName || '—')}</b><br><small class="muted">${esc(patientSubtitle(p))}</small></span><span class="chev" aria-hidden="true">${icon('chev', 18)}</span></button>`,
          )
          .join('')}</div>`
      : `<p class="muted">${esc(tp('noMatch'))}</p>`;
  };
  const load = async (): Promise<void> => {
    try {
      all = await db().query('patients', [{ field: 'ownerUid', op: '==', value: myUid() }]);
    } catch (e) {
      console.warn(e);
      all = [];
    }
    if (stillOn(hash)) draw();
  };
  await load();
  syncThen(() => void load());
  const q = ctx.root.querySelector<HTMLInputElement>('#pt-q')!;
  q.oninput = () => {
    lastQuery = q.value;
    draw();
  };
  ctx.root.querySelector<HTMLElement>('[data-a="new"]')!.onclick = async () => {
    const input = await identitySheet(tp('newPatient'));
    if (!input) return;
    const p = newPatient(input, { id: newRecordId('p_'), ownerUid: myUid(), now: nowIso() });
    try {
      await db().set('patients', p.id, p);
      toast(tp('saved'));
      go(`#/patient/${encodeURIComponent(p.id)}`);
    } catch (e) {
      console.warn(e);
      toast(tp('saveErr'), 4000);
    }
  };
}

// ---------------------------------------------------------------- Chronologie (commune clinicien / patient)
function resultHref(a: Assessment): string | null {
  if (a.kind === 'gait') return `#/marche-res/${encodeURIComponent(a.id)}`;
  if (a.kind === 'prosthetic_gait')
    return role() === 'clinician'
      ? `#/prothese-res/${encodeURIComponent(a.id)}`
      : `#/marche-res/${encodeURIComponent(a.id)}`;
  return null;
}

function shareChip(col: 'assessments' | 'followups', id: string): string {
  if (isForeign(col, id)) return `<span class="chip sm">${esc(tp('fromPatient'))}</span>`;
  const s = shareState(col, id);
  if (s === 'shared') return `<span class="chip sm pos">${esc(tp('sharedToClin'))}</span>`;
  if (s === 'pending') return `<span class="chip sm">${esc(tp('pendingToClin'))}</span>`;
  return '';
}

function itemHtml(it: TimelineItem, patientId: string, selectable: boolean): string {
  switch (it.kind) {
    case 'assessment': {
      const a = it.doc;
      const href = resultHref(a);
      return `<article class="card pt-item" data-kind="assessment"><header class="row between"><div class="grow"><span class="eyebrow">${esc(fmtDate(it.at))}</span><h3>${esc(tp(`kind_${a.kind}`))}</h3>
        <div class="small muted">${esc(tp('nFindings', { n: a.findings.length }))}${a.conditions && Object.keys(a.conditions).length ? ' · ' + esc(Object.values(a.conditions).filter(Boolean).join(' · ')) : ''}</div>${shareChip('assessments', a.id)}</div>
        ${selectable ? `<label class="pt-cmp"><input type="checkbox" data-cmp="${esc(a.id)}"> <span class="small">${esc(tp('compareSel'))}</span></label>` : ''}</header>
        ${href ? `<button class="btn sm ghost" data-go="${esc(href)}">${esc(tp('open'))}</button>` : ''}
        <div data-notes="${esc(a.id)}"></div></article>`;
    }
    case 'comparison':
      return `<article class="card pt-item" data-kind="comparison"><span class="eyebrow">${esc(fmtDate(it.at))}</span><h3>${esc(tp('comparison'))}</h3>
        <button class="btn sm ghost" data-go="#/marche-ab/${it.assessmentIds.map((x) => encodeURIComponent(x)).join('/')}">${esc(tp('openComparison'))}</button>
        <div data-notes="${esc(it.assessmentIds.join('|'))}"></div></article>`;
    case 'intervention':
      return `<article class="card pt-item" data-kind="intervention"><span class="eyebrow">${esc(fmtDate(it.at))}</span><h3>${esc(tp('intervention'))} · ${esc(tp(`int_${it.doc.type}`))}</h3>
        ${
          it.doc.details
            ? `<div class="small muted">${esc(
                Object.entries(it.doc.details)
                  .map(([k, v]) => `${k} : ${v}`)
                  .join(' · '),
              )}</div>`
            : ''
        }
        <button class="btn sm ghost" data-go="#/suivi/${esc(encodeURIComponent(patientId))}">${esc(tp('actFollow'))}</button></article>`;
    case 'plan':
      return `<article class="card pt-item" data-kind="plan"><span class="eyebrow">${esc(fmtDate(it.at))}</span><h3>${esc(tp('plan', { n: it.doc.revision }))}</h3>
        <div class="small muted">${esc(tp(`plan_${it.doc.status}`))} · ${it.doc.actions.length} · ${it.doc.goals.length}</div>
        <button class="btn sm ghost" data-go="#/plan/${esc(encodeURIComponent(patientId))}">${esc(tp('open'))}</button></article>`;
    case 'followup': {
      const done = Object.values(it.doc.done).filter((x) => x.length).length;
      return `<article class="card pt-item" data-kind="followup"><span class="eyebrow">${esc(fmtDate(it.at))}</span><h3>${esc(tp('followup'))}</h3>
        <div class="small muted">${esc(tp('followupD', { a: done, b: it.doc.timepoints.length }))}</div>${shareChip('followups', it.doc.id)}
        <button class="btn sm ghost" data-go="#/suivi/${esc(encodeURIComponent(patientId))}">${esc(tp('open'))}</button></article>`;
    }
  }
}

async function drawTimeline(
  host: HTMLElement,
  patientId: string,
  items: TimelineItem[],
  opts: { selectable: boolean; redraw: () => void },
): Promise<void> {
  host.innerHTML = items.length
    ? `<div class="stack pt-timeline">${items.map((it) => itemHtml(it, patientId, opts.selectable)).join('')}</div>
       ${opts.selectable ? `<div class="pt-cmpbar" hidden><span class="small grow" aria-live="polite"></span><button class="btn sm ghost" data-a="cmpOpen">${esc(tp('openComparison'))}</button><button class="btn sm" data-a="cmpNote">${esc(tp('noteComparison'))}</button></div>` : ''}`
    : `<p class="muted">${esc(tp('timelineEmpty'))}</p>`;
  for (const el of host.querySelectorAll<HTMLElement>('[data-notes]')) {
    const ids = (el.dataset['notes'] ?? '').split('|').filter(Boolean);
    void mountAnnotations(el, { patientId, assessmentIds: ids, onChange: opts.redraw });
  }
  const bar = host.querySelector<HTMLElement>('.pt-cmpbar');
  if (!bar) return;
  const picked = (): string[] =>
    [...host.querySelectorAll<HTMLInputElement>('[data-cmp]:checked')].map((x) => x.dataset['cmp'] ?? '');
  const update = (): void => {
    const p = picked();
    bar.hidden = p.length === 0;
    bar.querySelector('span')!.textContent = p.length === 2 ? '' : tp('compareHint');
    bar.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = p.length !== 2));
  };
  host.querySelectorAll<HTMLInputElement>('[data-cmp]').forEach((c) => {
    c.onchange = () => {
      if (picked().length > 2) c.checked = false;
      update();
    };
  });
  bar.querySelector<HTMLElement>('[data-a="cmpOpen"]')!.onclick = () =>
    go(
      `#/marche-ab/${picked()
        .map((x) => encodeURIComponent(x))
        .join('/')}`,
    );
  bar.querySelector<HTMLElement>('[data-a="cmpNote"]')!.onclick = () => {
    const ids = picked();
    const box = document.createElement('div');
    host.prepend(box);
    // Ouvre directement la feuille de note de la comparaison
    void mountAnnotations(box, { patientId, assessmentIds: ids, onChange: opts.redraw, notes: [] }).then(() =>
      box.querySelector<HTMLElement>('[data-nadd]')?.click(),
    );
  };
}

// ---------------------------------------------------------------- Fiche (clinicien)
export async function viewPatientRecord(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const id = decodeURIComponent(ctx.arg ?? '');
  if (role() !== 'clinician') return viewMyRecord(ctx);
  const hash = location.hash;
  const p = id ? await db().get('patients', id) : null;
  if (!stillOn(hash)) return;
  if (!p || p.ownerUid !== myUid()) {
    ctx.root.innerHTML = screen(
      `${topbar(tp('listTitle'), '#/patients')}<div class="card muted"><p>${esc(tp('notFound'))}</p><button class="btn ghost" data-go="#/patients">${esc(tp('toPatients'))}</button></div>`,
      'clinic',
    );
    return;
  }
  const enc = encodeURIComponent(p.id);
  const linked = (await db().query('assessments', [{ field: 'patientId', op: '==', value: p.id }])).some((a) =>
    isForeign('assessments', a.id),
  );
  const actions: [string, string, string][] = [
    ['actGait', `#/marche/${enc}`, 'cam'],
    ['actPlan', `#/plan/${enc}`, 'target'],
    ['actAids', `#/aides/${enc}`, 'ruler'],
    ['actProsthesis', `#/prothese/${enc}`, 'layers'],
    ['actFollow', `#/suivi/${enc}`, 'clock'],
  ];
  ctx.root.innerHTML = screen(
    `${topbar(p.displayName || '—', '#/patients')}
    <div class="card pt-id"><div class="row between"><div class="grow"><span class="eyebrow">${esc(tp('identity'))}</span><div>${esc(patientSubtitle(p)) || '—'}</div>${linked ? `<span class="chip sm pos" style="margin-top:6px">${esc(tp('linked'))}</span>` : ''}</div>
      <button class="btn sm ghost" data-a="edit">${esc(tp('editIdentity'))}</button></div></div>
    <h2>${esc(tp('actions'))}</h2>
    <div class="pt-actions">${actions
      .map(
        ([k, h, ic]) =>
          `<button class="btn ${k === 'actGait' ? '' : 'ghost'} pt-act ${k === 'actProsthesis' && !p.prosthesis ? 'pt-act-soft' : ''}" data-go="${esc(h)}">${icon(ic, 18)} ${esc(tp(k))}</button>`,
      )
      .join('')}</div>
    <h2>${esc(tp('timeline'))}</h2><div id="pt-tl"><div class="card muted">${esc(tp('loading'))}</div></div>
    <div class="stack" style="margin-top:24px"><button class="btn ghost danger" data-a="del">${esc(tp('deleteRecord'))}</button></div>`,
    'clinic',
  );
  const tl = ctx.root.querySelector<HTMLElement>('#pt-tl')!;
  const redraw = async (): Promise<void> => {
    const recs = await loadPatientRecords(db(), p.id);
    if (stillOn(hash))
      await drawTimeline(tl, p.id, buildTimeline(recs), { selectable: true, redraw: () => void redraw() });
  };
  await redraw();
  syncThen(() => void redraw());
  ctx.root.querySelector<HTMLElement>('[data-a="edit"]')!.onclick = async () => {
    const input = await identitySheet(tp('editIdentity'), p);
    if (!input) return;
    try {
      const next = updatePatient(p, input, nowIso());
      await db().set('patients', next.id, next);
      toast(tp('saved'));
      void viewPatientRecord(ctx);
    } catch (e) {
      console.warn(e);
      toast(tp('saveErr'), 4000);
    }
  };
  ctx.root.querySelector<HTMLElement>('[data-a="del"]')!.onclick = async () => {
    if (
      !(await confirmSheet({
        title: tp('deleteRecordAsk'),
        text: tp('deleteRecordD'),
        ok: tp('deleteRecord'),
        danger: true,
      }))
    )
      return;
    try {
      await deletePatientRecord(db(), p.id, myUid(), nowIso());
      await accountRecords()?.dismissPatient(p.id);
      toast(tp('deleted'));
      go('#/patients');
    } catch (e) {
      console.warn(e);
      toast(tp('saveErr'), 4000);
    }
  };
}

// ---------------------------------------------------------------- Mon dossier (patient connecté)
export async function viewMyRecord(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const hash = location.hash;
  const uid = myUid();
  const prof = profile();
  // Fiche du patient (id = uid), créée si absente avec le nom du profil
  try {
    await ensureSelfPatient(db(), uid, { displayName: String(prof?.name ?? '') }, nowIso());
  } catch (e) {
    console.warn(e);
  }
  const me = await db().get('patients', uid);
  if (!stillOn(hash)) return;
  const sharing = isOnlineAccount() && !!prof?.rxCode && prof['shareProgress'] === true;
  const enc = encodeURIComponent(uid);
  ctx.root.innerHTML = screen(
    `${topbar(tp('mineTitle'), '#/home')}
    <p class="muted small">${esc(tp('mineIntro'))}</p>
    ${sharing ? '' : `<div class="banner" style="margin-bottom:12px">${icon('shield', 20)}<div>${esc(tp('mineShareOff'))}</div></div>`}
    ${me ? `<div class="card pt-id"><div class="row between"><div class="grow"><span class="eyebrow">${esc(tp('identity'))}</span><div><b>${esc(me.displayName || '—')}</b></div><div class="small muted">${esc(patientSubtitle(me))}</div></div><button class="btn sm ghost" data-a="edit">${esc(tp('editIdentity'))}</button></div></div>` : ''}
    <div class="pt-actions"><button class="btn pt-act" data-go="#/marche/${esc(enc)}">${icon('cam', 18)} ${esc(tp('actGait'))}</button><button class="btn ghost pt-act" data-go="#/suivi/${esc(enc)}">${icon('clock', 18)} ${esc(tp('actFollow'))}</button></div>
    <h2>${esc(tp('myAssessments'))}</h2><div id="pt-tl"><div class="card muted">${esc(tp('loading'))}</div></div>
    <h2>${esc(tp('myFollowups'))}</h2><div id="pt-fu"></div>
    <h2>${esc(tp('myData'))}</h2><div class="card small"><p id="pt-pending" class="muted" style="margin-top:0"></p><button class="btn danger" data-a="erase">${esc(tp('eraseMine'))}</button></div>`,
    'home',
  );
  const tl = ctx.root.querySelector<HTMLElement>('#pt-tl')!;
  const fu = ctx.root.querySelector<HTMLElement>('#pt-fu')!;
  const redraw = async (): Promise<void> => {
    const recs = await loadPatientRecords(db(), uid);
    if (!stillOn(hash)) return;
    const items = buildTimeline({ ...recs, interventions: [], plans: [], followups: [] });
    await drawTimeline(tl, uid, items, { selectable: true, redraw: () => void redraw() });
    const fitems = buildTimeline({
      assessments: [],
      annotations: [],
      interventions: [],
      plans: [],
      followups: recs.followups,
    });
    fu.innerHTML = fitems.length
      ? `<div class="stack">${fitems.map((it) => itemHtml(it, uid, false)).join('')}</div>`
      : `<p class="muted">${esc(tp('none'))}</p>`;
    const n = isOnlineAccount() ? (accountRecords()?.current().pending() ?? 0) : 0;
    ctx.root.querySelector('#pt-pending')!.textContent = n
      ? `${tp('syncPending', { n })}${navigator.onLine === false ? ' — ' + tp('offlineNote') : ''}`
      : '';
  };
  await redraw();
  syncThen(() => void redraw());
  const ed = ctx.root.querySelector<HTMLElement>('[data-a="edit"]');
  if (ed && me)
    ed.onclick = async () => {
      const input = await identitySheet(tp('editIdentity'), me);
      if (!input) return;
      try {
        await db().set('patients', uid, updatePatient(me, input, nowIso()));
        toast(tp('saved'));
        void viewMyRecord(ctx);
      } catch (e) {
        console.warn(e);
        toast(tp('saveErr'), 4000);
      }
    };
  ctx.root.querySelector<HTMLElement>('[data-a="erase"]')!.onclick = async () => {
    if (!(await confirmSheet({ title: tp('eraseMineAsk'), text: tp('eraseMineD'), ok: tp('eraseMine'), danger: true })))
      return;
    const r = accountRecords();
    try {
      if (r) await r.eraseMine({ remote: isOnlineAccount() });
      toast(tp('eraseDone'), 4000);
      go('#/home');
    } catch (e) {
      console.warn(e);
      toast(tp('eraseErr'), 5000);
    }
  };
}
