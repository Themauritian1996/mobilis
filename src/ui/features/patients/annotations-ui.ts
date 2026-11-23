// Notes sur une évaluation ou une comparaison A/B : liste + ajouter / modifier / supprimer.
// Réutilisable par les autres volets (écran de résultat, comparaison) : mountAnnotations(hôte, { patientId, assessmentIds }).
import { annotationsFor, editAnnotation, newAnnotation } from '../../../domains/clinic/annotations.ts';
import { newRecordId } from '../../../domains/clinic/patients.ts';
import type { Annotation } from '../../../core/types/clinical.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { confirmSheet, sheet } from '../../components/sheet.ts';
import { toast } from '../../components/toast.ts';
import { db, ensureCss, fmtDate, isForeign, myUid, nowIso, role, shareState } from './shared.ts';
import { tp } from './strings.ts';

export interface AnnotationsOptions {
  readonly patientId: string;
  /** 1 id : évaluation ; 2 ids : comparaison A/B. */
  readonly assessmentIds: readonly string[];
  readonly onChange?: () => void;
  /** Notes déjà lues (évite une requête). */
  readonly notes?: readonly Annotation[];
}

function noteSheet(initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: string | null): void => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const bg = sheet(
      `<h3>${esc(tp('noteTitle'))}</h3>
      <label class="field"><span class="sr-only">${esc(tp('noteTitle'))}</span><textarea class="input pt-note-input" rows="5" maxlength="4000" placeholder="${esc(tp('notePh'))}">${esc(initial)}</textarea></label>
      <div class="row"><button class="btn ghost" data-n="no">${esc(tp('cancel'))}</button><button class="btn" data-n="ok">${esc(tp('save'))}</button></div>`,
      { onClose: () => fin(null) },
    );
    const ta = bg.querySelector<HTMLTextAreaElement>('textarea')!;
    ta.focus();
    bg.querySelector<HTMLButtonElement>('[data-n="no"]')!.onclick = () => {
      bg.remove();
      fin(null);
    };
    bg.querySelector<HTMLButtonElement>('[data-n="ok"]')!.onclick = () => {
      if (!ta.value.trim()) return toast(tp('noteEmpty'));
      bg.remove();
      fin(ta.value);
    };
  });
}

const noteBadge = (n: Annotation): string => {
  if (isForeign('annotations', n.id)) return `<span class="chip sm">${esc(tp('fromPatient'))}</span>`;
  const s = shareState('annotations', n.id);
  if (s === 'shared') return `<span class="chip sm pos">${esc(tp('sharedToClin'))}</span>`;
  if (s === 'pending') return `<span class="chip sm">${esc(tp('pendingToClin'))}</span>`;
  return '';
};

export async function mountAnnotations(host: HTMLElement, o: AnnotationsOptions): Promise<void> {
  ensureCss();
  const all = o.notes ?? (await db().query('annotations', [{ field: 'patientId', op: '==', value: o.patientId }]));
  const notes = annotationsFor(all, o.assessmentIds);
  const mine = (n: Annotation): boolean => !isForeign('annotations', n.id) && n.ownerUid === myUid();
  host.innerHTML = `<div class="pt-notes">${notes
    .map(
      (n) => `<div class="pt-note" data-note="${esc(n.id)}"><p>${esc(n.text)}</p>
      <div class="pt-note-meta small muted">${esc(fmtDate(n.updatedAt))} · ${esc(n.authorRole === 'patient' ? tp('byPatient') : tp('byClinician'))} ${noteBadge(n)}
      ${mine(n) ? `<button class="link" data-ned="${esc(n.id)}">${esc(tp('editNote'))}</button> <button class="link danger" data-ndel="${esc(n.id)}">${esc(tp('deleteNote'))}</button>` : ''}</div></div>`,
    )
    .join('')}
    <button class="btn sm ghost" data-nadd>${icon('plus', 14)} ${esc(tp('addNote'))}</button></div>`;
  const changed = (): void => {
    if (o.onChange) o.onChange();
    else void mountAnnotations(host, { patientId: o.patientId, assessmentIds: o.assessmentIds });
  };
  host.querySelector<HTMLElement>('[data-nadd]')!.onclick = async () => {
    const text = await noteSheet('');
    if (text === null) return;
    try {
      const n = newAnnotation({
        id: newRecordId('n_'),
        ownerUid: myUid(),
        patientId: o.patientId,
        assessmentIds: o.assessmentIds,
        authorRole: role() === 'clinician' ? 'clinician' : 'patient',
        text,
        now: nowIso(),
      });
      await db().set('annotations', n.id, n);
      toast(tp('saved'));
      changed();
    } catch (e) {
      console.warn(e);
      toast(tp('saveErr'), 4000);
    }
  };
  host.querySelectorAll<HTMLElement>('[data-ned]').forEach((b) => {
    b.onclick = async () => {
      const n = notes.find((x) => x.id === b.dataset['ned']);
      if (!n) return;
      const text = await noteSheet(n.text);
      if (text === null) return;
      try {
        const next = editAnnotation(n, text, nowIso());
        await db().set('annotations', next.id, next);
        toast(tp('saved'));
        changed();
      } catch (e) {
        console.warn(e);
        toast(tp('saveErr'), 4000);
      }
    };
  });
  host.querySelectorAll<HTMLElement>('[data-ndel]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmSheet({ title: tp('noteDelAsk'), ok: tp('deleteNote'), danger: true }))) return;
      try {
        await db().remove('annotations', b.dataset['ndel'] ?? '');
        changed();
      } catch (e) {
        console.warn(e);
        toast(tp('saveErr'), 4000);
      }
    };
  });
}
