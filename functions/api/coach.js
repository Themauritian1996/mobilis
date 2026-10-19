// Cloudflare Pages Function : POST /api/coach
// Garde la clé Gemini secrète côté serveur (variable d'environnement GEMINI_API_KEY dans Cloudflare).
// kind = 'set' (commentaire de fin de série), 'week' (bilan hebdo) ou 'tts' (voix Gemini).

const CORS = {
  'Access-Control-Allow-Origin': '*', // l'APK appelle depuis https://localhost
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Consignes en anglais, réponse dans la langue du patient (langLabel envoyé par l'app).
const SYS = {
  set: 'You are a musculoskeletal rehab coach supervised by a physiatrist. Speak directly to the patient, 2 sentences max (40 words), warm and concrete, no jargon. From the JSON set data (full reps, camera-detected faults, quality 0-1, filmed plane), give ONE priority correction and ONE encouragement. If an image is provided, use the visible posture. Never diagnose or change the program. If pain exceeds the limit, advise easing off or stopping and talking to their clinician.',
  week: 'You are an MSK rehab coach supervised by a physiatrist. Write a weekly review for the patient in max 3 sentences from the JSON data (sessions done/planned, mean pain, movement quality, pain change, patient comments). Highlight one real gain and one priority for next week, no diagnosis, no jargon.',
  reply: 'You are an MSK rehab coach supervised by a physiatrist. The patient just finished an exercise and left a comment (JSON: exercise, condition, pain 0-10, pain limit, difficulty 1-5, comment). Answer the comment in max 2 short sentences (35 words): acknowledge it, give one safe practical tip. Never diagnose or change the program. If the comment suggests worsening pain, numbness, weakness, swelling or anything unusual, tell them to ease off and contact their clinician. No jargon.',
};
const LABELS = { fr: 'French (Canada)', en: 'English', es: 'Spanish (Latin America)', pt: 'Portuguese (Brazil)', ar: 'Arabic (Modern Standard)', zh: 'Simplified Chinese (Mandarin)' };

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY manquante' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const label = LABELS[body.lang] || String(body.langLabel || 'French (Canada)').slice(0, 40);
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };

  if (body.kind === 'tts') {
    const text = String(body.text || '').slice(0, 400);
    const model = env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
    const r = await fetch(`${base}/${model}:generateContent`, {
      method: 'POST', headers,
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: body.lang === 'fr' ? 'Aoede' : 'Kore' } } } } }),
    });
    if (!r.ok) return json({ error: 'tts ' + r.status }, 502);
    const j = await r.json();
    const audio = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    return json({ audio });
  }

  if (body.kind === 'transcribe') {
    if (typeof body.audio !== 'string' || body.audio.length > 3000000) return json({ error: 'audio' }, 400);
    const model = env.GEMINI_MODEL || 'gemini-flash-latest';
    const r = await fetch(`${base}/${model}:generateContent`, {
      method: 'POST', headers,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: `Transcribe the patient's spoken comment verbatim. The patient speaks ${label} (they may mix languages). Output only the transcription, no quotes, no notes.` }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: String(body.mime || 'audio/webm').slice(0, 40), data: body.audio } }] }], generationConfig: { temperature: 0, maxOutputTokens: 400 } }),
    });
    if (!r.ok) return json({ error: 'gemini ' + r.status }, 502);
    const j = await r.json();
    return json({ text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim() });
  }

  const kind = ['week', 'reply'].includes(body.kind) ? body.kind : 'set';
  const parts = [{ text: JSON.stringify(body.data || {}).slice(0, 4000) }];
  if (body.image && typeof body.image === 'string' && body.image.length < 400000) parts.push({ inline_data: { mime_type: 'image/jpeg', data: body.image } });
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const r = await fetch(`${base}/${model}:generateContent`, {
    method: 'POST', headers,
    body: JSON.stringify({ systemInstruction: { parts: [{ text: `${SYS[kind]} Always answer in ${label}.` }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 200 } }),
  });
  if (!r.ok) return json({ error: 'gemini ' + r.status }, 502);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return json({ text });
}
