// Génère les icônes PWA (192 et 512) depuis le logo SVG avec Chromium (Playwright).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${t}" height="${t}"><rect width="64" height="64" rx="14" fill="#07090F"/><path d="M32 12 14 52h9l3.6-9h10.8l3.6 9h9L32 12Zm0 16 3.8 9.6h-7.6L32 28Z" fill="#3050FF"/></svg>`;
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
for (const t of [192, 512]) {
  const p = await b.newPage({ viewport: { width: t, height: t } });
  await p.setContent(`<body style="margin:0">${svg(t)}</body>`);
  writeFileSync(`public/icon-${t}.png`, await p.screenshot({ omitBackground: false }));
}
await b.close();
