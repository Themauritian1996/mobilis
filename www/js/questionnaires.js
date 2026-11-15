// Questionnaires (PROM) : interface patient + clinicien. La logique pure (scores, échéances, tendance) est dans data/proms.js.
// Licences : le texte des questionnaires protégés est importé par le clinicien (JSON) et gardé dans les réglages de l'appareil
// (store.settings().promLicenses = { instrumentId: { items:[{fr,en}], options:[{fr,en}]|null, importedAt } }) ; jamais dans le code ni dans la prescription.
import { t, tr, locale } from './i18n.js';
import * as store from './store.js';
import { profile, updateProfile, syncProgress } from './state.js';
import { esc, icon, toast, sheet } from './ui.js';
import * as M from './data/proms.js';

export { score, due, trend, summaryPart, suggestFor, validateLicense, INSTRUMENTS, customToDef } from './data/proms.js';

const num = (x) => (x == null ? '–' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(x));
const rootOf = ($app) => (typeof $app === 'function' ? $app() : $app);
const licenses = () => { try { return store.settings().promLicenses || {}; } catch (_) { return {}; } };
// Textes sous licence : ceux importés sur cet appareil (clinicien), sinon ceux embarqués dans la prescription (profil.promTexts)
const ctxOf = (prof = profile() || {}, custom = prof.promCustom) => ({ custom: custom || [], licenses: M.mergeLicenses(prof.promTexts, licenses()), activities: prof.promActivities || [] });
const nameOf = (def) => tr(def.name);

// Importe un fichier de licence { instrument, items, options } : conservé sur cet appareil (réglages). -> { ok, id?, error? }
export function importPromLicense(json) {
  const v = M.validateLicense(json);
  if (!v.ok) return v;
  store.saveSettings({ promLicenses: { ...licenses(), [v.id]: v.entry } });
  return v;
}
export const removePromLicense = (id) => { const l = { ...licenses() }; delete l[id]; store.saveSettings({ promLicenses: l }); };

// Textes sous licence des instruments du plan (importés sur l'appareil du clinicien) : embarqués dans la prescription pour que le patient puisse répondre
export const packTexts = (plan, embedded) => { const all = M.mergeLicenses(embedded, licenses()); return Object.fromEntries((plan || []).map((p) => p.id).filter((id) => all[id]).map((id) => [id, all[id]])); };
// Profil patient : plan + questionnaires personnalisés recopiés depuis la prescription
export const rxExtrasProm = (rx) => ({ promPlan: (rx?.prom || []).map((p) => ({ id: p.id, every: +p.every || 0, first: +p.first || 0 })), promTexts: JSON.parse(JSON.stringify(rx?.promTexts || {})), promCustom: JSON.parse(JSON.stringify(rx?.promCustom || [])) });

// Questionnaires dus et remplissables maintenant
function dueList(prof) {
  const ctx = ctxOf(prof);
  const start = prof.joinedAt || prof.startDate || 0;
  return M.due(prof.promPlan || [], prof.promLog || [], start, Date.now()).filter((d) => {
    const def = M.instrumentDef(d.id, ctx.custom);
    return def && (def.dynamicItems || M.isAvailable(d.id, ctx));
  });
}

// ---------- Graphique ----------
function lineSvg(series, def, { w = 300, h = 90, full = true, label = '' } = {}) {
  if (!series.length) return '';
  const pad = full ? 14 : 3;
  let lo = def.range[0], hi = def.range[1];
  if (!full) { const v = series.map((p) => p[1]); lo = Math.min(...v); hi = Math.max(...v); if (hi === lo) { hi += 1; lo -= 1; } }
  const xs = (i) => pad + (series.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (series.length - 1));
  const ys = (v) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - 2 * pad);
  const pts = series.map((p, i) => [xs(i), ys(p[1])]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="prom-svg">${full ? `<line class="ax" x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}"/><text x="${pad}" y="${h - 1}">${num(def.range[0])}</text><text x="${w - pad}" y="${h - 1}" text-anchor="end">${num(def.range[1])}</text>` : ''}
    <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="${full ? 2 : 1.6}" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${full ? 3.2 : i === pts.length - 1 ? 2.6 : 0}" fill="${i === pts.length - 1 ? 'var(--brand)' : 'var(--surface)'}" stroke="var(--brand)" stroke-width="1.4"/>`).join('')}</svg>`;
}

// Phrase simple sur l'évolution
function changeText(tn, def) {
  if (def.noBaseline || tn.n < 2 || tn.improvement == null) return tn.n < 2 && !def.noBaseline ? t('pmFirst') : '';
  const a = num(Math.abs(tn.delta));
  const s = tn.improvement > 0 ? t('pmBetter', { d: a }) : tn.improvement < 0 ? t('pmWorse', { d: a }) : t('pmSame');
  return s + (tn.mcidReached ? ' ' + t('pmMcidYes') : '');
}

// ---------- Accueil : carte « Questionnaire à remplir » ----------
export function homeCardProm(prof) {
  if (!prof) return '';
  const list = dueList(prof);
  if (!list.length) return '';
  const ctx = ctxOf(prof);
  return `<div class="card prom-card" data-prom-card><div class="row between"><span class="eyebrow">${t('pmDueTitle')}</span><span class="chip sm">${list.length}</span></div>
    ${list.map((d) => `<button class="prom-due" data-prom-go="${esc(d.id)}"><span class="grow"><b>${esc(nameOf(M.instrumentDef(d.id, ctx.custom)))}</b><small class="muted">${t('pmTakes', { n: Math.max(1, Math.round(M.nItemsOf(M.instrumentDef(d.id, ctx.custom)) * 0.25)) })}</small></span>${icon('play', 18)}</button>`).join('')}</div>`;
}
export function bindHomeCardProm(root, go) {
  root.querySelectorAll('[data-prom-go]').forEach((b) => { b.onclick = () => go('#/prom/' + b.dataset.promGo); });
}

// ---------- Remplissage : une question par écran ----------
let keyOff = null; // un seul écouteur clavier à la fois
export function viewProm($app, id) {
  if (keyOff) keyOff();
  const root = rootOf($app);
  const prof = profile() || {};
  let def = M.resolveDef(id, ctxOf(prof));
  const back = `<div class="topbar"><button class="icon-btn" data-go="#/home" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(def ? nameOf(def) : t('pmTitle'))}</h1></div>`;
  if (!def) { root.innerHTML = `<section class="screen prom-screen">${back}<div class="card muted">${t('pmNotFound')}</div></section>`; return; }
  if (def.kind === 'licensed' && !def.available) {
    root.innerHTML = `<section class="screen prom-screen">${back}<div class="card"><span class="chip neg">${t('pmLicReq')}</span><p style="margin:10px 0 0">${t('pmLicHelp')}</p></div></section>`;
    return;
  }
  const st = { i: 0, a: [], acts: [], phase: def.dynamicItems && !def.available ? 'setup' : 'ask' };
  st.acts = (prof.promActivities || []).slice();
  const o = def.options;
  const optList = () => (o.labels ? o.labels.map((l, k) => ({ v: o.min + k, text: tr(l) })) : null);
  const mk = (fn) => { root.innerHTML = fn(); root.querySelector('.prom-screen')?.focus?.({ preventScroll: true }); };

  const drawSetup = () => mk(() => {
    const rows = st.acts.length ? st.acts : ['', '', ''];
    st.acts = rows;
    return `<section class="screen prom-screen" tabindex="-1">${back}<p>${t('pmActIntro')}</p>
      <div class="stack">${rows.map((a, k) => `<input class="input" data-act="${k}" maxlength="60" value="${esc(a)}" placeholder="${t('pmActPh')}" aria-label="${t('pmActN', { n: k + 1 })}">`).join('')}</div>
      <div class="row" style="margin-top:12px">${rows.length < def.dynamicItems.max ? `<button class="btn sm ghost" data-act-add>${icon('plus', 16)} ${t('pmActAdd')}</button>` : ''}</div>
      <div class="prom-nav"><button class="btn" data-act-ok>${t('pmNext')}</button></div></section>`;
  });
  const bindSetup = () => {
    root.querySelectorAll('[data-act]').forEach((i) => { i.oninput = () => { st.acts[+i.dataset.act] = i.value; }; });
    const add = root.querySelector('[data-act-add]'); if (add) add.onclick = () => { st.acts.push(''); drawSetup(); bindSetup(); };
    root.querySelector('[data-act-ok]').onclick = async () => {
      const acts = st.acts.map((x) => x.trim()).filter(Boolean);
      if (acts.length < def.dynamicItems.min) return toast(t('pmActMin', { n: def.dynamicItems.min }));
      await updateProfile({ promActivities: acts.slice(0, def.dynamicItems.max) });
      def = M.resolveDef(id, ctxOf(profile()));
      st.phase = 'ask'; draw();
    };
  };

  const drawAsk = () => {
    const items = def.items, n = items.length, it = items[st.i], cur = st.a[st.i];
    const ol = optList();
    const stem = def.stem ? `<p class="muted prom-stem">${esc(tr(def.stem))}</p>` : '';
    const qtext = def.id === 'activities' ? t('pmActQ', { a: tr(it.text) }) : tr(it.text);
    let ctl;
    if (def.id === 'sane') {
      const v = cur ?? 50;
      ctl = `<div class="prom-slider"><output class="prom-big tnum" id="pv">${cur == null ? '–' : v + ' %'}</output><input type="range" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}" id="pr" aria-label="${esc(qtext)}"></div>
        <div class="row between small muted"><span>${esc(tr(o.ends[0]))}</span><span style="text-align:end">${esc(tr(o.ends[1]))}</span></div>`;
    } else if (ol && ol.length <= 7) {
      ctl = `<div class="prom-opts" role="radiogroup" aria-label="${esc(qtext)}">${ol.map((x) => `<button class="prom-opt ${cur === x.v ? 'on' : ''}" role="radio" aria-checked="${cur === x.v}" data-v="${x.v}">${esc(x.text)}</button>`).join('')}</div>`;
    } else {
      const vals = Array.from({ length: o.max - o.min + 1 }, (_, k) => o.min + k);
      ctl = `<div class="prom-grid" dir="ltr" role="radiogroup" aria-label="${esc(qtext)}">${vals.map((v) => `<button class="prom-num ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-v="${v}">${v}</button>`).join('')}</div>
        ${o.ends ? `<div class="row between small muted" dir="ltr" style="margin-top:8px;gap:12px"><span dir="auto" style="text-align:left"><bdi>${o.min}</bdi> : ${esc(tr(o.ends[0]))}</span><span dir="auto" style="text-align:right"><bdi>${o.max}</bdi> : ${esc(tr(o.ends[1]))}</span></div>` : ''}`;
    }
    const canSkip = n > 1 && def.id !== 'activities';
    mk(() => `<section class="screen prom-screen" tabindex="-1"><div class="topbar"><button class="icon-btn" data-prev aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(nameOf(def))}</h1></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${st.i + 1}"><i style="width:${((st.i + 1) / n) * 100}%"></i></div>
      <div class="small muted" style="margin:8px 0 14px">${t('pmQn', { n: st.i + 1, total: n })}</div>
      ${stem}<h2 class="prom-q">${esc(qtext)}</h2>${ctl}
      <div class="prom-nav">${canSkip ? `<button class="link" data-skip>${t('pmSkip')}</button>` : '<span></span>'}<button class="btn" data-next ${cur == null ? 'disabled' : ''}>${st.i === n - 1 ? t('pmFinish') : t('pmNext')}</button></div></section>`);
    const nx = root.querySelector('[data-next]');
    root.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { st.a[st.i] = +b.dataset.v; drawAsk(); }; });
    const r = root.querySelector('#pr');
    if (r) {
      const upd = () => { st.a[st.i] = +r.value; root.querySelector('#pv').textContent = r.value + ' %'; nx.disabled = false; };
      r.oninput = upd; r.onchange = upd; r.onclick = upd; r.onpointerup = upd;
    }
    root.querySelector('[data-prev]').onclick = prev;
    nx.onclick = next;
    const sk = root.querySelector('[data-skip]'); if (sk) sk.onclick = () => { st.a[st.i] = null; next(); };
  };
  const prev = () => { if (st.i > 0) { st.i--; drawAsk(); } else location.hash = '#/home'; };
  const next = () => {
    if (st.i < def.items.length - 1) { st.i++; drawAsk(); } else finish();
  };

  const finish = async () => {
    const answers = def.items.map((_, k) => (st.a[k] == null ? null : st.a[k]));
    const r = M.score(def, answers);
    if (!r.valid) {
      root.innerHTML = `<section class="screen prom-screen" tabindex="-1">${back}<div class="card"><p style="margin:0">${t('pmInvalid')}</p></div><div class="prom-nav"><button class="btn" data-retry>${t('pmRetry')}</button></div></section>`;
      root.querySelector('[data-retry]').onclick = () => { st.i = 0; st.phase = 'ask'; draw(); };
      return;
    }
    const entry = { id, ts: Date.now(), answers, score: r.score };
    if (r.sub) entry.sub = r.sub;
    if (def.id === 'activities') entry.acts = def.items.map((x) => tr(x.text));
    const log = [...(profile()?.promLog || []), entry];
    try { await updateProfile({ promLog: log }); } catch (e) { console.warn(e); toast(t('pmSaveErr')); }
    try { await syncProgress(); } catch (_) {}
    const tn = M.trend(log, id, def);
    const bd = def.id === 'pgic' ? null : M.band(def, r.score);
    const lab = def.id === 'pgic' ? tr(def.options.labels[r.score - o.min]) : null;
    mk(() => `<section class="screen prom-screen" tabindex="-1"><div class="topbar"><h1>${esc(nameOf(def))}</h1></div>
      <div class="card prom-result"><span class="eyebrow">${t('pmYourScore')}</span>
        <div class="prom-big tnum">${lab ? esc(lab) : `${num(r.score)}<small> / ${num(def.range[1])}</small>`}</div>
        ${bd != null && def.kind !== 'custom' ? `<p class="prom-band b${bd}">${t('pmBand' + bd)}</p>` : ''}
        ${r.sub ? `<div class="small muted">${Object.entries(r.sub).filter(([, v]) => v != null && typeof v === 'number').map(([k, v]) => `${esc(t('pmSub_' + k) === 'pmSub_' + k ? k : t('pmSub_' + k))} : ${num(v)}`).join(' · ')}</div>` : ''}
        <p style="margin:10px 0 0">${esc(changeText(tn, def))}</p>
        <p class="small muted" style="margin:8px 0 0">${def.higherIsBetter ? t('pmHigherIsBetter') : t('pmHigherIsWorse')}</p></div>
      <div class="prom-nav"><button class="btn ghost" data-go="#/proms">${t('pmHistory')}</button><button class="btn" data-go="#/home">${t('pmDone')}</button></div></section>`);
  };

  const draw = () => {
    if (st.phase === 'setup') { drawSetup(); bindSetup(); } else drawAsk();
  };
  draw();

  // Clavier : chiffres = réponse, Entrée / flèche suivante = suivant, flèche précédente = retour (inversées en RTL)
  const onKey = (e) => {
    if (!document.body.contains(root.querySelector('.prom-screen'))) { document.removeEventListener('keydown', onKey); return; }
    if (st.phase !== 'ask' || !root.querySelector('[data-next]') || e.target.closest?.('input[type=text],input:not([type]),textarea')) return;
    const rtl = document.documentElement.dir === 'rtl';
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight', prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === 'Enter' || e.key === nextKey) { const n = root.querySelector('[data-next]'); if (n && !n.disabled && !(e.key === 'Enter' && e.target.closest('button'))) { e.preventDefault(); n.click(); } }
    else if (e.key === prevKey && e.target.type !== 'range') { e.preventDefault(); root.querySelector('[data-prev]')?.click(); }
    else if (/^[0-9]$/.test(e.key)) { root.querySelector(`[data-v="${e.key}"]`)?.click(); }
    else if (e.key === 'Escape') location.hash = '#/home';
  };
  document.addEventListener('keydown', onKey);
  keyOff = () => document.removeEventListener('keydown', onKey);
}

// ---------- Historique ----------
export function viewPromHistory($app) {
  const root = rootOf($app);
  const prof = profile() || {};
  const ctx = ctxOf(prof), log = prof.promLog || [];
  const ids = [...new Set(log.map((l) => l.id))];
  const planned = (prof.promPlan || []).map((p) => p.id).filter((id) => { const d = M.instrumentDef(id, ctx.custom); return d && (d.dynamicItems || M.isAvailable(id, ctx)); });
  const todo = [...new Set([...planned, ...M.suggestFor(prof.region).general.filter((id) => !planned.includes(id))])];
  const rows = ids.map((id) => {
    const def = M.instrumentDef(id, ctx.custom); if (!def) return '';
    const tn = M.trend(log, id, def);
    const series = log.filter((l) => l.id === id && typeof l.score === 'number').sort((a, b) => a.ts - b.ts).map((l) => [l.ts, l.score]);
    return `<div class="card prom-hist"><div class="row between"><b>${esc(nameOf(def))}</b>${tn.mcidReached ? `<span class="chip pos sm">${icon('check', 12)} ${t('pmMcidBadge')}</span>` : ''}</div>
      <div class="row" style="gap:18px;margin:8px 0"><div><div class="small muted">${t('pmLast')}</div><div class="prom-mid tnum">${num(tn.last)}</div></div>
        ${tn.delta != null ? `<div><div class="small muted">${t('pmVsStart')}</div><div class="prom-mid tnum ${tn.improvement > 0 ? 'pos' : tn.improvement < 0 ? 'neg' : ''}">${tn.delta > 0 ? '+' : ''}${num(tn.delta)}</div></div>` : ''}</div>
      <div class="chart">${lineSvg(series, def, { label: nameOf(def) })}</div>
      <div class="small muted">${series.map((p) => '<bdi>' + new Date(p[0]).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' : ' + num(p[1]) + '</bdi>').slice(-6).join(' · ')}</div></div>`;
  }).join('');
  root.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('pmHistory')}</h1></div>
    <h2>${t('pmFillNow')}</h2><div class="stack">${todo.map((id) => `<button class="prom-due" data-prom-go="${esc(id)}"><span class="grow"><b>${esc(nameOf(M.instrumentDef(id, ctx.custom)))}</b></span>${icon('play', 18)}</button>`).join('')}</div>
    <h2>${t('pmResults')}</h2>${rows || `<div class="card muted">${t('pmNone')}</div>`}</section>`;
  bindHomeCardProm(root, (h) => { location.hash = h; });
}

// ---------- Clinicien : fiche patient ----------
export function clinicPanelProm(part) {
  const list = part?.prom || [];
  if (!list.length) return '';
  return `<h2>${t('pmTitle')}</h2>` + list.map((p) => {
    const def = { range: p.range || [0, 100], higherIsBetter: p.higherIsBetter };
    const arrow = p.delta == null ? '' : `<span class="prom-delta ${p.improvement > 0 ? 'pos' : p.improvement < 0 ? 'neg' : ''}">${p.delta > 0 ? '+' : ''}${num(p.delta)}</span>`;
    return `<div class="card prom-clin"><div class="row between"><b>${esc(tr(p.name))}</b>${p.mcidReached ? `<span class="chip pos sm">${icon('check', 12)} ${t('pmMcidBadge')}</span>` : p.worsened ? `<span class="chip neg sm">${t('pmWorsened')}</span>` : ''}</div>
      <div class="row" style="margin-top:6px;gap:14px"><div><div class="small muted">${t('pmBaseline')}</div><b class="tnum">${num(p.baseline)}</b></div><div><div class="small muted">${t('pmLast')}</div><b class="tnum">${num(p.last)}</b></div>${arrow ? `<div><div class="small muted">${t('pmVsStart')}</div>${arrow}</div>` : ''}
        <div class="grow prom-spark">${lineSvg(p.series || [], def, { w: 120, h: 34, full: false, label: tr(p.name) })}</div></div>
      <div class="small muted" style="margin-top:4px">${p.lastTs ? new Date(p.lastTs).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : ''}${p.higherIsBetter ? ' · ' + t('pmHigherIsBetter') : ' · ' + t('pmHigherIsWorse')}</div></div>`;
  }).join('');
}

// ---------- Clinicien : éditeur de programme ----------
const EVERY = [0, 1, 2, 4, 6, 8, 12];
export function rxSectionProm(rx = {}) {
  const plan0 = (rx.prom || []).map((p) => ({ id: p.id, every: +p.every || 0, first: +p.first || 0 }));
  const custom0 = JSON.parse(JSON.stringify(rx.promCustom || []));
  const region = rx.region;

  const body = (plan, custom) => {
    const ctx = { custom, licenses: M.mergeLicenses(rx.promTexts, licenses()), activities: [] };
    const taken = new Set(plan.map((p) => p.id));
    const sug = M.suggestFor(region);
    const pill = (id) => {
      const def = M.instrumentDef(id, custom); const ok = def.kind !== 'licensed' || M.isAvailable(id, ctx);
      return `<button class="pill ${ok ? '' : 'lock'}" data-padd="${id}" ${ok ? '' : 'aria-disabled="true"'}>${esc(tr(def.name))}${ok ? '' : ' · ' + t('pmLicReq')}</button>`;
    };
    const sel = (v) => `<select class="input sm" data-every aria-label="${t('pmEvery')}">${EVERY.map((e) => `<option value="${e}" ${e === v ? 'selected' : ''}>${e === 0 ? t('pmOnce') : (e === 1 ? t('pmEvery1') : t('pmEveryN', { n: e }))}</option>`).join('')}</select>`;
    const rows = plan.map((p) => {
      const def = M.instrumentDef(p.id, custom);
      if (!def) return '';
      const lic = def.kind === 'licensed' && !M.isAvailable(p.id, ctx);
      return `<div class="prom-row" data-id="${esc(p.id)}"><div class="row between"><b>${esc(tr(def.name))}</b><button class="icon-btn" data-prm="${esc(p.id)}" aria-label="${t('remove')}" style="width:34px;height:34px">${icon('close', 16)}</button></div>
        ${lic ? `<div class="small neg">${t('pmLicReq')} — ${t('pmLicBlocked')}</div>` : ''}
        <div class="row wrap" style="margin-top:6px">${sel(p.every)}<label class="small muted row" style="gap:6px">${t('pmFirstAfter')}<input class="input sm" type="number" min="0" max="365" data-first value="${p.first}" style="width:76px"></label>
        ${isCustomIdLocal(p.id) ? `<button class="link small" data-pedit="${esc(p.id)}">${t('pmEdit')}</button>` : `<span class="small muted">${def.mcid ? t('pmMcidInfo', { v: def.mcid.value }) : ''}</span>`}</div></div>`;
    }).join('');
    const lic = Object.keys(M.INSTRUMENTS).filter((id) => M.INSTRUMENTS[id].kind === 'licensed');
    const rest = [...M.FREE_ORDER, ...M.LICENSED_ORDER].filter((id) => !sug.general.includes(id) && !sug.region.includes(id) && !taken.has(id));
    return `<h2>${t('pmTitle')}</h2><p class="small muted" style="margin:-4px 0 8px">${t('pmRxHelp')}</p>
      <div class="stack">${rows || `<div class="card muted small">${t('pmNoneRx')}</div>`}</div>
      <div class="small muted" style="margin:12px 0 6px">${t('pmSuggested')}</div><div class="pills wrapped">${sug.region.filter((id) => !taken.has(id)).map(pill).join('') || ''}${sug.general.filter((id) => !taken.has(id)).map(pill).join('')}${custom.filter((c) => !taken.has(c.id)).map((c) => pill(c.id)).join('')}</div>
      ${rest.length ? `<details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:700">${t('pmAllInstruments')}</summary><div class="pills wrapped" style="margin-top:8px">${rest.map(pill).join('')}</div></details>` : ''}
      <div class="row wrap" style="margin-top:10px"><button class="btn sm ghost" data-pnew>${icon('plus', 16)} ${t('pmCustom')}</button>
        <button class="btn sm soft" data-plic>${icon('doc', 16)} ${t('pmLicImport')}</button><input type="file" accept="application/json,.json" data-pfile hidden></div>
      <p class="small muted" style="margin:8px 0 0">${t('pmLicHelp')} ${lic.some((id) => M.isAvailable(id, ctx)) ? t('pmLicHave', { list: lic.filter((id) => M.isAvailable(id, ctx)).map((id) => tr(M.INSTRUMENTS[id].name)).join(', ') }) : ''}</p>`;
  };
  const isCustomIdLocal = M.isCustomId;

  const html = `<div class="prom-sec" data-prom-sec data-custom="${esc(JSON.stringify(custom0))}" data-plan="${esc(JSON.stringify(plan0))}">${body(plan0, custom0)}</div>`;

  const sec = (root) => root.querySelector('[data-prom-sec]');
  const readPlan = (root) => [...sec(root).querySelectorAll('.prom-row')].map((r) => ({ id: r.dataset.id, every: +r.querySelector('[data-every]').value || 0, first: Math.max(0, +r.querySelector('[data-first]').value || 0) }));
  const readCustom = (root) => { try { return JSON.parse(sec(root).dataset.custom || '[]'); } catch (_) { return []; } };

  function read(root) {
    const el = sec(root);
    if (!el) { const prom = plan0.filter((p) => M.isAvailable(p.id, { custom: custom0, licenses: M.mergeLicenses(rx.promTexts, licenses()) })); return { prom, promCustom: custom0, promTexts: packTexts(prom, rx.promTexts) }; }
    const custom = readCustom(root);
    const ctx = { custom, licenses: M.mergeLicenses(rx.promTexts, licenses()), activities: [] };
    const prom = readPlan(root).filter((p) => { const d = M.instrumentDef(p.id, custom); return d && (d.kind !== 'licensed' || M.isAvailable(p.id, ctx)) && (d.kind !== 'custom' || M.nItemsOf(d) > 0); });
    return { prom, promCustom: custom.filter((c) => prom.some((p) => p.id === c.id)), promTexts: packTexts(prom, rx.promTexts) };
  }

  function bind(root) {
    const el = sec(root); if (!el) return;
    const redraw = (plan, custom) => { el.dataset.custom = JSON.stringify(custom); el.innerHTML = body(plan, custom); wire(); };
    const wire = () => {
      const plan = readPlan(root), custom = readCustom(root);
      el.querySelectorAll('[data-prm]').forEach((b) => { b.onclick = () => redraw(plan.filter((p) => p.id !== b.dataset.prm), custom); });
      el.querySelectorAll('[data-padd]').forEach((b) => {
        b.onclick = () => {
          if (b.getAttribute('aria-disabled') === 'true') return toast(t('pmLicReq') + ' — ' + t('pmLicBlocked'));
          const id = b.dataset.padd; redraw([...plan, { id, every: id === 'pgic' ? 4 : id.startsWith('c_') ? 4 : 4, first: id === 'pgic' ? 28 : 0 }], custom);
        };
      });
      el.querySelectorAll('[data-pedit]').forEach((b) => { b.onclick = () => openBuilder(custom.find((c) => c.id === b.dataset.pedit), (c) => redraw(plan, custom.map((x) => (x.id === c.id ? c : x)))); });
      el.querySelector('[data-pnew]').onclick = () => openBuilder(null, (c) => redraw([...plan, { id: c.id, every: 4, first: 0 }], [...custom, c]));
      const file = el.querySelector('[data-pfile]');
      el.querySelector('[data-plic]').onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files?.[0]; if (!f) return;
        let txt = ''; try { txt = await f.text(); } catch (_) {}
        const v = importPromLicense(txt);
        toast(v.ok ? t('pmLicOk', { name: tr(M.INSTRUMENTS[v.id].name) }) : t('pmLicErr'), 3500);
        if (v.ok) redraw(plan, custom);
      };
    };
    wire();
  }
  return { html, bind, read };
}

// Constructeur de questionnaire personnalisé (feuille). cb(c) avec le questionnaire enregistré.
function openBuilder(existing, cb) {
  const c = existing ? JSON.parse(JSON.stringify(existing)) : { id: 'c_' + Date.now().toString(36), title: '', questions: [{ text: '' }], scale: '0-10', score: 'mean', higherIsBetter: false };
  const bg = sheet('<div data-bld></div>');
  const box = bg.querySelector('[data-bld]');
  const seg = (name, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-seg="${name}" data-v="${esc(String(v))}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const draw = () => {
    box.innerHTML = `<h2 style="margin-top:0">${t('pmCustom')}</h2>
      <label class="field"><span>${t('pmBTitle')}</span><input class="input" data-title maxlength="80" value="${esc(c.title)}"></label>
      <div class="field"><span>${t('pmBQuestions')}</span><div class="stack">${c.questions.map((q, i) => `<div class="row"><textarea class="input grow" rows="2" data-q="${i}" maxlength="240" aria-label="${t('pmActN', { n: i + 1 })}">${esc(q.text)}</textarea><button type="button" class="icon-btn" data-qrm="${i}" aria-label="${t('remove')}">${icon('close', 16)}</button></div>`).join('')}</div>
        <button type="button" class="btn sm ghost" data-qadd style="margin-top:8px">${icon('plus', 16)} ${t('pmBAddQ')}</button></div>
      <div class="field"><span>${t('pmBScale')}</span>${seg('scale', [['0-10', t('pmScale010')], ['likert', t('pmScaleLikert')], ['yesno', t('pmScaleYesNo')]], c.scale)}</div>
      <div class="field"><span>${t('pmBScore')}</span>${seg('score', [['sum', t('pmSum')], ['mean', t('pmMean')], ['pct', t('pmPct')]], c.score)}</div>
      <div class="field"><span>${t('pmBDir')}</span>${seg('dir', [['better', t('pmHigherBetter')], ['worse', t('pmHigherWorse')]], c.higherIsBetter ? 'better' : 'worse')}</div>
      <div class="row"><button type="button" class="btn ghost" data-cancel>${t('cancel')}</button><button type="button" class="btn" data-save>${t('pmBSave')}</button></div>`;
    box.querySelector('[data-title]').oninput = (e) => { c.title = e.target.value; };
    box.querySelectorAll('[data-q]').forEach((x) => { x.oninput = () => { c.questions[+x.dataset.q].text = x.value; }; });
    box.querySelectorAll('[data-qrm]').forEach((x) => { x.onclick = () => { c.questions.splice(+x.dataset.qrm, 1); if (!c.questions.length) c.questions.push({ text: '' }); draw(); }; });
    box.querySelector('[data-qadd]').onclick = () => { c.questions.push({ text: '' }); draw(); box.querySelectorAll('[data-q]')[c.questions.length - 1]?.focus(); };
    box.querySelectorAll('[data-seg]').forEach((b) => { b.onclick = () => { const k = b.dataset.seg, v = b.dataset.v; if (k === 'dir') c.higherIsBetter = v === 'better'; else c[k] = v; draw(); }; });
    box.querySelector('[data-cancel]').onclick = () => bg.remove();
    box.querySelector('[data-save]').onclick = () => {
      c.questions = c.questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text.trim() }));
      if (!c.questions.length) { c.questions = [{ text: '' }]; draw(); return toast(t('pmBNeedQ')); }
      c.title = c.title.trim() || t('pmCustom');
      bg.remove(); cb(c);
    };
  };
  draw();
}
