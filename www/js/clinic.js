// Mode clinicien : préparer un programme, l'envoyer par code / QR / lien, suivre et ajuster la progression du patient.
import { t, tp, tr, getLang, locale, LANGS, langInfo } from './i18n.js';
import { REGIONS, PATHOLOGIES } from './data/pathologies.js';
import { EXERCISES, EQUIP } from './data/exercises.js';
import { EQUIP_IDS, missing, alternatives } from './equip.js';
import { CONFIG } from './config.js';
import * as store from './store.js';
import { state, go, profile } from './state.js';
import { esc, icon, IC, toast, nav, mountFigs, figSvg, sheet, copyText, shareText, ds } from './ui.js';
import { layName, startTrial } from './onboarding.js';
import * as P from './program.js';
import { doseText } from './train.js';
import { rxSectionProm, clinicPanelProm } from './questionnaires.js';
import { rxSectionRom, clinicPanelRom } from './rom.js';
import { rxSectionProtocol } from './protocols-ui.js';

// report.js (rapports PDF) : chargé à la demande, l'interface reste utilisable s'il manque
let reportMod; const loadReport = async () => (reportMod !== undefined ? reportMod : (reportMod = await import('./report.js').catch(() => null)));

const $app = () => document.getElementById('app');
const fmtDate = (ts) => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const tk = (k, fb) => { const v = t(k); return v === k ? tr(fb) : v; };
const RX_PARTIAL = { fr: 'Compter les répétitions partielles', en: 'Count partial reps' }, RX_PARTIAL_D = { fr: 'Désactive pour exiger l\'amplitude complète (≥ 60 %) pour cet exercice.', en: 'Turn off to require near-full range (≥ 60%) for this exercise.' };
// ---------- Partage de l'accès IA (désactivé par défaut) ----------
// rx.ai = { mode: 'proxy' | 'key', proxy?, token?, key?, until?, cap } — enregistré dans le programme (code Firestore), jamais dans l'URL si on a un compte.
// Les derniers réglages sont mémorisés sur l'appareil du clinicien (settings().clinAI) pour ne pas les ressaisir.
function rxSectionAI(f) {
  const a = f.ai;
  const html = `<h2>${t('aiShTitle')}</h2><div class="list"><div class="toggle"><span><b>${t('aiShTitle')}</b><br><small class="muted">${t('aiShD')}</small></span><button class="switch ${a ? 'on' : ''}" id="ai-on" role="switch" aria-checked="${!!a}"></button></div></div>
    ${a ? `<div id="ai-box" style="margin-top:10px"><div class="seg">${['proxy', 'key'].map((m) => `<button data-aim="${m}" class="${a.mode === m ? 'on' : ''}">${t(m === 'proxy' ? 'aiShProxy' : 'aiShKey')}</button>`).join('')}</div>
      ${a.mode === 'proxy' ? `<label class="field" style="margin-top:10px"><span>${t('aiShProxyUrl')}</span><input class="input" id="ai-url" type="url" value="${esc(a.proxy || '')}" placeholder="https://…pages.dev/api/coach" autocomplete="off"></label>
        <label class="field"><span>${t('aiShToken')}</span><input class="input" id="ai-token" type="text" value="${esc(a.token || '')}" autocomplete="off" autocapitalize="off"></label>
        <p class="note">${t('aiShProxyD')}</p>`
      : `<label class="field" style="margin-top:10px"><span>${t('aiShKeyLbl')}</span><input class="input" id="ai-key" type="password" value="${esc(a.key || '')}" placeholder="AIza…" autocomplete="off"></label>
        <div class="banner neg">${icon('shield', 20)}<div>${t('aiShKeyWarn')}</div></div>`}
      <label class="field" style="margin-top:10px"><span>${t('aiShUntil')}</span><input class="input" type="date" id="ai-until" value="${esc(a.until || '')}"></label>
      <label class="field"><span>${t('aiShCap')}</span><input class="input tnum" type="number" min="1" max="1000" id="ai-cap" value="${a.cap || 40}"></label></div>` : ''}`;
  const read = (root) => {
    if (!f.ai) return;
    const g = (id) => root.querySelector(id);
    if (g('#ai-url')) f.ai.proxy = g('#ai-url').value.trim();
    if (g('#ai-token')) f.ai.token = g('#ai-token').value.trim();
    if (g('#ai-key')) f.ai.key = g('#ai-key').value.trim();
    if (g('#ai-until')) f.ai.until = g('#ai-until').value;
    if (g('#ai-cap')) f.ai.cap = Math.max(1, Math.min(1000, Math.round(+g('#ai-cap').value) || 40));
  };
  return { html, read };
}

const rxRef = (rx) => rx.code || rx.localId;
const linkOf = (rx) => store.rxLink(rx.code || rx.packed, rx.lang);

export async function viewClinic() {
  const prof = profile();
  $app().innerHTML = `<section class="screen clin"><div class="topbar"><h1>${t('patients')}</h1><button class="btn sm" data-go="#/clinic/new">${icon('plus', 16)} ${t('newRx')}</button></div>
    ${store.isCloud() ? '' : `<div class="banner" style="margin-bottom:12px">${icon('shield', 20)}<div>${t('clinLocal')}</div></div>`}
    <div id="rxlist"><div class="card muted">${t('loading')}</div></div></section>${nav('clinic', prof.role)}`;
  let list = [];
  try { list = await store.listMyRx(); } catch (e) { console.warn(e); }
  const box = $app().querySelector('#rxlist');
  if (!box) return;
  if (!list.length) { box.innerHTML = `<div class="card empty"><div class="empty-ic">${icon('stetho', 26)}</div><h3>${t('noRxYet')}</h3><p class="small" style="margin:4px 0 0">${t('noRxYetD')}</p><button class="btn" data-go="#/clinic/new">${icon('plus', 18)} ${t('newRx')}</button></div>`; return; }
  // Bandeau de synthèse : programmes, patients suivis, patients à surveiller (poussée, douleur au-dessus du seuil, assiduité < 50 %)
  const painMaxOf = (rx) => PATHOLOGIES.find((x) => x.id === rx.pathology)?.painMax ?? 4;
  const allPts = list.flatMap((rx) => (rx.patients || []).map((p) => ({ p, max: painMaxOf(rx) })));
  const watch = allPts.filter(({ p, max }) => p.flare || (p.pain7 != null && p.pain7 > max) || (p.planned && p.sessions7 / p.planned < 0.5)).length;
  const strip = `<div class="statstrip"><div><b>${list.length}</b><span>${ds('dsRx')}</span></div><div><b>${allPts.length}</b><span>${ds('dsFollow')}</span></div><div class="${watch ? 'watch' : ''}"><b>${watch}</b><span>${ds('dsWatch')}</span></div></div>`;
  box.innerHTML = strip + list.map((rx) => {
    const pts = rx.patients || [];
    const painMax = PATHOLOGIES.find((x) => x.id === rx.pathology)?.painMax ?? 4;
    const cols = `<div class="pt-cols"><span>${t('patient')}</span><span>${t('sessions7')}</span><span>${t('avgPain')}</span><span>${t('quality')}</span></div>`;
    return `<article class="card rx-card"><header class="rx-head"><div class="grow"><h3>${esc(tr(PATHOLOGIES.find((p) => p.id === rx.pathology)?.name))}</h3>
        <div class="rx-meta">${rx.code ? `<b class="tnum">${store.fmtCode(rx.code)}</b> · ` : ''}${t('phase')} ${rx.phase}${rx.auto ? '' : ' · ' + t('locked')} · ${tp('nEx', rx.ids.length)}${rx.lang && rx.lang !== 'fr' ? ' · ' + esc(langInfo(rx.lang).name) : ''}${rx.label ? '<br>' + esc(rx.label) : ''}</div></div>
        <span class="rx-date">${fmtDate(rx.updated)}</span></header>
      ${pts.length ? `<div class="pt-table">${cols}${pts.map((p) => {
        const adh = p.planned ? Math.round((p.sessions7 / p.planned) * 100) : 0;
        return `<div class="pt" data-pt="${esc(p.uid || p.updated)}"><div class="pt-row"><div class="who"><b>${esc(p.name || t('patient'))}${p.flare ? ` <span class="chip sm neg">${t('flareShort')}</span>` : ''}</b><small>${t('week')} ${p.week} · ${t('phase')} ${p.phase} · ${t('updated')} ${fmtDate(p.updated)}</small></div>
            <span class="v ${adh >= 80 ? 'pos' : adh < 50 ? 'neg' : ''}">${p.sessions7}/${p.planned}</span><span class="v ${p.pain7 != null && p.pain7 > painMax ? 'neg' : ''}">${p.pain7 ?? '–'}</span><span class="v">${p.quality7 != null ? p.quality7 + '%' : '–'}</span></div>
          <div class="pt-x">${p.protocol ? `<div class="toggle"><span class="small"><b>${esc(t('ig_protoWeek', { n: p.protocol.week, a: p.protocol.phase, b: p.protocol.phases }))}</b>${p.protocol.preop ? '' : p.protocol.blocked ? ` · <span class="neg">${t('pr_blocked')}</span>` : ''}</span></div>` : ''}
          ${exProgress(p, rx)}
          ${(p.prom?.length || p.rom?.length) ? `<details class="clin-more"><summary class="small">${t('ig_clinMore')}</summary>${clinicPanelProm(p)}${p.rom?.length ? `<h2>${t('rom_secTitle')}</h2>${clinicPanelRom(p)}` : ''}</details>` : ''}
          <div data-pdf="${esc(p.uid || p.updated)}"></div>
          ${p.notes?.length ? `<div class="pt-notes"><b class="small">${t('patientComments')}</b>${p.notes.slice(0, 3).map((n) => `<div class="small"><span class="muted">${fmtDate(n.date)} · ${esc(tr(EXERCISES[n.ex]?.name))}${n.pain != null ? ' · ' + n.pain + '/10' : ''}</span><br>« ${esc(n.text)} »</div>`).join('')}</div>` : ''}</div></div>`;
      }).join('')}</div>` : (rx.code ? `<p class="rx-wait">${t('waitingPatient')}</p>` : '')}
      <div class="rx-actions"><button class="btn sm ghost grow" data-share="${rxRef(rx)}">${icon('share', 16)} ${t('sendCode')}</button><button class="btn sm ghost grow" data-test="${rxRef(rx)}">${icon('play', 14)} ${t('testRx')}</button><button class="btn sm grow" data-go="#/clinic/rx/${rxRef(rx)}">${t('adjust')}</button></div></article>`;
  }).join('');
  // Bouton PDF du rapport (report.js) sur chaque fiche patient
  loadReport().then((R) => {
    if (!R?.clinicPdfButton) return;
    list.forEach((rx) => (rx.patients || []).forEach((p) => {
      const slot = box.querySelector(`[data-pdf="${CSS.escape(String(p.uid || p.updated))}"]`); if (!slot) return;
      slot.innerHTML = R.clinicPdfButton(p); R.bindClinicPdf?.(slot, p, { pathology: rx.pathology, surgeryDate: rx.protocol?.surgeryDate });
    }));
  });
  const find = (ref) => list.find((x) => rxRef(x) === ref);
  box.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => { const rx = find(b.dataset.share); shareSheet(rx.code, linkOf(rx), null, { keyInLink: !rx.code && rx.ai?.mode === 'key' }); }));
  box.querySelectorAll('[data-test]').forEach((b) => (b.onclick = () => startTrial(find(b.dataset.test))));
}

// Progression par exercice (niveau, dernière difficulté et douleur, tendance), compacte et repliée
function exProgress(p, rx) {
  const ex = p.ex || {};
  const ids = (rx.ids || Object.keys(ex)).filter((id) => ex[id] && EXERCISES[id]);
  if (!ids.length) return '';
  const arrow = { up: '↑', down: '↓', steady: '→' };
  return `<details class="ex-prog"><summary class="small">${t('exProgress')}</summary>${ids.map((id) => { const e = ex[id]; return `<div class="small"><span class="nm">${esc(tr(EXERCISES[id].name))}</span><span class="tnum muted">${t('level')} ${e.level} · ${t('diffShort')} ${e.lastDifficulty ?? '–'}/5 · ${e.lastPain ?? '–'}/10</span><b class="${e.trend === 'up' ? 'pos' : e.trend === 'down' ? 'neg' : 'muted'}" title="${t('trend_' + e.trend)}">${arrow[e.trend] || '→'}</b></div>`; }).join('')}</details>`;
}

// Clinicien : tester l'app comme un patient
export async function viewTestStart() {
  const prof = profile();
  $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('testTitle')}</h1></div>
    <p class="muted">${t('testD')}</p>
    <h2>${t('testPickRx')}</h2><p class="small muted" style="margin-top:-6px">${t('testPickRxD')}</p><div id="rxt"><div class="card muted">${t('loading')}</div></div>
    <button class="test-opt" data-a="ob"><span class="ic">${icon('search', 20)}</span><span class="grow"><b>${t('testOnboard')}</b><small>${t('testOnboardD')}</small></span></button>
    <button class="test-opt" data-go="#/library"><span class="ic">${icon('cam', 20)}</span><span class="grow"><b>${t('testLibrary')}</b><small>${t('testLibraryD')}</small></span></button>
  </section>${nav('home', prof.role)}`;
  $app().querySelector('[data-a="ob"]').onclick = () => { state.ob = null; state.obTest = true; go('#/onboard'); };
  let list = [];
  try { list = await store.listMyRx(); } catch (e) { console.warn(e); }
  const box = $app().querySelector('#rxt'); if (!box) return;
  box.innerHTML = list.length ? `<div class="list">${list.slice(0, 8).map((rx, i) => `<button class="ex-item" data-i="${i}"><span class="ex-thumb">${figSvg(rx.ids[0], { stat: true })}</span><span class="meta"><b>${esc(layName(rx.pathology))}</b><small>${rx.code ? store.fmtCode(rx.code) + ' · ' : ''}${t('phase')} ${rx.phase} · ${rx.ids.length} ${t('exercises').toLowerCase()}${rx.label ? ' · ' + esc(rx.label) : ''}</small></span>${icon('play', 16)}</button>`).join('')}</div>`
    : `<div class="card small muted">${t('noRxToTest')}</div>`;
  mountFigs(box);
  box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => startTrial(list[+b.dataset.i])));
}

export async function viewRxEditor(code) {
  const prof = profile();
  let rx = null;
  if (code && !(state.clinic && state.clinic.code === code)) {
    $app().innerHTML = `<section class="screen"><div class="card muted">${t('loading')}</div></section>`;
    try { rx = code.startsWith('L') ? store.getLocalRx(code) : await store.getRx(code); } catch (_) {}
    if (!rx) { toast(t('rxNotFound')); return go('#/clinic'); }
  }
  const f = state.clinic && state.clinic.code === (code || null) ? state.clinic : (state.clinic = {
    code: code || null, clinician: rx?.clinician || prof.clinicianName || prof.name || '', region: rx?.region || 'shoulder', pathology: rx?.pathology || null,
    phase: rx?.phase || 1, ids: rx?.ids || [], levels: { ...(rx?.levels || {}) }, auto: rx ? !!rx.auto : true, notes: rx?.notes || '', nextVisit: rx?.nextVisit || '',
    label: rx?.label || '', version: rx?.version || 0, created: rx?.created || null, days: rx?.days || [1, 3, 5],
    lang: rx?.lang || getLang(), localId: rx?.localId || null, equip: rx?.equip || null, side: rx?.side || null,
    dose: JSON.parse(JSON.stringify(rx?.dose || {})), autoEx: { ...(rx?.autoEx || {}) }, maxLevel: { ...(rx?.maxLevel || {}) }, partial: { ...(rx?.partial || {}) }, open: null,
    prom: JSON.parse(JSON.stringify(rx?.prom || [])), promCustom: JSON.parse(JSON.stringify(rx?.promCustom || [])), promTexts: { ...(rx?.promTexts || {}) },
    rom: rx?.rom || null, protocol: rx?.protocol || null, report: rx?.report || null, ai: rx?.ai ? { ...rx.ai } : null,
  });
  const path = PATHOLOGIES.find((p) => p.id === f.pathology);
  const regionEx = [...new Set(PATHOLOGIES.filter((p) => p.region === f.region).flatMap((p) => Object.values(p.phases).flat()))];
  const others = regionEx.filter((id) => !f.ids.includes(id));
  // Sections ajoutées (protocole, questionnaires, amplitude, rapport) : lues dans le DOM avant chaque nouveau dessin
  const R = await loadReport();
  const secs = path ? { protocol: rxSectionProtocol(f), prom: rxSectionProm(f), rom: rxSectionRom(f), report: R?.rxSectionReport ? R.rxSectionReport(f) : null } : {};
  const collect = () => {
    const root = $app();
    if (path) aiSec.read(root);
    if (!path || !root.querySelector('#pr-root')) return;
    const id = root.querySelector('#pr-id')?.value;
    if (!id) f.protocol = null;
    else { const r = secs.protocol.read(root); f.protocol = r.protocol || { id, variant: root.querySelector('#pr-variant')?.value || undefined, surgeryDate: root.querySelector('#pr-date')?.value || '', pastOk: root.querySelector('#pr-past')?.checked !== false }; }
    Object.assign(f, secs.prom.read(root), secs.rom.read(root));
    if (secs.report) { try { Object.assign(f, secs.report.read(root)); } catch (e) { console.warn(e); } }
  };
  const aiSec = rxSectionAI(f);
  const draw = () => { collect(); viewRxEditor(code); };
  // Matériel manquant → remplacement maison ou exercice équivalent proposé au clinicien
  const missEq = (id) => {
    const m = missing(id, f.equip); if (!m.length) return '';
    const alts = alternatives(id, f.equip, { exclude: f.ids });
    return `<small class="neg" style="display:block">${t('missingEq')} ${m.map((e) => esc(tr(EQUIP[e]))).join(', ')}${alts.length ? ` · ${alts.map((a) => `<button class="link" data-rep="${id}" data-to="${a}">↔ ${esc(tr(EXERCISES[a].name))}</button>`).join(' ')}` : ` · ${t('sub_' + m[0])}`}</small>`;
  };
  const lvOf = (id) => f.levels[id] || 2;
  // Dose affichée : celle du niveau, remplacée par la dose fixée par le clinicien s'il y en a une
  const shown = (id) => { const d = P.doseFor(id, lvOf(id)); d.rest = P.DEFAULT_REST; const o = f.dose[id]; if (o) { if (o.sets) d.sets = o.sets; if (o.reps && d.type === 'reps') d.reps = o.reps; if (o.hold && d.type === 'hold') d.hold = o.hold; if (o.rest != null) d.rest = o.rest; } return d; };
  const exEdit = (id) => {
    const d = shown(id), hold = d.type === 'hold';
    const st = (k, label, v, unit) => `<div class="toggle"><span>${label}</span><div class="stepper"><button data-dk="${k}" data-id="${id}" data-dir="-1" aria-label="−">−</button><b class="tnum">${v}${unit || ''}</b><button data-dk="${k}" data-id="${id}" data-dir="1" aria-label="+">+</button></div></div>`;
    return `<div class="sess-edit">
      ${st('sets', t('setsLbl'), d.sets)}
      ${hold ? st('hold', t('holdLbl'), d.hold, ' ' + t('sec')) : st('reps', t('repsLbl'), d.reps)}
      ${st('rest', t('restLbl'), d.rest, ' ' + t('sec'))}
      <div class="toggle"><span>${t('rxAutoEx')}<br><small class="muted">${t('rxAutoExD')}</small></span><button class="switch ${f.autoEx[id] === false ? '' : 'on'}" data-aex="${id}" role="switch" aria-checked="${f.autoEx[id] !== false}"></button></div>
      <div class="toggle"><span>${tk('rxPartial', RX_PARTIAL)}<br><small class="muted">${tk('rxPartialD', RX_PARTIAL_D)}</small></span><button class="switch ${f.partial[id] === false ? '' : 'on'}" data-pex="${id}" role="switch" aria-checked="${f.partial[id] !== false}"></button></div>
      <div class="toggle"><span>${t('rxMaxLevel')}<br><small class="muted">${t('rxMaxLevelD')}</small></span><div class="stepper"><button data-mx="${id}" data-dir="-1" aria-label="−">−</button><b class="tnum">${f.maxLevel[id] || 5}</b><button data-mx="${id}" data-dir="1" aria-label="+">+</button></div></div>
      ${f.dose[id] ? `<div class="row" style="padding:10px 12px 12px"><button class="btn sm ghost grow" data-dreset="${id}">${t('rxDoseReset')}</button></div>` : ''}
    </div>`;
  };
  const scroll = (fn) => { const y = window.scrollY; fn(); draw(); window.scrollTo(0, y); };

  $app().innerHTML = `<section class="screen clin"><div class="topbar"><button class="icon-btn" data-go="#/clinic" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${code ? t('adjustRx') : t('newRx')}</h1></div>
    <label class="field"><span>${t('yourName')}</span><input class="input" id="cn" value="${esc(f.clinician)}" placeholder="${t('clinNamePh')}"></label>
    <label class="field"><span>${t('rxLabel')}</span><input class="input" id="lb" value="${esc(f.label)}" placeholder="${t('rxLabelPh')}"></label>
    <h2>${t('region')}</h2><div class="pills">${REGIONS.map((r) => `<button class="pill ${f.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    <h2>${t('condition')}</h2>${PATHOLOGIES.filter((p) => p.region === f.region).map((p) => `<button class="choice ${f.pathology === p.id ? 'on' : ''}" data-p="${p.id}"><span class="radio"></span><span><b>${esc(tr(p.name))}</b><small>${t('patientSees')} : ${esc(layName(p.id))}</small></span></button>`).join('')}
    ${path ? `
    <h2>${t('phase')}</h2><div class="seg">${[1, 2, 3].map((n) => `<button data-ph="${n}" class="${f.phase === n ? 'on' : ''}">${n} · ${t('phaseName' + n)}</button>`).join('')}</div>
    <h2>${t('exercises')} (${f.ids.length})</h2>
    <div class="list">${f.ids.map((id, i) => `<div class="ex-block"><div class="ex-item"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id].name))}</b>${missEq(id)}<small>${EXERCISES[id].track ? t('tracked') : t('guidedShort')}</small></span>
      <span class="mv"><button data-mv="${id}" data-dir="-1" aria-label="${t('moveUp')}" ${i === 0 ? 'disabled' : ''}>↑</button><button data-mv="${id}" data-dir="1" aria-label="${t('moveDown')}" ${i === f.ids.length - 1 ? 'disabled' : ''}>↓</button></span>
      <span class="stepper"><small>${t('level')}</small><button data-lv="${id}" data-d="-1" aria-label="-">−</button><b class="tnum">${lvOf(id)}</b><button data-lv="${id}" data-d="1" aria-label="+">+</button></span>
      <button class="icon-btn" data-rm="${id}" aria-label="${t('remove')}">${icon('close', 16)}</button></div>
      <div class="ex-dose"><button class="link" data-dopen="${id}" aria-expanded="${f.open === id}">${doseText(shown(id))} · ${t('restShort')} ${shown(id).rest}${t('sec')}${f.dose[id] ? ' · ' + t('rxDoseSet') : ''}${f.autoEx[id] === false ? ' · ' + t('rxAutoOff') : ''} ▾</button></div>${f.open === id ? exEdit(id) : ''}</div>`).join('') || `<div class="toggle muted">${t('noExSelected')}</div>`}</div>
    ${others.length ? `<details class="add-ex" style="margin-top:6px"><summary>${t('addExercise')} (${others.length})</summary><div class="list" style="margin-top:8px">${others.map((id) => `<button class="ex-item" data-add="${id}"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id].name))}</b></span>${icon('plus', 18)}</button>`).join('')}</div></details>` : ''}
    <h2>${t('patientEquip')}</h2><p class="small muted" style="margin:-4px 0 8px">${t('patientEquipD')}</p>
    <div class="pills">${EQUIP_IDS.map((e) => `<button class="pill ${!f.equip || f.equip.includes(e) ? 'on' : ''}" data-peq="${e}">${esc(tr(EQUIP[e]))}</button>`).join('')}</div>
    <h2>${t('patientSide')}</h2><div class="seg">${['L', 'R', 'both'].map((v) => `<button data-pside="${v}" class="${(f.side || 'both') === v ? 'on' : ''}">${t(v === 'L' ? 'sideLeft' : v === 'R' ? 'sideRight' : 'sideBoth')}</button>`).join('')}</div>
    <h2>${t('trainDays')}</h2><div class="seg">${[2, 3, 4, 5, 6].map((n) => `<button data-pw="${n}" class="${f.days.length === n ? 'on' : ''}">${n}×</button>`).join('')}</div>
    <div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('autoProg')}</b><br><small class="muted">${t('autoProgD')}</small></span><button class="switch ${f.auto ? 'on' : ''}" id="auto" role="switch" aria-checked="${f.auto}"></button></div></div>
    <label class="field" style="margin-top:14px"><span>${t('notesForPatient')}</span><textarea class="input" id="nt" placeholder="${t('notesPh')}">${esc(f.notes)}</textarea></label>
    <label class="field"><span>${t('nextVisit')}</span><input class="input" type="date" id="nv" value="${esc(f.nextVisit)}"></label>
    <label class="field"><span>${t('patientLang')}</span><select class="input" id="pl">${LANGS.map((l) => `<option value="${l.id}" ${f.lang === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select><small class="muted">${t('patientLangD')}</small></label>
    ${secs.protocol.html}${secs.prom.html}${secs.rom.html}${secs.report ? secs.report.html : ''}${aiSec.html}` : ''}
    <div style="height:96px"></div>
    <div class="sticky-cta"><div class="row"><button class="btn ghost" id="try" style="flex:0 0 auto;width:auto;padding-inline:16px" ${path && f.ids.length ? '' : 'disabled'}>${icon('play', 14)} ${t('testRx')}</button><button class="btn grow" id="save" ${path && f.ids.length ? '' : 'disabled'}>${code ? t('saveChanges') : t('createSend')}</button></div></div></section>
    <div class="desk-only">${nav('clinic', prof.role)}</div>`;
  mountFigs($app());
  Object.values(secs).forEach((x) => { try { x?.bind?.($app()); } catch (e) { console.warn(e); } });
  const q = (s) => $app().querySelector(s), qa = (s) => $app().querySelectorAll(s);
  q('#cn').oninput = (e) => { f.clinician = e.target.value; };
  q('#lb').oninput = (e) => { f.label = e.target.value; };
  qa('[data-r]').forEach((b) => (b.onclick = () => { f.region = b.dataset.r; f.pathology = null; f.ids = []; draw(); }));
  qa('[data-p]').forEach((b) => (b.onclick = () => scroll(() => { f.pathology = b.dataset.p; f.ids = [...PATHOLOGIES.find((p) => p.id === f.pathology).phases[f.phase]]; })));
  qa('[data-ph]').forEach((b) => (b.onclick = () => scroll(() => { f.phase = +b.dataset.ph; f.ids = [...path.phases[f.phase]]; })));
  qa('[data-lv]').forEach((b) => (b.onclick = () => scroll(() => {
    const id = b.dataset.lv, old = lvOf(id), nv = Math.max(1, Math.min(5, old + +b.dataset.d));
    f.levels[id] = nv; if (f.dose[id]) f.dose[id] = P.scaleDose(id, f.dose[id], old, nv); // la dose fixée suit le niveau
    if (f.maxLevel[id] && f.maxLevel[id] < nv) f.maxLevel[id] = nv;
  })));
  qa('[data-mv]').forEach((b) => (b.onclick = () => scroll(() => { const i = f.ids.indexOf(b.dataset.mv), j = i + +b.dataset.dir; if (j >= 0 && j < f.ids.length) [f.ids[i], f.ids[j]] = [f.ids[j], f.ids[i]]; })));
  qa('[data-dopen]').forEach((b) => (b.onclick = () => scroll(() => { f.open = f.open === b.dataset.dopen ? null : b.dataset.dopen; })));
  const LIM = { sets: [1, 6, 1], reps: [3, 30, 1], hold: [5, 120, 5], rest: [0, 180, 15] };
  qa('[data-dk]').forEach((b) => (b.onclick = () => scroll(() => {
    const id = b.dataset.id, k = b.dataset.dk, [lo, hi, step] = LIM[k], d = shown(id);
    const v = Math.max(lo, Math.min(hi, (d[k] ?? 0) + step * +b.dataset.dir));
    f.dose[id] = { sets: d.sets, rest: d.rest, ...(d.type === 'hold' ? { hold: d.hold } : { reps: d.reps }), [k]: v };
  })));
  qa('[data-dreset]').forEach((b) => (b.onclick = () => scroll(() => { delete f.dose[b.dataset.dreset]; })));
  qa('[data-aex]').forEach((b) => (b.onclick = () => scroll(() => { const id = b.dataset.aex; if (f.autoEx[id] === false) delete f.autoEx[id]; else f.autoEx[id] = false; })));
  qa('[data-pex]').forEach((b) => (b.onclick = () => scroll(() => { const id = b.dataset.pex; if (f.partial[id] === false) delete f.partial[id]; else f.partial[id] = false; })));
  qa('[data-mx]').forEach((b) => (b.onclick = () => scroll(() => { const id = b.dataset.mx; const v = Math.max(lvOf(id), Math.min(5, (f.maxLevel[id] || 5) + +b.dataset.dir)); if (v >= 5) delete f.maxLevel[id]; else f.maxLevel[id] = v; })));
  qa('[data-rm]').forEach((b) => (b.onclick = () => scroll(() => { f.ids = f.ids.filter((x) => x !== b.dataset.rm); })));
  qa('[data-add]').forEach((b) => (b.onclick = () => scroll(() => { f.ids = [...f.ids, b.dataset.add]; })));
  qa('[data-peq]').forEach((b) => (b.onclick = () => scroll(() => { const cur = f.equip || [...EQUIP_IDS]; const e = b.dataset.peq; f.equip = cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]; })));
  qa('[data-pside]').forEach((b) => (b.onclick = () => scroll(() => { f.side = b.dataset.pside; })));
  qa('[data-rep]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); scroll(() => { const i = f.ids.indexOf(b.dataset.rep); if (i >= 0) { f.ids[i] = b.dataset.to; f.levels[b.dataset.to] = f.levels[b.dataset.rep] || 2; delete f.dose[b.dataset.rep]; } }); }));
  qa('[data-pw]').forEach((b) => (b.onclick = () => scroll(() => { f.days = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }[+b.dataset.pw]; })));
  const aiOn = q('#ai-on');
  if (aiOn) aiOn.onclick = () => scroll(() => { f.ai = f.ai ? null : { ...(store.settings().clinAI || { mode: 'proxy', proxy: '', token: '', key: '', until: '', cap: 40 }) }; });
  qa('[data-aim]').forEach((b) => (b.onclick = () => scroll(() => { f.ai.mode = b.dataset.aim; })));
  const au = q('#auto'); if (au) au.onclick = () => scroll(() => { f.auto = !f.auto; });
  const nt = q('#nt'); if (nt) nt.oninput = (e) => { f.notes = e.target.value; };
  const nv = q('#nv'); if (nv) nv.onchange = (e) => { f.nextVisit = e.target.value; };
  const pl = q('#pl'); if (pl) pl.onchange = (e) => { f.lang = e.target.value; };
  const only = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id]) => f.ids.includes(id)));
  const levelsOf = () => Object.fromEntries(f.ids.map((id) => [id, f.levels[id] || 2]));
  q('#try').onclick = () => startTrial({ ...f, levels: levelsOf(), code: null, dose: only(f.dose), autoEx: only(f.autoEx), maxLevel: only(f.maxLevel), partial: only(f.partial) });
  q('#save').onclick = async () => {
    if (path) {
      const pr = secs.protocol.read($app());
      if (pr.error) return toast(t('ig_protoDate'), 4000);
      collect();
    }
    q('#save').disabled = true;
    const levels = levelsOf();
    const data = { code: f.code, clinician: f.clinician.trim(), label: f.label.trim(), region: f.region, pathology: f.pathology, phase: f.phase, ids: f.ids, levels, auto: f.auto, notes: f.notes.trim(), nextVisit: f.nextVisit || null, days: f.days, version: f.version, created: f.created, lang: f.lang || getLang(), equip: f.equip || null, side: f.side || null, dose: only(f.dose), autoEx: only(f.autoEx), maxLevel: only(f.maxLevel), partial: only(f.partial),
      prom: f.prom || [], promCustom: f.promCustom || [], promTexts: f.promTexts || {}, rom: f.rom || null, protocol: f.protocol || null, report: f.report || null, ai: null };
    if (f.ai) {
      const ai = store.cleanAI(f.ai);
      if (!ai || (ai.mode === 'proxy' && !/^https:\/\//i.test(ai.proxy))) { q('#save').disabled = false; return toast(t('aiShBad'), 4500); }
      data.ai = ai; store.saveSettings({ clinAI: ai });
    }
    if (f.localId) data.localId = f.localId;
    try {
      const res = await store.saveRx(data);
      if (f.clinician.trim() && f.clinician.trim() !== prof.clinicianName) await store.saveProfile({ ...profile(), clinicianName: f.clinician.trim() });
      state.clinic = null;
      if (code && res.code) { toast(t('rxSaved')); return go('#/clinic'); }
      await shareSheet(res.code, res.link, () => go('#/clinic'), { keyInLink: res.keyInLink });
      toast(t('rxCreated'));
    } catch (e) { console.warn(e); toast(t('rxSaveErr') + ' ' + (e.code || e.message), 5000); q('#save').disabled = false; }
  };
}

// Feuille d'envoi : code, QR, lien
export async function shareSheet(code, link, onClose, { keyInLink = false } = {}) {
  let qrSvg = '';
  try {
    const { default: qrcode } = await import('../vendor/qrcode.js');
    const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) { console.warn(e); }
  const bg = sheet(`<h3>${t('sendToPatient')}</h3><p class="small muted" style="margin:4px 0 14px">${code ? t('sendCodeD') : t('sendLinkD')}</p>
    ${code ? `<div class="code-big">${store.fmtCode(code)}</div><p class="small muted" style="text-align:center;margin:4px 0 14px">${t('codeHowTo')}</p>` : ''}
    ${keyInLink ? `<div class="banner neg" style="margin-bottom:12px">${icon('shield', 20)}<div>${t('aiShLinkWarn')}</div></div>` : ''}
    ${qrSvg ? `<div class="qr" aria-label="QR">${qrSvg}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn ghost" id="cp">${icon('copy', 18)} ${t('copyLink')}</button><button class="btn" id="sh">${icon('share', 18)} ${t('share')}</button></div>
    <button class="btn soft" id="done" style="margin-top:10px">${t('done')}</button>`, { onClose });
  const msg = code ? t('shareMsgCode').replace('{code}', store.fmtCode(code)) : t('shareMsgLink');
  bg.querySelector('#cp').onclick = () => copyText(link);
  bg.querySelector('#sh').onclick = () => shareText('Mobilis', msg, link);
  bg.querySelector('#done').onclick = () => { bg.remove(); onClose && onClose(); };
}
