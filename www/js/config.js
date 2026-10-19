// Configuration. Remplis la section firebase pour activer les comptes (Google + courriel).
// Sans configuration Firebase, l'app fonctionne en « mode local » (données sur l'appareil).
export const CONFIG = {
  appName: 'Mobilis',

  // 1) Firebase (console.firebase.google.com → Paramètres du projet → Vos applications → Web)
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },

  // 2) Coach vocal Gemini
  //   - Site web sur Cloudflare Pages : laisse '/api/coach' (la clé reste secrète côté serveur).
  //   - APK : l'app appelle automatiquement siteUrl + coachEndpoint.
  //   - Ou chaque utilisateur peut entrer sa propre clé Gemini dans Profil → Coach IA.
  siteUrl: '', // adresse du site Cloudflare, ex. 'https://mobilis.pages.dev'
  coachEndpoint: '/api/coach',
  geminiModel: 'gemini-flash-latest',
  geminiTtsModel: 'gemini-2.5-flash-preview-tts',

  // 3) Vision (MediaPipe, Google) — exécutée sur l'appareil, la vidéo ne quitte jamais le téléphone
  mediapipeBase: new URL('../vendor/mediapipe', import.meta.url).href, // inclus dans l'app (fonctionne hors ligne)
  poseModelLocal: new URL('../models/pose_landmarker_lite.task', import.meta.url).href, // téléchargé à la compilation
  poseModelRemote: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
};

export const firebaseEnabled = () => !!(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);

// Dans l'APK (Capacitor), le site n'est pas servi par Cloudflare : on appelle le site en ligne.
export const coachUrl = () => {
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  return native && CONFIG.coachEndpoint.startsWith('/') ? CONFIG.siteUrl + CONFIG.coachEndpoint : CONFIG.coachEndpoint;
};
