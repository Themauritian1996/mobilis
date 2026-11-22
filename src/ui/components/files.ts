// Fichiers (enregistrer / partager) et presse-papiers (reprise de www/js/ui.js).
import { t } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import { toast } from './toast.ts';

const blobB64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** APK : Filesystem (cache) + feuille de partage Android (un blob: ne se télécharge pas dans la WebView). Web : téléchargement.
 *  → 'native' | 'download' | 'cancelled' ; lève une erreur si l'écriture native échoue. */
export async function saveFile(
  data: BlobPart | Blob,
  fileName: string,
  mime = 'application/octet-stream',
  { title = 'Mobilis' }: { title?: string } = {},
): Promise<'native' | 'download' | 'cancelled'> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (store.isNative()) {
    const { Filesystem, Directory, Share } = await store.cap();
    const saved = await Filesystem.writeFile({ path: fileName, data: await blobB64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title, files: [saved.uri], dialogTitle: title });
      return 'native';
    } catch (e) {
      return /cancel/i.test(String((e as { message?: unknown } | null)?.message || e)) ? 'cancelled' : 'native';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'download';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
    return true;
  } catch {
    toast(text, 6000);
    return false;
  }
}
export async function shareText(title: string, text: string, url?: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, ...(url === undefined ? {} : { url }) });
      return;
    } catch {
      return;
    }
  }
  void copyText(url ? `${text}\n${url}` : text);
}
