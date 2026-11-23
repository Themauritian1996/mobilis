// Écran « Profil » : réglages, accessibilité, coach IA, mode patient / clinicien, sauvegarde et effacement
// (reprise de www/js/app.js).
import { t, tr, getLang, locale, LANGS, setAiLang } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import * as P from '../../../www/js/program.js';
import { speakRich, cueText } from '../../../www/js/coach.js';
import { state, go, profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { nav } from '../components/nav.ts';
import { applyTheme } from '../components/nav.ts';
import { langPicker } from '../components/design.ts';
import { confirmSheet } from '../components/sheet.ts';
import { saveFile } from '../components/files.ts';
import { layName } from './onboarding.ts';
import { $app, askImageConsent, bindTrialBar, patchProfile, prof as profOf, trialBar } from './shared.ts';
import { navRole } from '../app-state.ts';

type Bilingual = Record<string, string>;

// Texte avec repli FR/EN tant que la clé n'est pas dans les dictionnaires
const aiPref = (): string => {
  try {
    return localStorage.getItem('mobilis.aiLang') || 'auto';
  } catch {
    return 'auto';
  }
};
const tk = (k: string, fb: Bilingual): string => {
  const v = t(k);
  return v === k ? tr(fb) : v;
};
const AI_LANG_TXT: Bilingual = { fr: 'Langue du coach IA', en: 'AI coach language' },
  AI_AUTO: Bilingual = { fr: "Comme l'app", en: 'Same as the app' };
const PARTIAL_TXT: Bilingual = { fr: 'Compter les répétitions partielles', en: 'Count partial reps' },
  PARTIAL_D: Bilingual = {
    fr: 'Une répétition moins ample compte quand même (dès ~35 % du mouvement), marquée « partielle ».',
    en: 'A smaller rep still counts (from ~35% of the range), marked "partial".',
  };

/** Réglages enregistrés (store.settings) lus par l'écran. */
interface Settings {
  theme?: string;
  voice?: string;
  countAloud?: boolean;
  vibrate?: boolean;
  selfView?: boolean;
  guides?: boolean;
  anatomy?: boolean;
  camera?: string;
  voiceRate?: number | string;
  cueLevel?: string;
  textSize?: number | string;
  contrast?: boolean;
  weekStart?: number | string;
  geminiKey?: string;
  countPartial?: boolean;
  sendFrame?: boolean;
  liveAI?: boolean;
  aiMode?: string;
}
/** IA partagée par le clinicien (store.sharedAIInfo). */
interface SharedAI {
  from?: string;
  until?: string;
  cap?: number;
  used?: number;
  capped?: boolean;
  mode?: string;
}

export function viewProfile(): void {
  const prof = profOf();
  const st: Settings = store.settings();
  const u = state.user as { local?: boolean; email?: string };
  const sh: SharedAI | null = store.sharedAIInfo();
  const sw = (k: string, on: unknown) =>
    `<button class="switch ${on ? 'on' : ''}" data-sw="${k}" role="switch" aria-checked="${!!on}"></button>`;
  $app.innerHTML = `<section class="screen">${trialBar()}<div class="topbar"><h1>${t('profile')}</h1></div>
    <div class="card row profile-card"><div class="avatar">${esc((prof.name || '?')[0]?.toUpperCase())}</div><div class="grow"><b>${esc(prof.name)}</b><div class="small muted">${u.local ? t('localMode') : esc(u.email || '')}</div></div>
      <span class="chip">${prof.role === 'clinician' ? t('roleClinician') : t('rolePatient')}</span></div>
    ${prof.pathology ? `<div class="list linklist" style="margin-top:12px"><button class="toggle" data-go="#/adjust"><span class="li-ic">${icon('target', 18)}</span><span class="grow"><b>${t('adjustTitle')}</b><br><small class="muted">${esc(layName(prof.pathology))} · ${t('phase')} ${prof.phase || 1}</small></span><span class="chev" aria-hidden="true">${icon('chev', 18)}</span></button></div>` : ''}
    <h2>${t('settings')}</h2><div class="list">
      <div class="toggle"><span>${t('language')}${['fr', 'en'].includes(getLang()) ? '' : `<br><small class="muted">${t('langBeta')}</small>`}</span>${langPicker()}</div>
      <div class="toggle" style="display:block"><span>${t('theme')}</span><div class="seg" style="margin-top:8px">${['auto', 'light', 'dark'].map((v) => `<button data-theme-set="${v}" class="${st.theme === v ? 'on' : ''}">${t('theme_' + v)}</button>`).join('')}</div></div>
      <div class="toggle" style="display:block"><span>${t('voice')}</span><div class="seg" style="margin-top:8px">${['local', 'gemini', 'off'].map((v) => `<button data-voice="${v}" class="${st.voice === v ? 'on' : ''}">${t(v === 'local' ? 'voiceLocal' : v === 'gemini' ? 'voiceGemini' : 'voiceOff')}</button>`).join('')}</div></div>
      <div class="toggle"><span>${t('countAloud')}</span>${sw('countAloud', st.countAloud)}</div>
      ${'vibrate' in navigator ? `<div class="toggle"><span>${t('vibrateSetting')}</span>${sw('vibrate', st.vibrate !== false)}</div>` : ''}
      <div class="toggle"><span>${t('selfViewSetting')}<br><small class="muted">${t('selfViewSettingD')}</small></span>${sw('selfView', st.selfView !== false)}</div>
      <div class="toggle"><span>${t('guidesSetting')}<br><small class="muted">${t('guidesSettingD')}</small></span>${sw('guides', st.guides !== false)}</div>
      <div class="toggle"><span>${t('anatomyDefault')}</span>${sw('anatomy', st.anatomy)}</div>
      <div class="toggle" style="display:block"><span>${t('camDefault')}</span><div class="seg" style="margin-top:8px">${['user', 'environment'].map((v) => `<button data-cam="${v}" aria-pressed="${st.camera === v}" class="${st.camera === v ? 'on' : ''}">${t(v === 'user' ? 'camUser' : 'camEnv')}</button>`).join('')}</div></div>
    </div>
    <h2>${t('settingsA11y')}</h2><div class="list">
      <div class="toggle" style="display:block"><label for="vrate">${t('voiceRate')} <b class="tnum" id="vrate-v">${(+(st.voiceRate ?? 0) || 1).toFixed(2).replace(/0$/, '')}×</b></label><input type="range" id="vrate" min="0.8" max="1.3" step="0.05" value="${+(st.voiceRate ?? 0) || 1}" style="margin-top:8px"></div>
      <div class="toggle" style="display:block"><span>${t('cueLevel')}<br><small class="muted">${t('cueLevelD')}</small></span><div class="seg" style="margin-top:8px">${['all', 'essential'].map((v) => `<button data-cue="${v}" aria-pressed="${(st.cueLevel || 'all') === v}" class="${(st.cueLevel || 'all') === v ? 'on' : ''}">${t(v === 'all' ? 'cueAll' : 'cueEssential')}</button>`).join('')}</div></div>
      <div class="toggle" style="display:block"><span>${t('textSize')}</span><div class="seg" style="margin-top:8px">${[100, 115, 130].map((v) => `<button data-tsize="${v}" aria-pressed="${+(st.textSize ?? 0) === v}" class="${+(st.textSize ?? 0) === v ? 'on' : ''}">${v} %</button>`).join('')}</div></div>
      <div class="toggle"><span>${t('contrast')}<br><small class="muted">${t('contrastD')}</small></span>${sw('contrast', !!st.contrast)}</div>
      <div class="toggle" style="display:block"><span>${t('weekStart')}</span><div class="seg" style="margin-top:8px">${(
        [
          ['auto', 'wsAuto'],
          [1, 'wsMon'],
          [0, 'wsSun'],
        ] as const
      )
        .map(
          ([v, k]) =>
            `<button data-ws="${v}" aria-pressed="${String(st.weekStart) === String(v)}" class="${String(st.weekStart) === String(v) ? 'on' : ''}">${t(k)}</button>`,
        )
        .join('')}</div></div>
    </div>
    <h2>${t('aiCoach')}</h2><div class="card">
      ${sh && !st.geminiKey ? `<div class="banner pos" id="ai-shared">${icon('spark', 20)}<div><b>${t('aiProvided')}${sh.from ? ' (' + esc(sh.from) + ')' : ''}${sh.until ? ' ' + t('aiProvidedUntil') + ' ' + esc(new Date(sh.until + 'T12:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })) : ''}</b><br><small>${t('aiProvidedD')}${sh.cap ? ` · ${sh.used}/${sh.cap} ${t('aiProvidedUsed')}` : ''}</small>${sh.capped ? `<br><small class="neg">${t('aiCapNote')}</small>` : ''}${sh.mode === 'proxy' ? `<br><small>${t('aiProxyNoLive')}</small>` : ''}</div></div>` : ''}
      ${sh && !st.geminiKey ? '<details style="margin-bottom:8px"><summary class="small muted">' + t('geminiKey') + '</summary>' : ''}
      <label class="field"><span>${t('geminiKey')}</span><input class="input" id="gk" type="password" value="${esc(st.geminiKey)}" placeholder="AIza…" autocomplete="off"></label>
      <p class="note" style="margin-top:-6px">${t('geminiKeyD')}</p>
      ${sh && !st.geminiKey ? '</details>' : ''}
      <div class="toggle" style="padding:12px 0 0"><span>${tk('aiLang', AI_LANG_TXT)}</span><select class="input lang-select" id="ailang" aria-label="${tk('aiLang', AI_LANG_TXT)}"><option value="auto" ${aiPref() === 'auto' ? 'selected' : ''}>${tk('aiLangAuto', AI_AUTO)}</option>${(LANGS as { id: string; name: string }[]).map((l) => `<option value="${l.id}" ${aiPref() === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>
      <div class="toggle" style="padding:12px 0 0"><span><span>${tk('countPartial', PARTIAL_TXT)}</span><br><small class="muted">${tk('countPartialD', PARTIAL_D)}</small></span>${sw('countPartial', st.countPartial !== false)}</div>
      <div class="toggle" style="padding:12px 0 0"><span><span>${t('consentSetting')}</span><br><small class="muted">${t('consentSettingD')}</small></span>${sw('imageConsent', store.imageConsent(st))}</div>
      ${st.geminiKey ? `<button class="btn sm ghost danger" data-a="purgeKey" style="margin-top:12px">${t('purgeKey')}</button>` : ''}
      <div class="toggle" style="padding:12px 0 0"><span><span>${t('sendFrame')}</span><br><small class="muted">${t('sendFrameD')}</small></span>${sw('sendFrame', st.sendFrame)}</div>
      <div class="toggle" style="padding:12px 0 0"><span><span>${t('liveAI')}</span><br><small class="muted">${t(store.aiKey() ? 'liveAID' : 'liveNeedKey')}</small></span>${sw('liveAI', !!st.liveAI)}</div>
      <div class="toggle" style="display:block;padding:12px 0 0"><span>${t('aiMode')}<br><small class="muted">${t('aiModeD')}</small></span><div class="seg" style="margin-top:8px">${['precise', 'live'].map((v) => `<button data-aimode="${v}" class="${(st.aiMode || 'precise') === v ? 'on' : ''}">${t(v === 'precise' ? 'aiModePrecise' : 'aiModeLive')}</button>`).join('')}</div></div>
    </div>
    <h2>${t('mode')}</h2><div class="list"><div class="toggle"><span><b>${prof.role === 'clinician' ? t('switchToPatient') : t('switchToClin')}</b><br><small class="muted">${t('switchD')}</small></span><button class="btn sm ghost" data-a="role">${t('change')}</button></div></div>
    <h2>${t('about')}</h2><div class="card small"><p style="margin-top:0">${t('aboutD')}</p><p class="muted" style="margin-bottom:0">${t('disclaimer')}</p></div>
    ${store.isNative() ? '' : `<h2>${t('offTitle')}</h2><div class="card small"><p style="margin-top:0">${t('offD')}</p><button class="btn ghost" data-a="offline" id="off-btn">${t('offBtn')}</button></div>`}
    <h2>${t('bkTitle')}</h2><div class="card small"><p style="margin-top:0">${t('bkD')}</p><input type="file" id="bk-file" accept=".json,application/json" hidden><button class="btn ghost" data-a="import">${t('bkImport')}</button></div>
    <div class="stack" style="margin-top:16px"><button class="btn ghost" data-a="export">${t('exportData')}</button>
      <button class="btn danger" data-a="erase">${t('deleteLocal')}</button>
      ${store.isCloud() ? `<button class="btn danger" data-a="cloudDel">${t('cloudDelBtn')}</button>` : ''}
      <button class="btn ghost" data-a="out">${t('signOut')}</button></div>
  </section>${nav('profile', navRole())}`;
  const q = <E extends HTMLElement = HTMLElement>(s: string): E => $app.querySelector<E>(s) as E;
  const signedOut = (u2: typeof state.user) => {
    state.user = u2;
    state.data = null;
  };
  bindTrialBar();
  $app.querySelectorAll<HTMLElement>('[data-theme-set]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ theme: b.dataset['themeSet'] });
        applyTheme();
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-aimode]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (b.dataset['aimode'] === 'live' && !store.imageConsent() && !(await askImageConsent())) return viewProfile();
        store.saveSettings({ aiMode: b.dataset['aimode'] });
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-voice]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ voice: b.dataset['voice'] });
        viewProfile();
        if (b.dataset['voice'] !== 'off') speakRich(cueText('good'), { lang: getLang() });
      }),
  );
  // Avant d'envoyer la moindre image à l'IA : consentement explicite (feuille), mémorisé et retirable ici
  $app.querySelectorAll<HTMLElement>('[data-sw]').forEach(
    (b) =>
      (b.onclick = async () => {
        const k = b.dataset['sw'] ?? '',
          cur: Settings & Record<string, unknown> = store.settings();
        if (k === 'imageConsent') {
          if (store.imageConsent(cur)) store.setImageConsent(false);
          else await askImageConsent();
          return viewProfile();
        }
        if (k === 'contrast') {
          store.saveSettings({ contrast: !cur.contrast });
          applyTheme();
          return viewProfile();
        }
        const next = k === 'countPartial' ? cur.countPartial === false : !cur[k];
        if (next && (k === 'sendFrame' || k === 'liveAI') && !store.imageConsent(cur) && !(await askImageConsent()))
          return viewProfile();
        store.saveSettings({ [k]: next });
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-cam]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ camera: b.dataset['cam'] });
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-cue]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ cueLevel: b.dataset['cue'] });
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-tsize]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ textSize: +(b.dataset['tsize'] ?? 100) });
        applyTheme();
        viewProfile();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-ws]').forEach(
    (b) =>
      (b.onclick = () => {
        store.saveSettings({ weekStart: b.dataset['ws'] === 'auto' ? 'auto' : +(b.dataset['ws'] ?? 0) });
        viewProfile();
      }),
  );
  const vr = q<HTMLInputElement>('#vrate');
  vr.oninput = () => {
    q('#vrate-v').textContent = (+vr.value).toFixed(2).replace(/0$/, '') + '×';
  };
  vr.onchange = () => {
    store.saveSettings({ voiceRate: store.clampRate(vr.value) });
    if (store.settings().voice !== 'off') speakRich(cueText('good'), { lang: getLang() });
  };
  const pk = $app.querySelector<HTMLElement>('[data-a="purgeKey"]');
  if (pk)
    pk.onclick = async () => {
      if (await confirmSheet({ title: t('purgeKeyQ'), ok: t('purgeKey'), danger: true })) {
        store.purgeApiKey();
        toast(t('purgeDone'));
        viewProfile();
      }
    };
  q<HTMLSelectElement>('#ailang').onchange = () => {
    setAiLang(q<HTMLSelectElement>('#ailang').value);
    toast(t('saved'));
  };
  q<HTMLInputElement>('#gk').onchange = () => {
    store.saveSettings({ geminiKey: q<HTMLInputElement>('#gk').value.trim() });
    toast(t('saved'));
  };
  q('[data-a="role"]').onclick = async () => {
    const role = prof.role === 'clinician' ? 'patient' : 'clinician';
    await patchProfile({ role, trial: false });
    go(role === 'clinician' ? '#/clinic' : prof.pathology ? '#/home' : '#/onboard');
  };
  // APK : Filesystem + feuille de partage (un lien blob: ne se télécharge pas dans la WebView) ; web : téléchargement
  const offB = $app.querySelector<HTMLButtonElement>('#off-btn');
  if (offB) {
    void import('../../../www/js/offline.js').then(async (O) => {
      try {
        const status = await O.offlineStatus();
        if (status?.ready) {
          offB.textContent = t('offReady');
          offB.disabled = true;
        }
      } catch {
        /* état hors ligne illisible : le bouton reste actif */
      }
    });
    offB.onclick = async () => {
      offB.disabled = true;
      try {
        const O = await import('../../../www/js/offline.js');
        const status = await O.cacheModelsForOffline(({ done: d, total: n }: { done: number; total: number }) => {
          offB.textContent = `${t('offBtn')} · ${Math.round((d / (n || 1)) * 100)} %`;
        });
        if (status && status.ready === false) throw new Error('incomplete');
        offB.textContent = t('offReady');
        toast(t('offReady'));
      } catch {
        offB.disabled = false;
        offB.textContent = t('offBtn');
        toast(t('offFail'));
      }
    };
  }
  q('[data-a="export"]').onclick = async () => {
    try {
      const r = await saveFile(store.exportData(), `mobilis-${P.todayKey()}.json`, 'application/json', {
        title: t('exportData'),
      });
      if (r !== 'cancelled') toast(t('fileReady'));
    } catch (e) {
      console.warn(e);
      toast(t('fileErr'), 4000);
    }
  };
  q('[data-a="import"]').onclick = () => q('#bk-file').click();
  q<HTMLInputElement>('#bk-file').onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const r = await store.importData(await f.text(), { replaceProfile: !profile()?.pathology });
      state.data = await store.loadData();
      toast(t('bkOk', { n: r.sessions }), 4000);
      go('#/home');
    } catch (err) {
      console.warn(err);
      toast(t('bkBad'), 4000);
    }
  };
  const er = $app.querySelector<HTMLElement>('[data-a="erase"]');
  if (er)
    er.onclick = async () => {
      if (!(await confirmSheet({ title: t('eraseTitle'), text: t('eraseText'), ok: t('eraseBtn'), danger: true })))
        return;
      store.eraseLocal();
      applyTheme();
      await store.signOut(signedOut);
      go('#/');
    };
  // Compte en ligne : suppression des données du serveur (droit à l'effacement), double confirmation
  const cd = $app.querySelector<HTMLButtonElement>('[data-a="cloudDel"]');
  if (cd)
    cd.onclick = async () => {
      if (!(await confirmSheet({ title: t('cloudDelT1'), text: t('cloudDelD'), ok: t('cloudDelBtn'), danger: true })))
        return;
      if (!(await confirmSheet({ title: t('cloudDelT2'), text: t('cloudDelD2'), ok: t('eraseBtn'), danger: true })))
        return;
      cd.disabled = true;
      try {
        await store.deleteCloudData();
      } catch (e) {
        console.warn(e);
        cd.disabled = false;
        return toast(t('cloudDelErr'), 5000);
      }
      applyTheme();
      toast(t('cloudDelDone'), 4000);
      await store.signOut(signedOut);
      go('#/');
    };
  q('[data-a="out"]').onclick = () =>
    void store.signOut((u2: typeof state.user) => {
      signedOut(u2);
      go('#/');
    });
}
