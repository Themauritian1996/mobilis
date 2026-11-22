// Badges : célébration, synchronisation, vue « #/badges » et pastille d'accueil (reprise de www/js/badges.js, partie interface).
// L'évaluation pure est dans domains/outcomes/badges.ts.
import { t, locale } from '../../../www/js/i18n.js';
import {
  BADGES,
  badgeProgress,
  evaluateBadges,
  type BadgeProfile,
  type BadgeSession,
} from '../../domains/outcomes/badges.ts';
import { profile, sessions, updateProfile } from '../app-state.ts';
import { icon } from '../components/icons.ts';

const BY_ID: Record<string, (typeof BADGES)[number] | undefined> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// ---------- Célébration discrète (une à la fois, sans son) ----------
const queue: string[] = [];
let showing = false;
export function celebrate(ids: string[] = []): void {
  for (const id of ids) if (BY_ID[id]) queue.push(id);
  if (!showing) void next();
}
async function next(): Promise<void> {
  const id = queue.shift();
  if (!id) {
    showing = false;
    return;
  }
  showing = true;
  if (typeof document === 'undefined') {
    showing = false;
    return;
  }
  const b = BY_ID[id]!;
  const el = document.createElement('div');
  el.className = 'badge-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="bt-ic">${icon(b.icon, 20)}</span><span class="bt-txt"><small>${t('bdgNew')}</small><strong>${t('bdg' + b.key + 'T')}</strong><span>${t('bdg' + b.key + 'D')}</span></span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let done = false;
  const close = (): void => {
    if (done) return;
    done = true;
    el.classList.remove('in');
    setTimeout(() => {
      el.remove();
      void next();
    }, 250);
  };
  el.onclick = close;
  setTimeout(close, 4200);
}

// Évalue, enregistre les nouveaux badges dans le profil et célèbre ceux-ci (à appeler après chaque sauvegarde pertinente)
export async function syncBadges(): Promise<{ earned: Record<string, number>; newOnes: string[] }> {
  const p = profile();
  if (!p) return { earned: {}, newOnes: [] };
  const { earned, newOnes } = evaluateBadges(p as BadgeProfile, sessions() as BadgeSession[], Date.now());
  if (newOnes.length) {
    await updateProfile({ badges: earned });
    celebrate(newOnes);
  }
  return { earned, newOnes };
}

// ---------- Affichage ----------
const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

// Vue « #/badges » : grille de tous les badges, gagnés (date) ou verrouillés (comment les obtenir + progression)
export async function viewBadges($app: HTMLElement): Promise<void> {
  const prof = (profile() || {}) as BadgeProfile;
  const sess = (sessions() || []) as BadgeSession[];
  const now = Date.now();
  const { earned } = evaluateBadges(prof, sess, now);
  const n = BADGES.filter((b) => earned[b.id] !== undefined && earned[b.id] !== null).length;
  const cards = BADGES.map((b) => {
    const ts = earned[b.id];
    const pr = badgeProgress(b, prof, sess, now);
    const pct = pr ? Math.round((pr.n / pr.of) * 100) : 0;
    const status =
      ts !== undefined && ts !== null
        ? `<small class="bc-meta">${t('bdgEarned')} ${fmtDate(ts)}</small>`
        : `<small class="bc-meta">${t('bdgLocked')}</small>${pr ? `<div class="bc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.of}" aria-valuenow="${pr.n}"><i style="width:${pct}%"></i></div><small class="bc-meta">${pr.n} / ${pr.of} ${t(pr.unit)}</small>` : ''}`;
    return `<article class="badge-card ${ts !== undefined && ts !== null ? 'earned' : 'locked'}"><span class="bc-ic">${icon(b.icon, 22)}</span><h2>${t('bdg' + b.key + 'T')}</h2><p>${t('bdg' + b.key + 'D')}</p>${status}</article>`;
  }).join('');
  $app.innerHTML = `<section class="screen badges-screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('bdgTitle')}</h1></div>
    <p class="muted">${t('bdgIntro')}</p><p class="badge-count"><strong>${n}</strong> / ${BADGES.length}</p>
    <div class="badge-grid">${cards}</div></section>`;
}

// Petite pastille pour l'accueil (d'après profile.badges déjà enregistré)
export function homeChipBadges(profile: BadgeProfile = {}): string {
  const n = BADGES.filter((b) => {
    const v = (profile?.badges || {})[b.id];
    return v !== undefined && v !== null;
  }).length;
  return `<button class="chip badge-chip" data-go="#/badges">${t('bdgChip')} · ${n} / ${BADGES.length}</button>`;
}
