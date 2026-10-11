import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { registerProbe } from './integrations.js';

/** ElevenLabs text-to-speech (optional). Nothing is stored; text features never depend on it. */
const BASE = 'https://api.elevenlabs.io/v1';
export const TTS_MAX_CHARS = 2500;
export const ttsModel = () => config.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

export function isTtsConfigured() {
  return Boolean(config.ELEVENLABS_API_KEY && config.ELEVENLABS_VOICE_ID);
}

let voiceCache: { at: number; name: string | null } | null = null;

async function fetchVoice(): Promise<{ ok: true; name: string } | { ok: false; status: number }> {
  const res = await fetch(`${BASE}/voices/${encodeURIComponent(config.ELEVENLABS_VOICE_ID!)}`, {
    headers: { 'xi-api-key': config.ELEVENLABS_API_KEY! },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const json = (await res.json()) as { name?: string };
  return { ok: true, name: json.name ?? config.ELEVENLABS_VOICE_ID! };
}

/** Streams MP3 for `text`. Provider error bodies never reach the client. */
export async function synthesize(text: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  if (!isTtsConfigured()) {
    throw new AppError(503, 'TTS_NOT_CONFIGURED', 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.');
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(config.ELEVENLABS_VOICE_ID!)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': config.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: ttsModel() }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AppError(502, 'TTS_UNREACHABLE', 'Could not reach ElevenLabs. Try again.');
  }
  if (!res.ok || !res.body) {
    const reason =
      res.status === 401 ? 'ElevenLabs rejected the API key.' :
      res.status === 404 ? 'The configured ElevenLabs voice was not found.' :
      res.status === 422 ? 'ElevenLabs could not process this text.' :
      res.status === 429 ? 'ElevenLabs is rate limiting or the quota is used up.' :
      `ElevenLabs returned HTTP ${res.status}.`;
    throw new AppError(502, 'TTS_ERROR', reason);
  }
  return { body: res.body, contentType: res.headers.get('content-type') ?? 'audio/mpeg' };
}

registerProbe('elevenlabs', async () => {
  const meta = { voiceId: config.ELEVENLABS_VOICE_ID ?? null, modelId: ttsModel(), voiceName: null as string | null };
  if (!config.ELEVENLABS_API_KEY) return { status: 'not_configured', detail: 'ELEVENLABS_API_KEY is not set. Listen / Export audio are disabled.', latencyMs: null, meta };
  if (!config.ELEVENLABS_VOICE_ID) return { status: 'not_configured', detail: 'ELEVENLABS_VOICE_ID is not set.', latencyMs: null, meta };
  const start = performance.now();
  try {
    const v = await fetchVoice();
    const latencyMs = Math.round(performance.now() - start);
    if (!v.ok) {
      const detail = v.status === 401 ? 'API key rejected (401).' : v.status === 404 || v.status === 400 ? `Voice ${config.ELEVENLABS_VOICE_ID} not found.` : `ElevenLabs returned HTTP ${v.status}.`;
      return { status: 'error', detail, latencyMs, meta };
    }
    voiceCache = { at: Date.now(), name: v.name };
    return { status: 'connected', detail: `Voice "${v.name}" · ${ttsModel()}`, latencyMs, meta: { ...meta, voiceName: v.name } };
  } catch {
    return { status: 'error', detail: 'Could not reach ElevenLabs.', latencyMs: null, meta };
  }
});

export const cachedVoiceName = () => voiceCache?.name ?? null;
