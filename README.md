# Guitar Trainer

A guitar play-along trainer built as an **offline-first PWA**. Pick a song, press play, and always know exactly what your fretting hand and strumming hand should be doing — the current chord on one panel, an animated strumming pattern on the other, in time with a metronome.

No backend, no accounts, no ads. Preset content ships with the app; everything you create is stored locally in your browser (IndexedDB) and can be exported/imported as JSON.

## Running it

```bash
npm install
npm run dev          # dev server on http://localhost:5173
npm run dev -- --host   # also expose on the LAN (for testing on your phone)
```

> **Note:** the source can't be served by a plain web server (Apache/nginx/IIS pointing at
> the project root will serve `.ts` files with the wrong MIME type). Use the Vite dev
> server, or build and serve `dist/`.

## Building / deploying

```bash
npm run build        # type-checks then outputs static files + service worker to dist/
npm run preview      # serve the production build locally
```

`dist/` is fully static — host it on anything (any web server, GitHub Pages, Netlify…).
Once visited over HTTPS (or localhost), the app installs to the home screen and works
completely offline.

**Live instance:** https://sambenne.github.io/guitar-trainer/

```bash
npm run deploy       # build with the /guitar-trainer/ base and push to gh-pages
```

Local IIS note: the `guitar-trainer.local` site should point at `dist/` (built with the
default `/` base). A `web.config` ships in `dist/` with the MIME types IIS needs.

## Testing

```bash
npm test             # vitest: timeline compiler + import/export validation
```

## How it's put together

- **Vanilla TypeScript + Vite** — no UI framework. Pages render straight to the DOM;
  the two music visuals (chord diagram, strum display) are SVG components.
- **Timing** ([src/audio/](src/audio/)) — a lookahead scheduler on the Web Audio clock
  ("A Tale of Two Clocks" pattern). `timeline.ts` compiles a song into a flat list of
  steps in *beat* units; BPM only converts beats→seconds at schedule time, so tempo
  changes mid-play are safe. The UI reads playback position via `requestAnimationFrame`
  and never drives timing itself. Metronome clicks are synthesized oscillators — no
  audio samples to cache.
- **Strum display** ([src/components/strum-display.ts](src/components/strum-display.ts)) —
  the pick indicator moves continuously, sweeping the strings each grid step, ghosted
  on `-` steps: the hand never stops, you just skip strokes. Low E renders at the top by
  default so downstrokes move down the screen (flippable in Settings).
- **Storage** ([src/storage/](src/storage/)) — bundled presets (read-only) merged with
  user records from IndexedDB behind one async repo API. Presets are "duplicate and edit".
- **Import/export** ([src/storage/transfer.ts](src/storage/transfer.ts)) — versioned JSON
  backups; single-song exports bundle the custom chords/patterns they reference; imports
  are validated and re-ID'd on collision.

## Credits

Chord sounds use the [FSS Steel-String Acoustic Guitar](https://freepats.zenvoid.org/Guitar/steel-acoustic-guitar.html)
samples from the FreePats project (GPLv3+ with sampling exception) — trimmed and
downsampled copies live in [public/samples/](public/samples/), full attribution in
`FREEPATS-README.txt` there. Playback pitch-shifts the nearest sample per string
([src/audio/sampler.ts](src/audio/sampler.ts)).

## Data model

Songs are sections → bars, one chord + one strumming pattern per bar (MVP constraint).
Patterns are `D` / `U` / `-` steps on an 8th- or 16th-note grid (`stepsPerBeat: 2 | 4`, defaulting to 2) plus a per-pattern string mask. Bars in one song may mix resolutions.
Chords are six string states (`open` / `muted` / `fretted`) with optional finger numbers
and a starting fret.
