// Configuration. Remplis la section firebase pour activer les comptes (Google + courriel).
// Sans configuration Firebase, l'app fonctionne en « mode local » (données sur l'appareil).
export const CONFIG = {
  appName: 'Mobilis',

  // 1) Firebase (console.firebase.google.com → Paramètres du projet → Vos applications → Web)
  firebase: {
    // Clés web publiques par conception : la sécurité vient des règles Firestore (firestore.rules)
    apiKey: 'AIzaSyBRkSq7rvZyhTbBB858u3quzDdg_R_k81g',
    authDomain: 'mobilis-6828b.firebaseapp.com',
    projectId: 'mobilis-6828b',
    appId: '1:661952244751:web:570268f53abdb0c8d6477a',
  },

  // 2) Coach vocal Gemini
  //   - Site web sur Cloudflare Pages : laisse '/api/coach' (la clé reste secrète côté serveur).
  //   - APK : l'app appelle automatiquement siteUrl + coachEndpoint.
  //   - Ou chaque utilisateur peut entrer sa propre clé Gemini dans Profil → Coach IA.
  siteUrl: 'https://themauritian1996.github.io/mobilis',
  // Vide = pas de serveur (GitHub Pages) : le coach utilise la clé Gemini entrée dans Profil.
  // Avec Cloudflare Pages, mettre '/api/coach' (la fonction functions/api/coach.js garde la clé secrète).
  coachEndpoint: '',
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
  return native && CONFIG.coachEndpoint && CONFIG.coachEndpoint.startsWith('/') ? CONFIG.siteUrl + CONFIG.coachEndpoint : CONFIG.coachEndpoint;
};
