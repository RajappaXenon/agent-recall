# Agent Recall: 60-second demo video

`agent-recall-demo.mp4` is 60.000 s long: 1920×1080 at 30 fps, H.264 video, AAC 48 kHz stereo audio, −16 LUFS. It shows the real app, recorded with Playwright against the live MongoDB Atlas cluster. No screen is mocked.

| Time | What is on screen | Narration |
|---|---|---|
| 0–4 s | Title card | music only |
| 4–14 s | Memory Explorer: open the past incident "Checkout API timed out after connection pool change" | "Agent Recall gives AI agents a memory…" |
| 14–26.5 s | Search Playground: type a differently worded problem, Run all, then keyword / semantic / hybrid columns | "Now a new problem, worded differently." Then, at the Run all click: "One click runs…" |
| 26.5–37 s | Tick two hybrid results, Use in agent task, grounded answer with citations (Groq · openai/gpt-oss-120b) | "Pick the most relevant memories…" |
| 37–45.5 s | Did this work? → Worked + Helpful + note, Record outcome; the new memory becomes Searchable | "The fix worked, so we record the outcome…" |
| 45.5–56 s | Memory Explorer, full page reload; the new memory is still at the top; Provenance tab | at the reload: "After a full page reload…" |
| 56–60 s | Closing card | "Agent Recall. Give AI agents a memory worth remembering." |

## Files

- `narration.json`: the script, one segment per scene, plus the search query used.
  - `alignTo` / `alignSecondSentenceTo` name the recorder markers that the narration is aligned to.
- `narration/*.mp3`, `narration/durations.json`: ElevenLabs voice-over (model `eleven_multilingual_v2`, voice from `.env`).
- `captions.srt`: the captions that are burned into the video.
- `recording/app-recording.mp4`: the 52 s app recording on its own, without captions or audio.
- `recording/timeline.json`:
  - per-scene timings and action markers;
  - the frame timestamps;
  - the browser console errors captured during recording (0).
- `cards/card.html`: the title and outro cards; `cards/*.png` are their 1920×1080 renders.
- `scripts/tts.mjs`: generates the narration, using ElevenLabs if configured and falling back to Windows SAPI.
- `scripts/record.mjs`: drives the UI and captures frames with the Chrome DevTools screencast.
  - The recorder injects a pointer overlay into its own browser context so viewers can follow the clicks. The app code is unchanged.
- `scripts/build.mjs`: the FFmpeg assembly.
  - Builds the cards and the 30 fps app track.
  - Splits a clip at its natural pause when it is aligned to a marker.
  - Burns in ASS captions in Geist.
  - Adds a synthesized pad as background music, ducked under the voice.
  - Applies a static loudness gain.
  - Writes the 60 s file with `+faststart`.
- `build/` and `music-bed.wav` are intermediates (gitignored). The build regenerates them.

## Reproduce

These steps need FFmpeg and ffprobe. Here they came from the `ffmpeg-static` and `ffprobe-static` npm packages, installed outside the repo.

```bash
npm run dev                      # API on :4000, web on :5173
npm run worker:supervised -w backend
npm run demo:reset -w backend    # clean demo org (the recording adds an outcome memory)

export FFMPEG=/path/to/ffmpeg FFPROBE=/path/to/ffprobe
node demo-video/scripts/tts.mjs                      # only if narration.json changed
node demo-video/scripts/record.mjs /tmp/agent-recall-frames
node demo-video/scripts/build.mjs  /tmp/agent-recall-frames
npm run demo:reset -w backend
```

`record.mjs` logs every scene's slot and the time its actions finished. `build.mjs` fails if any narration clip would run past its scene or past 60 s.

## Known display quirk (not changed for the video)

The memory created from an outcome stores the answer text as written, so Markdown such as `**Resize the pool**` shows literally in that memory's Content tab. The grounded answer panel itself renders it correctly.
