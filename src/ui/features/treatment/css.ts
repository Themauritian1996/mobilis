/** Charge www/css/treatment.css au premier rendu (le brief interdit de modifier www/index.html et le service worker). */
let loaded = false;

export function ensureCss(): void {
  if (loaded || typeof document === 'undefined') return;
  if (document.querySelector('link[data-feature="treatment"]')) {
    loaded = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/treatment.css';
  link.dataset['feature'] = 'treatment';
  document.head.appendChild(link);
  loaded = true;
}
