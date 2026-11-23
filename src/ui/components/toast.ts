// Notification éphémère (reprise de www/js/ui.js).

export function toast(msg: string, ms = 2600): void {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const d = document.createElement('div');
  d.className = 'toast' + (document.querySelector('.sheet-bg') ? ' top' : '');
  d.setAttribute('role', 'status');
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
