// Écran de connexion (reprise de www/js/app.js) : Google / e-mail (si Firebase), mode local, restauration d'une sauvegarde.
import { firebaseEnabled } from '../../../www/js/config.js';
import { t } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import { state, render } from '../app-state.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { mountFigs } from '../components/figures.ts';
import { ds, langPicker } from '../components/design.ts';
import { $app } from './shared.ts';

export function viewAuth(): void {
  const fbOn = firebaseEnabled();
  const pending = store.getPendingRx();
  $app.innerHTML = `<section class="screen auth">
    <div class="row between"><div class="brand-lg">${icon('logo', 34)} Mobilis</div>
      ${langPicker()}</div>
    <div class="auth-stage"><svg class="hero-fig" data-fig="squat" data-static="0" data-keys="0" data-anat="0"></svg></div>
    <h1>${t('heroTitle')}</h1><p class="tagline">${t('tagline')}</p>
    <ul class="vprops"><li><span class="vp-ic">${icon('cam', 20)}</span><span>${ds('vpCam')}</span></li><li><span class="vp-ic">${icon('trend', 20)}</span><span>${ds('vpPlan')}</span></li><li><span class="vp-ic">${icon('stetho', 20)}</span><span>${ds('vpClin')}</span></li></ul>
    ${pending ? `<div class="banner pos" style="margin-bottom:12px">${icon('stetho', 20)}<div>${t('pendingRx')} <button class="link" data-a="dropRx">${t('rxDismiss')}</button></div></div>` : ''}
    <div class="stack">
      ${
        fbOn
          ? `<button class="btn" data-a="google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${t('googleBtn')}</button>
      <button class="btn ghost" data-a="emailToggle">${t('emailBtn')}</button>
      <div id="emailBox" hidden class="card">
        <label class="field"><span>${t('email')}</span><input class="input" id="em" type="email" autocomplete="email"></label>
        <label class="field"><span>${t('password')}</span><input class="input" id="pw" type="password" autocomplete="current-password" minlength="6"></label>
        <div class="row"><button class="btn" data-a="signin">${t('signIn')}</button><button class="btn ghost" data-a="signup">${t('signUp')}</button></div>
        <button class="link small" data-a="reset" style="margin-top:12px">${t('forgot')}</button>
      </div>
      <p class="err" id="err" hidden></p>
      <div class="divider">${t('or')}</div>`
          : ''
      }
      <button class="btn ${fbOn ? 'soft' : ''}" data-a="local">${fbOn ? t('demoBtn') : t('start')}</button>
      <input type="file" id="rs-file" accept=".json,application/json" hidden><button class="link small" data-a="restore" style="margin-top:8px">${t('bkRestoreStart')}</button>
    </div>
    <p class="note" style="margin-top:18px">${t('disclaimer')}</p>
  </section>`;
  mountFigs($app);
  const q = <E extends HTMLElement = HTMLElement>(s: string): E => $app.querySelector<E>(s) as E;
  const err = (e: { code?: string; message?: string }) => {
    const p = $app.querySelector<HTMLElement>('#err');
    if (p) {
      p.hidden = false;
      p.textContent = t('authErr') + (e.code || e.message);
    }
  };
  const dr = $app.querySelector<HTMLElement>('[data-a="dropRx"]');
  if (dr)
    dr.onclick = () => {
      store.clearPendingRx();
      viewAuth();
    };
  q('[data-a="local"]').onclick = () =>
    store.signInLocal(async (u) => {
      state.user = u;
      state.data = await store.loadData();
      render();
    });
  // Nouveau téléphone sans compte : restaurer une sauvegarde complète (profil, séances, journaux) avant tout
  q('[data-a="restore"]').onclick = () => q('#rs-file').click();
  q<HTMLInputElement>('#rs-file').onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void store.signInLocal(async (u) => {
      state.user = u;
      try {
        await store.importData(await f.text(), { replaceProfile: true });
        toast(t('bkRestored'));
      } catch {
        toast(t('bkBad'));
      }
      state.data = await store.loadData();
      render();
    });
  };
  if (!fbOn) return;
  q('[data-a="google"]').onclick = () => void store.signInGoogle().catch(err);
  q('[data-a="emailToggle"]').onclick = () => {
    q('#emailBox').hidden = !q('#emailBox').hidden;
  };
  const em = () => q<HTMLInputElement>('#em').value.trim(),
    pw = () => q<HTMLInputElement>('#pw').value;
  q('[data-a="signin"]').onclick = () => void store.signInEmail(em(), pw(), false).catch(err);
  q('[data-a="signup"]').onclick = () => void store.signInEmail(em(), pw(), true).catch(err);
  q('[data-a="reset"]').onclick = () => {
    if (!em()) return err({ message: t('enterEmailFirst') });
    store
      .resetPassword(em())
      .then(() => toast(t('resetSent'), 4000))
      .catch(err);
  };
}
