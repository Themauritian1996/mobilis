// Voix et micro du coach IA : voix Gemini (TTS) des commentaires de fin de série, dictée du commentaire (navigateur, APK ou
// transcription Gemini), capture d'une image réduite. Code de www/js/coach.js (v1.15).
import { getAiLang, langInfo, aiLangInfo } from '../../../core/i18n/engine.ts';
import { CONFIG, coachUrl } from '../../../platform/assets.ts';
import { playRich, primeAudio, stopAll } from '../../../platform/audio.ts';
import {
  currentRichSeq,
  nativeDictation,
  nextRichSeq,
  speak,
  stopDeviceVoice,
  stopSpeech,
  type DictationHandlers,
  type DictationSession,
} from '../../../platform/speech.ts';
import { aiCount, aiKey, imageConsent, settings } from '../../db/local/settings.ts';
import { aiAvailable, callProxy, genFetch, gemini, isModelDead, markModelDead } from './index.ts';

// ---------- Dictée du commentaire ----------
// 1) Reconnaissance vocale du navigateur (Chrome) ; 2) sinon enregistrement + transcription Gemini ; 3) sinon null.
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [i: number]: { readonly transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
  readonly error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  Capacitor?: { isNativePlatform?: () => boolean };
}
const canRecord = (): boolean =>
  !!(
    (window as unknown as { MediaRecorder?: unknown }).MediaRecorder &&
    (navigator as { mediaDevices?: { getUserMedia?: unknown } }).mediaDevices?.getUserMedia
  );
const sw = (): SpeechWindow => window as unknown as SpeechWindow;

export function dictationMode(): 'native' | 'browser' | 'gemini' | null {
  const SR = sw().SpeechRecognition || sw().webkitSpeechRecognition;
  const native = !!(sw().Capacitor && sw().Capacitor?.isNativePlatform && sw().Capacitor?.isNativePlatform?.());
  if (native) return 'native'; // APK : reconnaissance vocale d'Android (gratuite, sans clé)
  if (SR) return 'browser';
  if (aiAvailable() && canRecord()) return 'gemini';
  return null;
}

export async function startDictation({ onText, onState }: DictationHandlers): Promise<DictationSession | null> {
  let mode = dictationMode();
  if (mode === 'native') {
    const r = await nativeDictation({ onText, onState });
    if (r === 'done') return null;
    if (r) return r;
    mode = aiAvailable() && canRecord() ? 'gemini' : null;
  }
  if (mode === 'browser') {
    const SR = (sw().SpeechRecognition || sw().webkitSpeechRecognition) as new () => SpeechRecognitionLike;
    const rec = new SR();
    rec.lang = langInfo().voice[0] as string;
    rec.continuous = true;
    rec.interimResults = true;
    let finalTxt = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i] as SpeechRecognitionResultLike;
        if (res.isFinal) finalTxt += (res[0] as { transcript: string }).transcript + ' ';
        else interim += (res[0] as { transcript: string }).transcript;
      }
      onText((finalTxt + interim).trim(), false);
    };
    rec.onerror = (e) => onState(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'error');
    rec.onend = () => {
      onText(finalTxt.trim(), true);
      onState('idle');
    };
    stopSpeech();
    rec.start();
    onState('listening');
    return { stop: () => rec.stop() };
  }
  if (mode === 'gemini') {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onState('denied');
      return null;
    }
    const type =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) =>
        MediaRecorder.isTypeSupported?.(x),
      ) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    mr.onstop = async () => {
      stream.getTracks().forEach((tk) => tk.stop());
      onState('transcribing');
      try {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const b64 = await blobB64(blob);
        onText(await transcribe(b64, (mr.mimeType || 'audio/webm').split(';')[0] as string), true);
        onState('idle');
      } catch (e) {
        console.warn(e);
        onState('error');
      }
    };
    const timer = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
    mr.start();
    onState('listening');
    return {
      stop: () => {
        clearTimeout(timer);
        if (mr.state === 'recording') mr.stop();
      },
    };
  }
  onState('unavailable');
  return null;
}
const blobB64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
async function transcribe(b64: string, mime: string): Promise<string> {
  const sys = `Transcribe the patient's spoken comment verbatim. The patient most likely speaks ${aiLangInfo().label} or ${langInfo().label} (they may mix languages). Output only the transcription, no quotes, no notes.`;
  const key = aiKey();
  if (key)
    return gemini({
      key,
      sys,
      parts: [{ inline_data: { mime_type: mime, data: b64 } }],
      maxTokens: 400,
      timeout: 20000,
    });
  return callProxy({ kind: 'transcribe', audio: b64, mime });
}

// ---------- Voix Gemini (TTS) pour les commentaires de fin de série ----------
interface TtsReply {
  audio?: string;
  candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
}
export async function speakRich(text: string, { lang = getAiLang() }: { lang?: string } = {}): Promise<void> {
  const s = settings();
  if (s.voice === 'off') return;
  primeAudio(); // dans le geste de l'utilisateur quand il y en a un
  const seq = nextRichSeq(); // toute parole plus récente (ou stopSpeech) annule celle-ci
  stopDeviceVoice();
  stopAll({ fade: true });
  if (s.voice !== 'gemini') return speak(text, { interrupt: true, force: true, lang });
  try {
    const voiceName = lang === 'fr' ? 'Aoede' : 'Kore';
    const body = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    };
    let r: Response | undefined;
    if (aiKey()) {
      aiCount();
      for (const m of (CONFIG.geminiTtsModels || []).filter((x) => !isModelDead(x))) {
        r = await genFetch(m, body, aiKey());
        if (r.ok || ![400, 403, 404].includes(r.status)) break;
        markModelDead(m);
      }
      if (!r) throw new Error('no tts');
    } else {
      if (!CONFIG.coachEndpoint) throw new Error('no endpoint');
      r = await fetch(coachUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'tts', text, lang, langLabel: langInfo(lang).label }),
      });
    }
    if (!r.ok) throw new Error('tts');
    const j = (await r.json()) as TtsReply;
    const b64 = j.audio || j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!b64) throw new Error('no audio');
    if (seq !== currentRichSeq()) return; // une parole plus récente a pris la place pendant le chargement
    if (!playRich(b64)) throw new Error('no audio ctx');
  } catch {
    if (seq === currentRichSeq()) speak(text, { interrupt: true, force: true, lang });
  }
}

// Capture d'une image réduite (pour le commentaire visuel facultatif)
export function grabFrame(video: HTMLVideoElement, mirror?: boolean): string | null {
  if (!imageConsent()) return null;
  try {
    const w = 384,
      h = Math.round((video.videoHeight / video.videoWidth) * w) || 288;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    if (mirror) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    g.drawImage(video, 0, 0, w, h);
    return (c.toDataURL('image/jpeg', 0.7).split(',')[1] as string) ?? null;
  } catch {
    return null;
  }
}
