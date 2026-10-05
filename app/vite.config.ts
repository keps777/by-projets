import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../supabase/functions/_shared/core', import.meta.url));

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Luther Life',
        short_name: 'Luther Life',
        description: 'Diviser ma vie en plusieurs projets.',
        lang: 'fr-CA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E0F13',
        theme_color: '#0E0F13',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'] }
    })
  ],
  resolve: { alias: { '@core': core } },
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['src/**/*.test.ts', '../supabase/functions/_shared/core/**/*.test.ts'],
    environment: 'node'
  }
});
