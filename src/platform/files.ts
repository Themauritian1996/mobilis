/**
 * Appareil (Capacitor) : détection de l'APK, chargement paresseux des plugins (www/vendor/capacitor.js), partage de
 * fichiers. SEUL endroit autorisé à toucher Capacitor (règle dependency-cruiser `capacitor-only-in-platform`).
 */
import { assetUrl } from './asset-url.ts';
import { isNativeWindow } from './native.ts';

/** Dans l'APK (Capacitor) ? Lecture via `window`, comme store.js de v1.15. */
export const isNative = (): boolean => isNativeWindow();

/** Plugins Capacitor utilisés (formes minimales : seuls les membres appelés par l'app sont décrits). */
export interface CapacitorPlugins {
  App: {
    addListener(event: 'appUrlOpen', cb: (e: { url?: string }) => void | Promise<void>): unknown;
  };
  Browser: {
    open(o: { url: string }): Promise<unknown>;
    close(): Promise<unknown>;
  };
  Filesystem: {
    writeFile(o: { path: string; data: string; directory: unknown }): Promise<{ uri: string }>;
  };
  Directory: { Cache: unknown };
  Share: {
    share(o: { title?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
  };
  [plugin: string]: unknown;
}

let capMod: CapacitorPlugins | null = null;
/** Charge (une fois) les plugins Capacitor. Le chemin est calculé : Vite ne doit pas le réécrire. */
export async function cap(): Promise<CapacitorPlugins> {
  if (!capMod) capMod = (await import(/* @vite-ignore */ assetUrl('vendor/capacitor.js'))) as CapacitorPlugins;
  return capMod;
}

/**
 * Écoute le retour de la connexion Google de l'APK : Google refuse la connexion dans une WebView ; l'app ouvre la page de
 * connexion dans le navigateur du téléphone (auth.html), qui renvoie un jeton Google par ca.mobilis.app://auth.
 */
export async function listenNativeAuthReturn(onIdToken: (idToken: string) => Promise<void>): Promise<void> {
  try {
    const { App, Browser } = await cap();
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('ca.mobilis.app://auth')) return;
      const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1] || '');
      const idToken = params.get('id_token');
      try {
        await Browser.close();
      } catch {
        /* navigateur déjà fermé */
      }
      if (!idToken) return;
      await onIdToken(idToken);
    });
  } catch (e) {
    console.warn('Retour de connexion indisponible', e);
  }
}

/** Ouvre une page dans le navigateur du téléphone (APK). */
export async function openExternal(url: string): Promise<void> {
  const { Browser } = await cap();
  await Browser.open({ url });
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** Envoie le PDF : natif (Filesystem cache + Share) · Web Share avec fichier · téléchargement. → 'native' | 'share' | 'download' | 'cancelled' */
export async function sharePdf(
  blob: Blob,
  fileName: string,
  { title = 'Mobilis' }: { title?: string } = {},
): Promise<'native' | 'share' | 'download' | 'cancelled'> {
  if (isNative()) {
    const { Filesystem, Directory, Share } = await cap();
    const data = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    try {
      await Share.share({ title, files: [saved.uri], dialogTitle: title });
      return 'native';
    } catch (e) {
      return /cancel/i.test(String((e as { message?: unknown } | null)?.message || e)) ? 'cancelled' : 'native';
    }
  }
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'application/pdf' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'share';
    } catch (e) {
      if (e && (e as { name?: unknown }).name === 'AbortError') return 'cancelled';
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

/** Charge jsPDF (local, paresseux) : script du navigateur, ou lecture du fichier sous Node (tests). */
export interface JsPdfModule {
  jsPDF: new (opts?: unknown) => unknown;
}
let jsPdfP: Promise<JsPdfModule['jsPDF']> | null = null;
export function loadJsPDF(): Promise<JsPdfModule['jsPDF']> {
  const g = globalThis as unknown as { jspdf?: JsPdfModule };
  if (g.jspdf?.jsPDF) return Promise.resolve(g.jspdf.jsPDF);
  if (jsPdfP) return jsPdfP;
  jsPdfP = (async () => {
    const url = assetUrl('vendor/jspdf.umd.min.js');
    if (typeof document !== 'undefined') {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => res();
        s.onerror = () => rej(new Error('jspdf'));
        document.head.appendChild(s);
      });
    } else {
      // node (tests) : modules Node chargés par un nom calculé (jamais analysés par le bundler)
      const fsN = 'node:fs',
        vmN = 'node:vm';
      const [fs, vm] = (await Promise.all([import(/* @vite-ignore */ fsN), import(/* @vite-ignore */ vmN)])) as [
        { readFileSync(url: URL, enc: string): string },
        { runInThisContext(code: string): unknown },
      ];
      vm.runInThisContext(fs.readFileSync(new URL(url), 'utf8'));
    }
    if (!g.jspdf?.jsPDF) throw new Error('jspdf');
    return g.jspdf.jsPDF;
  })().catch((e: unknown) => {
    jsPdfP = null;
    throw e;
  });
  return jsPdfP;
}
