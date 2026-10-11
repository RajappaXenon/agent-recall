#!/usr/bin/env node
/**
 * Generates one narration clip per segment in narration.json with ElevenLabs
 * (POST /v1/text-to-speech/{voice_id}, model eleven_multilingual_v2), using the
 * key and voice from the repo's .env. Falls back to Windows SAPI TTS if ElevenLabs
 * is not configured. Writes demo-video/narration/<id>.mp3|wav and durations.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
dotenv.config({ path: resolve(root, '../.env'), quiet: true });
const FFPROBE = process.env.FFPROBE;
if (!FFPROBE) throw new Error('Set FFPROBE to the ffprobe binary');

const script = JSON.parse(readFileSync(resolve(root, 'narration.json'), 'utf8'));
const outDir = resolve(root, 'narration');
mkdirSync(outDir, { recursive: true });

const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.ELEVENLABS_VOICE_ID;
const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const useEleven = Boolean(key && voice);
console.log(useEleven ? `ElevenLabs voice ${voice} · ${model}` : 'ElevenLabs not configured → Windows SAPI');

const durations = {};
const segs = script.segments;
for (let i = 0; i < segs.length; i++) {
  const seg = segs[i];
  let file;
  if (useEleven) {
    file = resolve(outDir, `${seg.id}.mp3`);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: seg.text,
        model_id: model,
        // Continuity hints so the clips sound like one read.
        previous_text: segs[i - 1]?.text,
        next_text: segs[i + 1]?.text,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 1.0 },
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status} for ${seg.id}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  } else {
    file = resolve(outDir, `${seg.id}.wav`);
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 1; $s.SetOutputToWaveFile('${file}'); $s.Speak(@'\n${seg.text}\n'@); $s.Dispose()`;
    execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  }
  const d = Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
  durations[seg.id] = { file: file.replace(root + '\\', '').replace(root + '/', ''), seconds: Math.round(d * 1000) / 1000, words: seg.text.split(/\s+/).length };
  console.log(`  ${seg.id.padEnd(12)} ${d.toFixed(2)} s  (${durations[seg.id].words} words)`);
}
writeFileSync(resolve(outDir, 'durations.json'), JSON.stringify({ engine: useEleven ? `elevenlabs:${model}` : 'windows-sapi', durations }, null, 2));
