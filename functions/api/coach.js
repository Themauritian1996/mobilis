// Cloudflare Pages Function : POST /api/coach
// Garde la clé Gemini secrète côté serveur (variable d'environnement GEMINI_API_KEY dans Cloudflare).
// kind = 'set' (commentaire de fin de série), 'week' (bilan hebdo) ou 'tts' (voix Gemini).

const CORS = {
  'Access-Control-Allow-Origin': '*', // l'APK appelle depuis https://localhost
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const SYS = {
  fr: {
    set: 'Tu es un coach de réadaptation musculo-squelettique, supervisé par un physiatre. Tu parles au patient en français québécois neutre, en 2 phrases maximum (40 mots), ton chaleureux et concret. À partir des données JSON de la série (répétitions complètes, erreurs détectées par la caméra, qualité 0-1, plan filmé), donne UNE correction prioritaire et UN encouragement. Si une image est fournie, base-toi sur la posture visible. Ne pose jamais de diagnostic et ne modifie pas le programme. Si la douleur dépasse la limite, recommande d’alléger ou d’arrêter et d’en parler à son clinicien.',
    week: 'Tu es un coach de réadaptation MSK supervisé par un physiatre. Fais un bilan hebdomadaire en 3 phrases maximum, en français, à partir des données JSON (séances faites/prévues, douleur moyenne, qualité du mouvement, variation de douleur). Souligne un progrès réel, une priorité pour la semaine suivante, sans diagnostic.',
  },
  en: {
    set: 'You are a musculoskeletal rehab coach supervised by a physiatrist. Speak to the patient in plain English, 2 sentences max (40 words), warm and concrete. From the JSON set data (full reps, camera-detected faults, quality 0-1, filmed plane), give ONE priority correction and ONE encouragement. If an image is provided, use the visible posture. Never diagnose or change the program. If pain exceeds the limit, advise easing off or stopping and talking to their clinician.',
    week: 'You are an MSK rehab coach supervised by a physiatrist. Write a weekly review in max 3 sentences from the JSON data (sessions done/planned, mean pain, movement quality, pain change). Highlight one real gain and one priority for next week, no diagnosis.',
  },
};

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY manquante' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const lang = body.lang === 'en' ? 'en' : 'fr';
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };

  if (body.kind === 'tts') {
    const text = String(body.text || '').slice(0, 400);
    const model = env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
    const r = await fetch(`${base}/${model}:generateContent`, {
      method: 'POST', headers,
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: lang === 'fr' ? 'Aoede' : 'Kore' } } } } }),
    });
    if (!r.ok) return json({ error: 'tts ' + r.status }, 502);
    const j = await r.json();
    const audio = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    return json({ audio });
  }

  const kind = body.kind === 'week' ? 'week' : 'set';
  const parts = [{ text: JSON.stringify(body.data || {}).slice(0, 4000) }];
  if (body.image && typeof body.image === 'string' && body.image.length < 400000) parts.push({ inline_data: { mime_type: 'image/jpeg', data: body.image } });
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const r = await fetch(`${base}/${model}:generateContent`, {
    method: 'POST', headers,
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS[lang][kind] }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 200 } }),
  });
  if (!r.ok) return json({ error: 'gemini ' + r.status }, 502);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return json({ text });
}
