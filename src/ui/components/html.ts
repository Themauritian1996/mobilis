// Utilitaires de gabarits HTML (reprise de www/js/ui.js).

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une valeur pour l'insérer dans du HTML (texte ou attribut). */
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c] ?? c);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
