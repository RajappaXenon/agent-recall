#!/usr/bin/env node
/**
 * Assembles demo-video/agent-recall-demo.mp4 (exactly 60 s, 1920×1080, 30 fps):
 *   0–4 s title card · 4–56 s real UI recording · 56–60 s outro card
 * with ElevenLabs narration placed at each scene's start (or at a recorded action marker), burned-in captions (ASS),
 * and a quiet synthesized pad as background music, ducked under the voice.
 *
 * Env: FFMPEG, FFPROBE (binaries). Args: <framesDir>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const FFMPEG = process.env.FFMPEG;
const framesDir = resolve(process.argv[2]);
if (!FFMPEG) throw new Error('Set FFMPEG');
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

const FPS = 30;
const TITLE = 4;
const APP = 52;
const OUTRO = 4;
const TOTAL = TITLE + APP + OUTRO; // 60
const NARRATION_LEAD = 0.4; // narration starts this long after each scene begins

const work = resolve(root, 'build');
mkdirSync(work, { recursive: true });
const timeline = JSON.parse(readFileSync(resolve(root, 'recording/timeline.json'), 'utf8'));
const script = JSON.parse(readFileSync(resolve(root, 'narration.json'), 'utf8'));
const durations = JSON.parse(readFileSync(resolve(root, 'narration/durations.json'), 'utf8')).durations;

// ── 1. App recording: variable-rate screencast frames → constant 30 fps, exactly 52 s ──
const frames = timeline.frames.filter((f) => f.t < APP);
let concat = 'ffconcat version 1.0\n';
for (let i = 0; i < frames.length; i++) {
  const start = i === 0 ? 0 : frames[i].t;
  const end = i + 1 < frames.length ? frames[i + 1].t : APP;
  const dur = Math.max(0.001, end - start);
  concat += `file '${resolve(framesDir, frames[i].file).replace(/\\/g, '/')}'\nduration ${dur.toFixed(4)}\n`;
}
concat += `file '${resolve(framesDir, frames[frames.length - 1].file).replace(/\\/g, '/')}'\n`;
writeFileSync(resolve(work, 'frames.ffconcat'), concat);
ff(['-f', 'concat', '-safe', '0', '-i', resolve(work, 'frames.ffconcat'), '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.35`, '-frames:v', String(APP * FPS), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', resolve(work, 'app.mp4')]);
copyFileSync(resolve(work, 'app.mp4'), resolve(root, 'recording/app-recording.mp4'));

// ── 2. Title and outro cards ──
ff(['-loop', '1', '-framerate', String(FPS), '-i', resolve(root, 'cards/title.png'), '-vf', `format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${TITLE - 0.35}:d=0.35`, '-frames:v', String(TITLE * FPS), '-c:v', 'libx264', '-crf', '14', resolve(work, 'title.mp4')]);
ff(['-loop', '1', '-framerate', String(FPS), '-i', resolve(root, 'cards/outro.png'), '-vf', `format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${OUTRO - 0.7}:d=0.7`, '-frames:v', String(OUTRO * FPS), '-c:v', 'libx264', '-crf', '14', resolve(work, 'outro.mp4')]);

// ── 3. Narration placement (absolute seconds on the 60 s timeline) ──
// Each scene's clip starts NARRATION_LEAD after the scene begins. A segment with
// alignSecondSentenceTo is cut at the pause after its first sentence, and the rest
// starts at that recorded marker (e.g. the moment Run all is clicked). Later clips
// move back if needed so no two clips overlap.
const silences = (file) => {
  const log = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.15', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((st, i) => ({ start: st, end: ends[i] ?? st })).filter((x) => x.end > x.start);
};
const sentencesOf = (text) => text.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [text];
const placements = [];
for (const sc of timeline.scenes) {
  const seg = script.segments.find((x) => x.id === sc.id);
  const file = resolve(root, durations[sc.id].file);
  const d = durations[sc.id].seconds;
  const anchor = seg.alignTo && timeline.marks?.[seg.alignTo];
  const at = anchor ? Math.max(TITLE + sc.slotStart + NARRATION_LEAD, TITLE + anchor + 0.15) : TITLE + sc.slotStart + NARRATION_LEAD;
  const marker = seg.alignSecondSentenceTo && timeline.marks?.[seg.alignSecondSentenceTo];
  if (!marker) {
    placements.push({ id: sc.id, file, from: 0, d, at, text: seg.text, sceneEnd: TITLE + sc.slotEnd });
    continue;
  }
  const [first, ...rest] = sentencesOf(seg.text);
  const estimate = (first.length / seg.text.length) * d;
  const gap = silences(file).sort((x, y) => Math.abs((x.start + x.end) / 2 - estimate) - Math.abs((y.start + y.end) / 2 - estimate))[0];
  if (!gap) throw new Error(`no pause found in ${sc.id}`);
  const cut = (gap.start + gap.end) / 2;
  placements.push({ id: sc.id, file, from: 0, d: cut, at, text: first, sceneEnd: TITLE + sc.slotEnd });
  placements.push({ id: `${sc.id}:2`, file, from: cut, d: d - cut, at: TITLE + marker + 0.15, text: rest.join(' '), sceneEnd: TITLE + APP });
}
placements.push({ id: 'outro', file: resolve(root, durations.outro.file), from: 0, d: durations.outro.seconds, at: TITLE + APP, text: null, sceneEnd: TOTAL });
for (let i = 1; i < placements.length; i++) {
  const prev = placements[i - 1];
  placements[i].at = Math.max(placements[i].at, prev.at + prev.d + 0.3);
}
for (const p of placements) {
  p.at = Number(p.at.toFixed(3));
  if (p.at + p.d > p.sceneEnd + 0.05) throw new Error(`${p.id} narration ends at ${(p.at + p.d).toFixed(2)} s, past its scene (${p.sceneEnd} s)`);
}

// ── 4. Captions: sentence-sized cues timed by character share within each clip ──
const fmtSrt = (t) => {
  const ms = Math.round(t * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};
const fmtAss = (t) => {
  const cs = Math.round(t * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const cues = [];
for (const p of placements) {
  if (p.text === null) continue; // the outro card already shows the same words
  const text = p.text;
  const d = p.d;
  // Split into sentences, then wrap long sentences at a comma/colon near the middle.
  const parts = sentencesOf(text);
  const chunks = parts.flatMap((sent) => {
    if (sent.length <= 70) return [sent];
    const mid = sent.length / 2;
    const cut = [...sent.matchAll(/[,:]\s/g)].map((m) => m.index + 1).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    return cut ? [sent.slice(0, cut).trim(), sent.slice(cut).trim()] : [sent];
  });
  const total = chunks.reduce((s, c) => s + c.length, 0);
  let t = p.at;
  for (const c of chunks) {
    const len = (c.length / total) * d;
    cues.push({ start: t, end: t + len, text: c });
    t += len;
  }
}
const wrap = (s, max = 58) => {
  if (s.length <= max) return [s];
  const words = s.split(' ');
  let best = 0;
  let bestDiff = Infinity;
  let acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += words[i].length + 1;
    const diff = Math.abs(acc - s.length / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i + 1;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
};
writeFileSync(resolve(root, 'captions.srt'), cues.map((c, i) => `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${wrap(c.text).join('\n')}\n`).join('\n'));
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Geist SemiBold,44,&H00F0EAE8,&H00F0EAE8,&H3812100B,&H3812100B,0,0,0,0,100,100,0,0,3,16,0,2,120,120,64,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.map((c) => `Dialogue: 0,${fmtAss(c.start)},${fmtAss(c.end)},Caption,,0,0,0,,${wrap(c.text).join('\\N')}`).join('\n')}
`;
writeFileSync(resolve(work, 'captions.ass'), ass);

// ── 5. Audio: narration at its placements + quiet synthesized pad, ducked under the voice ──
const narrInputs = placements.flatMap((p) => ['-i', p.file]);
const delays = placements
  .map((p, i) => `[${i}:a]atrim=start=${p.from.toFixed(3)}:duration=${p.d.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[n${i}]`)
  .join(';');
const narrMix = `${placements.map((_, i) => `[n${i}]`).join('')}amix=inputs=${placements.length}:normalize=0:duration=longest,apad=whole_dur=${TOTAL},atrim=0:${TOTAL}[voice]`;
// Am – F – C – G pad (8 s per chord), soft sines; generated, no third-party audio.
// Kept above ~200 Hz (low sines buzz on laptop speakers) and crossfaded with raised-cosine
// envelopes that sum to 1, so chord changes have no hard edges.
const chord = (f) => f.map((hz, i) => `${(0.05 - i * 0.01).toFixed(3)}*sin(2*PI*${hz}*t)`).join('+');
const prog = [[220.0, 261.63, 329.63, 440.0], [220.0, 261.63, 349.23, 440.0], [261.63, 329.63, 392.0, 523.25], [246.94, 293.66, 392.0, 493.88]];
const env = (i) => {
  const x = `(mod(t-${i * 8 + 4}+16,32)-16)`;
  return `lt(abs(${x}),8)*pow(cos(PI*${x}/16),2)`;
};
const expr = prog.map((c, i) => `${env(i)}*(${chord(c)})`).join('+');
const music = `aevalsrc='${expr}':s=48000:d=${TOTAL},aformat=channel_layouts=stereo,highpass=f=180,lowpass=f=1600,volume=0.22,afade=t=in:d=2.5,afade=t=out:st=${TOTAL - 3}:d=3[pad]`;
// Gentle, slow ducking: fast gain changes on a sustained tone are heard as a flutter.
const mix = `${delays};${narrMix};[voice]asplit=2[v1][key];${music};[pad][key]sidechaincompress=threshold=0.03:ratio=2.5:attack=250:release=1500:knee=6[duck];[v1][duck]amix=inputs=2:normalize=0:duration=first,atrim=0:${TOTAL}[aout]`;
ff([...narrInputs, '-filter_complex', mix, '-map', '[aout]', '-c:a', 'pcm_s16le', '-ar', '48000', resolve(work, 'audio-raw.wav')]);
// Static gain to -16 LUFS (dynamic loudnorm would pump the music-only title up to speech level).
// ffmpeg prints the meter summary on stderr.
const measured = spawnSync(FFMPEG, ['-hide_banner', '-i', resolve(work, 'audio-raw.wav'), '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(measured)?.[1]);
if (!Number.isFinite(integrated)) throw new Error('Could not measure loudness');
const gainDb = -16 - integrated;
ff(['-i', resolve(work, 'audio-raw.wav'), '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=0.84:level=false`, '-c:a', 'pcm_s16le', '-ar', '48000', resolve(work, 'audio.wav')]);
console.log(`audio: measured ${integrated} LUFS, applied ${gainDb.toFixed(2)} dB static gain`);
ff(['-f', 'lavfi', '-i', music.replace(/\[pad\]$/, ''), '-t', String(TOTAL), '-c:a', 'pcm_s16le', resolve(root, 'music-bed.wav')]);

// ── 6. Final: concat video, burn captions, mux audio, exactly 60 s ──
const fontsDir = resolve(root, '../node_modules/geist/dist/fonts/geist-sans').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
const assPath = resolve(work, 'captions.ass').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
ff([
  '-i', resolve(work, 'title.mp4'), '-i', resolve(work, 'app.mp4'), '-i', resolve(work, 'outro.mp4'), '-i', resolve(work, 'audio.wav'),
  '-filter_complex', `[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[v]ass='${assPath}':fontsdir='${fontsDir}',format=yuv420p[vout]`,
  '-map', '[vout]', '-map', '3:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-r', String(FPS), '-frames:v', String(TOTAL * FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-t', String(TOTAL), '-movflags', '+faststart',
  resolve(root, 'agent-recall-demo.mp4'),
]);
writeFileSync(resolve(root, 'build/placements.json'), JSON.stringify({ placements: placements.map(({ file, sceneEnd, ...p }) => p), cues: cues.length }, null, 2));
console.log('built demo-video/agent-recall-demo.mp4');
