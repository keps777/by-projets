// Génère les icônes PWA (192 et 512) depuis le logo SVG avec Chromium (Playwright).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="${t}" height="${t}"><rect width="72" height="72" rx="22" fill="#0A0E1C"/><circle cx="36" cy="36" r="22" fill="none" stroke="#8B7CFF" stroke-width="3" stroke-dasharray="6 5"/><path d="M36 20 L48 50 L41 50 L36 36 L31 50 L24 50 Z" fill="#3DE0FF"/><circle cx="55" cy="22" r="4" fill="#FF5BDE"/></svg>`;
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
for (const t of [192, 512]) {
  const p = await b.newPage({ viewport: { width: t, height: t } });
  await p.setContent(`<body style="margin:0">${svg(t)}</body>`);
  writeFileSync(`public/icon-${t}.png`, await p.screenshot({ omitBackground: false }));
}
await b.close();
