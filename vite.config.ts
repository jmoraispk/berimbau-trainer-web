import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // includeAssets controls which static files in public/ get
      // precached by the service worker. The previous list referenced
      // 'favicon.svg' which doesn't exist (the source is 'icon.svg');
      // browsers fell back to whatever was cached from an earlier
      // deploy, which is why the deployed site sometimes showed a
      // different / stale favicon than localhost.
      includeAssets: [
        'icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Berimbau Pro',
        short_name: 'Berimbau',
        description: 'Rhythm-accuracy trainer for the berimbau.',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          // SVG first so browsers/PWA installers that prefer vectors
          // pick it up before the PNGs.
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(projectRoot, 'src') },
  },
  server: {
    // Bind to all interfaces so LAN / Tailscale can reach the dev server.
    host: true,
    // Vite 8 rejects unknown Host headers in dev. Tailscale Serve forwards
    // requests with the *.ts.net hostname; allow any host so dev-mode
    // testing on the phone (via tailscale serve) just works.
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
