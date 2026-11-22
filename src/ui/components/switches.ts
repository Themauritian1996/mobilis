// Interrupteurs accessibles (reprise de www/js/ui.js).
// Chaque .switch reçoit role="switch" et un nom (aria-labelledby → le libellé voisin de la ligne .toggle), quel que soit le module qui l'a dessiné.

let swSeq = 0;
export function labelSwitches(root: ParentNode = document): void {
  root.querySelectorAll('.switch').forEach((b) => {
    if (!b.hasAttribute('role')) b.setAttribute('role', 'switch');
    if (!b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', String(b.classList.contains('on')));
    if (b.hasAttribute('aria-label') || b.hasAttribute('aria-labelledby')) return;
    const row = b.closest('.toggle,.row,.field,label') || b.parentElement;
    const lab = row && [...row.children].find((c) => c !== b && c.textContent?.trim() && !c.querySelector('.switch'));
    if (!lab) return;
    const tgt = lab.querySelector('b') || lab;
    tgt.id = tgt.id || `sw-l${++swSeq}`;
    b.setAttribute('aria-labelledby', tgt.id);
  });
}
let swObs: MutationObserver | null = null;
export function watchSwitches(host: HTMLElement | null | undefined): void {
  if (swObs || typeof MutationObserver === 'undefined' || !host) return;
  let q = 0;
  swObs = new MutationObserver(() => {
    if (q) return;
    q = requestAnimationFrame(() => {
      q = 0;
      labelSwitches(host);
    });
  });
  swObs.observe(host, { childList: true, subtree: true });
  labelSwitches(host);
}
