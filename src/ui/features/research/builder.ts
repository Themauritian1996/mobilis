// Constructeur de protocole (#/recherche) : liste des études, création depuis un gabarit, édition (mesures × points dans
// le temps × conditions), inscription des patients (identifiant de recherche attribué). Rôle clinicien, drapeau 'gait'.
import type { IsoDate } from '../../../core/types/common.ts';
import type { Patient, Study } from '../../../core/types/clinical.ts';
import {
  enrolPatient,
  ensurePatient,
  PROTOCOL_TEMPLATES,
  saveStudy,
  templateById,
  unenrolPatient,
} from '../../../domains/research/index.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { draftProblem, mountProtocolEditor, type ProtocolDraft } from './editor.ts';
import { banner, bi, ctx, db, ensureCss, errMsg, esc, newId, t, today, topbar } from './shared.ts';

export async function viewStudies(root: HTMLElement): Promise<void> {
  ensureCss();
  root.innerHTML = `<section class="screen rs">${topbar(t('rs_studiesTitle'), '#/clinic')}${banner()}
    <p class="muted">${esc(t('rs_studiesIntro'))}</p>
    <div id="rs-list"><div class="card muted">${esc(t('rs_loading'))}</div></div>
    <h2>${esc(t('rs_newStudy'))}</h2><p class="small muted">${esc(t('rs_templatesNote'))}</p>
    <div class="rs-tpls">${PROTOCOL_TEMPLATES.map(
      (tp) =>
        `<button class="test-opt" data-go="#/recherche/new/${tp.id}"><span class="ic">${icon('clip', 20)}</span><span class="grow"><b>${esc(bi(tp.name))}</b><small>${esc(bi(tp.description))}</small></span></button>`,
    ).join('')}
    <button class="test-opt" data-go="#/recherche/new/blank"><span class="ic">${icon('plus', 20)}</span><span class="grow"><b>${esc(t('rs_blank'))}</b></span></button></div>
    <p class="row wrap rs-mt"><button class="btn sm ghost" data-go="#/suivi">${icon('cal', 16)} ${esc(t('rs_followPatients'))}</button></p></section>`;
  const box = root.querySelector<HTMLElement>('#rs-list')!;
  try {
    const studies = (await db().query('studies')).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    box.innerHTML = studies.length
      ? studies
          .map(
            (s) =>
              `<article class="card rs-study"><div class="row between"><div class="grow"><h3>${esc(s.name)}</h3><small class="muted">${esc(t('rs_nPatients', { n: s.patientIds.length }))} · ${esc(t('rs_nMeasures', { n: s.measures.length }))} · ${s.timepoints.map((x) => esc(x.label)).join(', ')}</small></div></div>
              <div class="row wrap rs-mt"><button class="btn sm" data-go="#/etude/${esc(s.id)}">${icon('chart', 16)} ${esc(t('rs_open'))}</button><button class="btn sm ghost" data-go="#/recherche/edit/${esc(s.id)}">${esc(t('rs_edit'))}</button></div></article>`,
          )
          .join('')
      : `<div class="card small muted">${esc(t('rs_noStudy'))}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="card neg">${esc(t('rs_error', { msg: errMsg(e) }))}</div>`;
  }
}

/** Éditeur : `mode` = 'new' (arg2 = gabarit) ou 'edit' (arg2 = id de l'étude). */
export async function viewStudyEditor(root: HTMLElement, mode: 'new' | 'edit', arg: string | undefined): Promise<void> {
  ensureCss();
  root.innerHTML = `<section class="screen rs"><div class="card muted">${esc(t('rs_loading'))}</div></section>`;
  let study: Study | null = null;
  const tpl = mode === 'new' ? templateById(arg) : undefined;
  if (mode === 'edit' && arg) study = await db().get('studies', arg);
  if (mode === 'edit' && !study) {
    root.innerHTML = `<section class="screen rs">${topbar(t('rs_editorTitle'), '#/recherche')}<div class="card">${esc(t('rs_studyNotFound'))}</div></section>`;
    return;
  }
  const clone = <T>(x: readonly T[]): T[] => x.map((v) => structuredClone(v));
  const src = study ?? tpl;
  const draft: ProtocolDraft & { name: string; anonymize: boolean; templateId?: string } = {
    name: study?.name ?? (tpl ? bi(tpl.name) : ''),
    anonymize: study?.anonymizeExports ?? true,
    measures: src ? clone(src.measures) : [],
    timepoints: src ? clone(src.timepoints) : [{ id: newId('tp'), label: 'T0', offsetDays: 0 }],
    conditions: src ? [...src.conditions] : [],
    ...((study?.templateId ?? tpl?.id) ? { templateId: (study?.templateId ?? tpl?.id)! } : {}),
  };
  root.innerHTML = `<section class="screen rs">${topbar(t('rs_editorTitle'), '#/recherche')}${banner()}
    ${tpl ? `<p class="small muted">${esc(t('rs_templatesNote'))} <span class="chip sm warn">${esc(t('rs_toVerify'))}</span></p>` : ''}
    <label class="field"><span>${esc(t('rs_studyName'))}</span><input class="input" id="rs-name" value="${esc(draft.name)}" required></label>
    <div class="toggle"><span>${esc(t('rs_anonymize'))}</span><button class="switch ${draft.anonymize ? 'on' : ''}" id="rs-anon" role="switch" aria-checked="${draft.anonymize}" aria-label="${esc(t('rs_anonymize'))}"></button></div>
    <div id="rs-editor"></div>
    <div class="sticky-cta rs-mt"><button class="btn" id="rs-save">${esc(t('rs_save'))}</button></div>
    <div id="rs-enrol"></div></section>`;
  const $ = <E extends HTMLElement>(s: string): E => root.querySelector<E>(s)!;
  mountProtocolEditor($('#rs-editor'), draft, { conditions: true });
  $('#rs-anon').addEventListener('click', (e) => {
    draft.anonymize = !draft.anonymize;
    const b = e.currentTarget as HTMLElement;
    b.classList.toggle('on', draft.anonymize);
    b.setAttribute('aria-checked', String(draft.anonymize));
  });
  $<HTMLInputElement>('#rs-name').addEventListener('input', (e) => (draft.name = (e.target as HTMLInputElement).value));
  const drawEnrol = async (): Promise<void> => {
    const host = $('#rs-enrol');
    if (!study) {
      host.innerHTML = `<h2>${esc(t('rs_enrol'))}</h2><p class="small muted">${esc(t('rs_saveFirst'))}</p>`;
      return;
    }
    const s = study;
    const patients = await db().query('patients');
    const byId = new Map(patients.map((p) => [p.id as string, p]));
    const enrolled = s.patientIds.map((id) => byId.get(id)).filter((p): p is Patient => !!p);
    const others = patients.filter((p) => !s.patientIds.includes(p.id));
    host.innerHTML = `<h2>${esc(t('rs_enrol'))}</h2><p class="small muted">${esc(t('rs_enrolHint'))}</p>
      ${enrolled.length ? `<ul class="list">${enrolled.map((p) => `<li class="rs-mrow"><div class="grow"><b>${esc(p.researchId ?? '')}</b> · ${esc(p.displayName ?? p.id)}</div><button class="btn sm ghost" data-go="#/suivi/${esc(p.id)}">${icon('cal', 14)}</button><button class="btn sm ghost danger" data-unenrol="${esc(p.id)}" aria-label="${esc(t('rs_remove'))}">${icon('close', 14)}</button></li>`).join('')}</ul>` : ''}
      <div class="card rs-mt"><label class="field"><span>${esc(t('rs_pickPatient'))}</span><select class="input" id="rs-pt"><option value="">—</option>${others.map((p) => `<option value="${esc(p.id)}">${esc(p.displayName ?? p.researchId ?? p.id)}</option>`).join('')}<option value="__new">+ ${esc(t('rs_newPatient'))}</option></select></label>
      <label class="field" id="rs-newname-f" hidden><span>${esc(t('rs_newPatient'))}</span><input class="input" id="rs-newname" autocomplete="off"></label>
      <label class="field"><span>${esc(t('rs_anchor'))}</span><input class="input" type="date" id="rs-anchor" value="${today()}"></label>
      <button class="btn sm" id="rs-enrol-btn">${icon('plus', 16)} ${esc(t('rs_enrolAdd'))}</button></div>`;
    host.querySelector<HTMLSelectElement>('#rs-pt')!.onchange = (e) => {
      host.querySelector<HTMLElement>('#rs-newname-f')!.hidden = (e.target as HTMLSelectElement).value !== '__new';
    };
    host.querySelectorAll<HTMLElement>('[data-unenrol]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm(t('rs_confirmDelete'))) return;
          await unenrolPatient(db(), ctx(), s.id, b.dataset['unenrol']!);
          study = await db().get('studies', s.id);
          void drawEnrol();
        }),
    );
    host.querySelector<HTMLElement>('#rs-enrol-btn')!.onclick = async () => {
      try {
        let pid = host.querySelector<HTMLSelectElement>('#rs-pt')!.value;
        const anchor = host.querySelector<HTMLInputElement>('#rs-anchor')!.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return toast(t('rs_badValue'));
        if (pid === '__new') {
          const name = host.querySelector<HTMLInputElement>('#rs-newname')!.value.trim();
          if (!name) return toast(t('rs_badValue'));
          pid = newId('pt');
          await ensurePatient(db(), ctx(), pid, { displayName: name });
        }
        if (!pid) return toast(t('rs_pickPatient'));
        const r = await enrolPatient(db(), ctx(), s.id, pid, anchor as IsoDate);
        study = r.study;
        toast(t('rs_saved'));
        void drawEnrol();
      } catch (e) {
        toast(t('rs_error', { msg: errMsg(e) }));
      }
    };
  };
  $('#rs-save').addEventListener('click', async () => {
    const pb = !draft.name.trim() ? t('rs_studyName') : draftProblem(draft);
    if (pb) return toast(pb);
    try {
      study = await saveStudy(db(), ctx(), {
        ...(study ? { id: study.id } : {}),
        name: draft.name,
        ...(draft.templateId ? { templateId: draft.templateId } : {}),
        measures: draft.measures,
        timepoints: [...draft.timepoints].sort((a, b) => a.offsetDays - b.offsetDays),
        conditions: draft.conditions,
        anonymizeExports: draft.anonymize,
      });
      toast(t('rs_saved'));
      if (mode === 'new') history.replaceState(null, '', `#/recherche/edit/${study.id}`);
      void drawEnrol();
    } catch (e) {
      toast(t('rs_error', { msg: errMsg(e) }));
    }
  });
  void drawEnrol();
}
