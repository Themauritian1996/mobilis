// Écran « Progrès » (reprise de www/js/app.js) : courbes hebdomadaires, assiduité, journal, niveaux, dernières séances.
import { t, tr, locale } from '../../../www/js/i18n.js';
import * as P from '../../../www/js/program.js';
import { rangeWeeks, inRange } from '../../../www/js/longterm.js';
import { coachComment, speakRich } from '../../../www/js/coach.js';
import { state, sessions, navRole, type JournalEntry, type SessionRecord } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { isNil } from '../util.ts';
import { icon } from '../components/icons.ts';
import { nav } from '../components/nav.ts';
import { lvlBar } from '../components/design.ts';
import { lineChart, barChart, type WeekBar } from '../components/charts.ts';
import { rangeSeg, getRange } from './history.ts';
import { $app, EXERCISES, getReport, prof as profOf } from './shared.ts';

/** Une semaine de suivi (sortie de `program.weeklyStats`). */
interface WeekRow extends WeekBar {
  pain?: number | null;
  quality?: number | null;
  difficulty?: number | null;
}
/** Exercice d'une séance, champs lus par l'historique résumé. */
interface HistItem {
  id: string;
  pain?: number | null;
  partial?: boolean;
  change?: number;
  note?: string;
}

export function viewProgress(): void {
  const prof = profOf();
  const RPT = getReport();
  const range = getRange(); // 4 semaines / 3 mois / tout
  const rows: WeekRow[] = P.weeklyStats(prof, sessions()).slice(-rangeWeeks(range));
  const has = sessions().length > 0;
  const prog: { id: string; level: number }[] = P.todaysProgram(prof);
  const inR = sessions().filter((x: SessionRecord) => inRange(x.date, range));
  const hist = inR.slice(-10).reverse();
  const j = (state.data?.journal || []).filter((e: JournalEntry) =>
    inRange(e.ts || new Date(e.day + 'T12:00').getTime(), range),
  );
  $app.innerHTML = `<section class="screen"><div class="topbar"><h1>${t('progress')}</h1><span class="chip">${t('week')} ${P.weekNumber(prof)} · ${t('phase')} ${prof.phase || 1}</span></div>
    <button class="btn ghost" data-go="#/report">${icon('doc', 18)} ${t('reportBtn')}</button>
    <div class="list linklist" style="margin-top:12px">${[
      ['#/history', t('histTitle'), 'clock'],
      ['#/proms', t('pmTitle'), 'clip'],
      ['#/amplitude', t('ig_amplitude'), 'ruler'],
      ['#/badges', t('bdgTitle'), 'medal'],
      ...(prof.protocol ? [['#/protocole', t('pr_title'), 'shield']] : []),
      ...(RPT?.viewPatientReport ? [['#/rapport', t('reportTitle'), 'doc']] : []),
    ]
      .map(
        ([h, l, ic]) =>
          `<button class="toggle" data-go="${h}"><span class="li-ic">${icon(ic ?? '', 18)}</span><span class="grow"><b>${esc(l)}</b></span><span class="chev" aria-hidden="true">${icon('chev', 18)}</span></button>`,
      )
      .join('')}</div>
    ${
      !has
        ? `<div class="card empty" style="margin-top:12px"><div class="empty-ic">${icon('chart', 24)}</div>${t('noData')}</div>`
        : `
    <div style="margin-top:14px">${rangeSeg(range)}</div>
    <h2>${t('weekly')}</h2><div class="card chart">${lineChart(rows, [
      { get: (r) => r.pain, color: 'var(--neg)' },
      { get: (r) => (!isNil(r.quality) ? r.quality * 10 : null), color: 'var(--pos)' },
      { get: (r) => (!isNil(r.difficulty) ? r.difficulty * 2 : null), color: 'var(--muted)' },
    ])}<div class="legend"><span><i style="background:var(--neg)"></i>${t('painTrend')} /10</span><span><i style="background:var(--pos)"></i>${t('qualityTrend')} (×10 %)</span><span><i style="background:var(--muted)"></i>${t('difficulty')} (×2)</span></div></div>
    <h2>${t('adherence')}</h2><div class="card chart">${barChart(rows)}</div>
    <h2>${t('weekReport')}</h2><div class="card"><p id="wr" class="muted small" style="margin:0 0 10px">${t('weekReportD')}</p><button class="btn sm ghost" data-a="wr">${icon('spark', 16)} ${t('genReport')}</button></div>`
    }
    ${j.length > 1 ? `<h2>${t('dailyLog')}</h2><div class="card chart">${lineChart(j as unknown as { day: string; pain: number }[], [{ get: (r) => r.pain, color: 'var(--neg)' }], { label: (r) => r.day.slice(8) })}</div>` : ''}
    <h2>${t('levels')}</h2><div class="list">${prog.map((x) => `<div class="toggle"><span class="small"><b>${esc(tr(EXERCISES[x.id]?.name))}</b></span>${lvlBar(x.level)}</div>`).join('')}</div>
    ${
      hist.length
        ? `<div class="sec-head"><h2>${t('history')}</h2><button class="link small" data-go="#/history">${t('histSeeAll')}</button></div><div class="list">${hist.map((s: SessionRecord) => `<div class="toggle"><span><b>${new Date(s.date ?? 0).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}</b><br><small class="muted">${((s.items ?? []) as HistItem[]).map((i) => `${esc(tr(EXERCISES[i.id]?.name))} ${!isNil(i.pain) ? ` · ${i.pain}/10` : ''}${i.partial ? ` · ${t('partialSaved')}` : ''}${(i.change ?? 0) > 0 ? ' ↑' : (i.change ?? 0) < 0 ? ' ↓' : ''}${i.note ? `<br><span style="color:var(--ink)">« ${esc(i.note)} »</span>` : ''}`).join('<br>')}</small></span></div>`).join('')}</div>`
        : ''
    }
  </section>${nav('progress', navRole())}`;
  $app.querySelectorAll<HTMLElement>('[data-range]').forEach(
    (b) =>
      (b.onclick = () => {
        state.range = b.dataset['range'];
        const y = scrollY;
        viewProgress();
        scrollTo(0, y);
      }),
  );
  const b = $app.querySelector<HTMLElement>('[data-a="wr"]');
  if (b)
    b.onclick = async () => {
      const cur = rows[rows.length - 1] as WeekRow,
        prev = rows[rows.length - 2];
      const p = $app.querySelector<HTMLElement>('#wr') as HTMLElement;
      p.textContent = t('thinking');
      const { text } = await coachComment({
        kind: 'week',
        condition: tr(P.pathologyById(prof.pathology)?.name),
        week: cur.week,
        sessions: cur.sessions,
        planned: cur.planned,
        pain: cur.pain,
        quality: cur.quality,
        painDelta: !isNil(prev?.pain) && !isNil(cur.pain) ? cur.pain - prev.pain : 0,
        phase: prof.phase || 1,
        comments: P.recentNotes(sessions(), 5).map((n: { text: string }) => n.text),
      });
      p.textContent = text;
      p.classList.remove('muted');
      speakRich(text);
    };
}
