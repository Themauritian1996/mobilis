// Feuille modale et confirmation (reprise de www/js/ui.js).
// Accessibilité : nom du dialogue (aria-labelledby sur le premier titre), focus placé dans la feuille et rendu à la fermeture,
// Tab piégé dans la feuille, Échap ferme (sauf onClose === false, feuille à décision obligatoire).
import { t } from '../../../www/js/i18n.js';
import { mountFigs } from './figures.ts';
import { esc } from './html.ts';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let sheetSeq = 0;

export interface SheetOptions {
  parent?: HTMLElement;
  /** Appelé à la fermeture par l'utilisateur ; `false` : la feuille ne se ferme pas toute seule. */
  onClose?: false | (() => unknown);
  label?: string;
}

export function sheet(html: string, { parent = document.body, onClose, label }: SheetOptions = {}): HTMLDivElement {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const box = bg.firstElementChild as HTMLElement;
  const h = box.querySelector('h3,h2,h1');
  if (label) box.setAttribute('aria-label', label);
  else if (h) {
    h.id = h.id || `sheet-t${++sheetSeq}`;
    box.setAttribute('aria-labelledby', h.id);
  }
  const opener = document.activeElement as HTMLElement | null;
  const dismiss = (): void => {
    if (onClose === false) return;
    bg.remove();
    if (onClose) onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!bg.isConnected) {
      document.removeEventListener('keydown', onKey, true);
      return;
    }
    // seule la feuille la plus récente réagit
    const all = document.querySelectorAll('.sheet-bg');
    if (all[all.length - 1] !== bg) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.offsetParent !== null || x === document.activeElement,
    );
    const first = f[0];
    const last = f[f.length - 1];
    if (!first || !last) {
      e.preventDefault();
      box.focus();
      return;
    }
    if (!box.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  box.tabIndex = -1;
  const rm = bg.remove.bind(bg);
  bg.remove = () => {
    document.removeEventListener('keydown', onKey, true);
    rm();
    try {
      if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
    } catch {
      /* le focus n'est pas rendu : sans importance */
    }
  };
  document.addEventListener('keydown', onKey, true);
  bg.addEventListener('click', (e) => {
    if (e.target === bg) dismiss();
  });
  parent.appendChild(bg);
  mountFigs(bg);
  // focus sur le premier champ / bouton de la feuille (pas sur « fermer » si un autre contrôle existe)
  try {
    (
      box.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea') ||
      box.querySelector<HTMLElement>('button') ||
      box
    ).focus({ preventScroll: true });
  } catch {
    /* le focus n'est pas placé : sans importance */
  }
  return bg;
}

export interface ConfirmOptions {
  title: string;
  text?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

// Confirmation modale : true si l'utilisateur confirme. Échap / clic à côté = annuler.
export function confirmSheet({ title, text = '', ok, cancel, danger = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: boolean): void => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const bg = sheet(
      `<h3>${esc(title)}</h3>${text ? `<p class="muted small" style="margin:6px 0 14px;white-space:pre-line">${esc(text)}</p>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-cf="no">${esc(cancel || t('cancel'))}</button><button class="btn ${danger ? 'danger' : ''}" data-cf="yes">${esc(ok || t('ok'))}</button></div>`,
      { onClose: () => fin(false) },
    );
    const no = bg.querySelector<HTMLButtonElement>('[data-cf="no"]')!;
    const yes = bg.querySelector<HTMLButtonElement>('[data-cf="yes"]')!;
    no.onclick = () => {
      bg.remove();
      fin(false);
    };
    yes.onclick = () => {
      bg.remove();
      fin(true);
    };
    if (danger) no.focus();
  });
}
