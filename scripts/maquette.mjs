// Capture d'une planche de maquette pour comparer avec l'écran construit :
//   node scripts/maquette.mjs Inscription /tmp/inscription.png            (mobile 390×844, planche de design/maquettes/)
//   node scripts/maquette.mjs WebInscription /tmp/web.png 1280 800        (variante PC)
// Les planches de `design/mobile-*/` ne sont pas rendables seules (scripts regroupés) : utiliser leur équivalent de `design/maquettes/`.
import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const [, , nom, sortie = '/tmp/maquette.png', w = '390', h = '844'] = process.argv;
const dossier = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = process.env.CHROMIUM_PATH || readdirSync(dossier).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((v) => join(dossier, v, 'chrome-linux', 'chrome')).find(existsSync);
const fichier = resolve(new URL('../design/maquettes/', import.meta.url).pathname, `${nom}.dc.html`);
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await p.goto('file://' + fichier); await p.waitForTimeout(1500); await p.screenshot({ path: sortie, fullPage: +w >= 900 }); await b.close();
console.log(sortie);
