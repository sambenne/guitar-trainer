import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// '/' for local/IIS hosting at the domain root; the GitHub Pages workflow
// sets DEPLOY_BASE=/guitar-trainer/ so the app works under the repo subpath.
const base = process.env.DEPLOY_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Guitar Trainer',
        short_name: 'Guitar',
        description: 'Guitar play-along trainer: chords and animated strumming in time with a metronome.',
        theme_color: '#0d0d0f',
        background_color: '#0d0d0f',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,wav}'],
      },
    }),
  ],
});
