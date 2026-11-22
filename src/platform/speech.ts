// Voix de l'appareil du coach : consignes instantanées (synthèse vocale du navigateur ou native de l'APK), anti-répétition,
// comptage à voix haute, reconnaissance vocale native (dictée). Les voix Gemini (TTS, API Live) sont dans services/ai/gemini.
import { CUES, getAiLang, getLang, langInfo, tr } from '../core/i18n/engine.ts';
import { clampRate, settings } from '../services/db/local/settings.ts';
import { stopAll } from './audio.ts';
import { cap, isNative } from './files.ts';

// ---------- Voix de l'appareil (latence quasi nulle, idéal pour corriger en direct) ----------
let liveTalking = false,
  richSeqN = 0;
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = (): void => {
  try {
    voices = speechSynthesis.getVoices();
  } catch {
    voices = [];
  }
};
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(id: string): SpeechSynthesisVoice | null {
  const pref = langInfo(id).voice;
  for (const p of pref) {
    const v = voices.find((x) => x.lang && x.lang.replace('_', '-').startsWith(p));
    if (v) return v;
  }
  return null;
}

/** Séquence des paroles Gemini de fin de série : toute parole plus récente (ou stopSpeech) annule la précédente. */
export const nextRichSeq = (): number => ++richSeqN;
export const currentRichSeq = (): number => richSeqN;

// APK : la voix du navigateur n'existe pas dans la WebView Android → synthèse vocale native (plugin TextToSpeech).
interface TtsPlugin {
  speak(o: {
    text: string;
    lang: string;
    rate: number;
    pitch: number;
    volume: number;
    category: string;
    queueStrategy: number;
  }): Promise<unknown>;
  stop(): Promise<unknown>;
}
let nativeTTS: TtsPlugin | false | null = null;
async function tts(): Promise<TtsPlugin | false> {
  if (!nativeTTS) {
    try {
      nativeTTS = ((await cap()).TextToSpeech as TtsPlugin | undefined) || false;
    } catch {
      nativeTTS = false;
    }
  }
  return nativeTTS;
}
// Coupe les voix de l'appareil (navigateur + native) seulement
export function stopDeviceVoice(): void {
  try {
    speechSynthesis.cancel();
  } catch {
    /* pas de synthèse vocale */
  }
  if (isNative()) void tts().then((T) => T && T.stop().catch(() => undefined));
}
// Coupe toute parole : voix de l'appareil, voix Gemini de fin de série et voix en direct (fondu de 60 ms)
export function stopSpeech(): void {
  richSeqN++;
  stopDeviceVoice();
  stopAll({ fade: true });
}
// force : parler même pendant que le coach en direct parle (sinon on se tait : jamais deux voix à la fois)
// lang : id de langue de la voix (défaut = langue de l'app) ; le texte du coach IA passe par speakAI (langue du coach)
export function speak(
  text: string | null | undefined,
  { interrupt = false, force = false, lang }: { interrupt?: boolean; force?: boolean; lang?: string } = {},
): void {
  if (settings().voice === 'off' || !text) return;
  if (liveTalking && !force) return;
  if (interrupt) {
    richSeqN++;
    stopAll({ fade: true, kind: 'rich' });
  }
  if (isNative()) {
    void tts().then((T) => {
      if (!T) return;
      T.speak({
        text,
        lang: langInfo(lang).voice[0] as string,
        rate: clampRate(settings().voiceRate),
        pitch: 1.0,
        volume: 1.0,
        category: 'playback',
        queueStrategy: interrupt ? 0 : 1,
      }).catch((e: unknown) => console.warn('tts', e));
    });
    return;
  }
  if (!('speechSynthesis' in window)) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langInfo(lang).voice[0] as string;
    const v = pickVoice(lang as string);
    if (v) u.voice = v;
    u.rate = clampRate(settings().voiceRate) * 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* synthèse vocale indisponible */
  }
}

// Texte produit par le coach IA : voix de l'appareil dans la langue du coach
export const speakAI = (text: string, o: { interrupt?: boolean; force?: boolean } = {}): void =>
  speak(text, { ...o, lang: getAiLang() });

// Anti-répétition des consignes
const lastSaid: Record<string, number> = {};
let lastAny = 0;
// Pendant que le coach IA en direct parle, les consignes locales se taisent (sauf le comptage).
export const setLiveTalking = (v: boolean): void => {
  liveTalking = v;
  if (v) stopDeviceVoice();
};
// Verbosité : « essential » = mise en place, corrections et fin de série ; sans encouragements ni conseils de finesse, et corrections moins fréquentes
export const NON_ESSENTIAL_CUES: ReadonlySet<string> = new Set(['good', 'great', 'depth', 'slow', 'lastRep']);
export const cueAllowed = (key: string, level: string = settings().cueLevel): boolean =>
  level !== 'essential' || !NON_ESSENTIAL_CUES.has(key);
export function cue(key: string): boolean {
  const now = Date.now();
  if (liveTalking) return false;
  if (!cueAllowed(key)) return false;
  const gap = settings().cueLevel === 'essential' ? 9000 : 5000;
  if (now - lastAny < 2200 || now - (lastSaid[key] || 0) < gap) return false;
  lastAny = now;
  lastSaid[key] = now;
  speak(tr(CUES[key]));
  return true;
}

const NUM: Record<string, string[]> = {
  fr: [
    'zéro',
    'un',
    'deux',
    'trois',
    'quatre',
    'cinq',
    'six',
    'sept',
    'huit',
    'neuf',
    'dix',
    'onze',
    'douze',
    'treize',
    'quatorze',
    'quinze',
    'seize',
    'dix-sept',
    'dix-huit',
    'dix-neuf',
    'vingt',
  ],
};
export function countAloud(n: number): void {
  if (!settings().countAloud) return;
  speak(NUM[getLang()]?.[n] || String(n));
}

// ---------- Dictée native (APK : reconnaissance vocale d'Android, gratuite, sans clé) ----------
export type DictationState = 'listening' | 'idle' | 'denied' | 'error' | 'transcribing' | 'unavailable';
export interface DictationHandlers {
  onText(text: string, final: boolean): void;
  onState(state: DictationState): void;
}
export interface DictationSession {
  stop(): void;
}
interface SpeechRecognitionPlugin {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: string }>;
  requestPermissions(): Promise<{ speechRecognition: string }>;
  removeAllListeners(): Promise<unknown>;
  addListener(event: string, cb: (d: { matches?: string[]; status?: string }) => void): Promise<unknown>;
  start(o: {
    language: string;
    maxResults: number;
    partialResults: boolean;
    popup: boolean;
  }): Promise<{ matches?: string[] } | undefined>;
  stop(): Promise<unknown>;
}
/** `null` = indisponible (repli), 'done' = refus de permission déjà signalé, sinon la session de dictée. */
export async function nativeDictation({
  onText,
  onState,
}: DictationHandlers): Promise<DictationSession | 'done' | null> {
  let SpeechRecognition: SpeechRecognitionPlugin;
  try {
    SpeechRecognition = (await cap()).SpeechRecognition as SpeechRecognitionPlugin;
  } catch {
    return null;
  }
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) return null;
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      onState('denied');
      return 'done';
    }
  } catch {
    return null;
  }
  let last = '',
    ended = false;
  const finish = async (): Promise<void> => {
    if (ended) return;
    ended = true;
    try {
      await SpeechRecognition.removeAllListeners();
    } catch {
      /* déjà retirés */
    }
    onText(last.trim(), true);
    onState('idle');
  };
  await SpeechRecognition.removeAllListeners().catch(() => undefined);
  await SpeechRecognition.addListener('partialResults', (d) => {
    if (d.matches && d.matches[0]) {
      last = d.matches[0];
      onText(last, false);
    }
  });
  await SpeechRecognition.addListener('listeningState', (d) => {
    if (d.status === 'stopped') setTimeout(finish, 250);
  });
  stopSpeech();
  SpeechRecognition.start({
    language: langInfo().voice[0] as string,
    maxResults: 1,
    partialResults: true,
    popup: false,
  })
    .then((r) => {
      if (r && r.matches && r.matches[0]) last = r.matches[0];
    })
    .catch(() => {
      if (!last) {
        ended = true;
        onState('error');
      }
    });
  onState('listening');
  return {
    stop: () => {
      SpeechRecognition.stop().catch(() => undefined);
      setTimeout(finish, 600);
    },
  };
}
