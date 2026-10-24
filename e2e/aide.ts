// Aide commune des parcours de bout en bout : état injecté avant le chargement (addInitScript), connexion par l'entrée de démonstration (PIN),
// navigation dans l'application sans recharger, lecture du monde persisté, et garde-fou « aucune exception de page, aucun console.error ».
// Le monde de démonstration est fabriqué ici avec le même seed que l'application, à l'heure figée de la page (`?maintenant=`).
process.env.TZ = 'Africa/Douala'; // l'heure figée `2026-11-03T07:00` doit se lire pareil dans Node et dans Chromium (fuseau du navigateur : Africa/Douala)
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { decoder } from '../src/data/codec.ts';
import { etatInitial, PERSONNES } from '../src/data/seed.ts';
import { sceller } from '../src/core/sceau.ts';
import { ACCUEIL } from '../src/domain/acces.ts';
import type { Etat, Monde } from '../src/domain/types.ts';

/** Mardi 3 novembre 2026, 07 h : les départs de 07 h 30 à 09 h sont à venir, ceux d'avant sont partis. */
export const MAINTENANT = '2026-11-03T07:00';
export const CLE = 'afrimove.v1';

/** Test Playwright dont la page échoue à la moindre exception non rattrapée ou au moindre `console.error`. */
export const test = base.extend<{ erreurs: string[] }>({
  erreurs: async ({}, use) => { await use([]); },
  page: async ({ page, erreurs }, use) => {
    page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`console.error : ${m.text()}`); });
    await use(page);
    expect(erreurs, 'aucune exception de page ni console.error').toEqual([]);
  }
});
export { expect };

/** Le monde de démonstration tel que l'application le fabrique à `maintenant` (le seed lit l'horloge de la page : on lui prête un `location` le temps de l'appel). */
export function monde(maintenant = MAINTENANT): Etat {
  const g = globalThis as Record<string, unknown>, avant = { location: g.location, sessionStorage: g.sessionStorage };
  g.location = { search: `?maintenant=${maintenant}` }; g.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  try { return etatInitial(); } finally { g.location = avant.location; g.sessionStorage = avant.sessionStorage; }
}
export const personneDe = (id: string) => PERSONNES.find((p) => p.id === id)!;

export interface Ouverture {
  /** Personne déjà connectée au chargement (ex. `p-aicha`) ; sans elle, l'application démarre déconnectée. */
  connecte?: string;
  maintenant?: string;
  /** Retouche du monde avant injection (ex. un retard, un billet de plus). */
  preparer?: (e: Etat) => void;
  /** Vue du tutoriel déjà faite (par défaut oui pour une personne connectée). */
  vuTuto?: boolean;
}
/** Ouvre `chemin` avec un état injecté (une seule fois par onglet : les rechargements suivants relisent le stockage de l'application). */
export async function ouvrir(page: Page, chemin: string, o: Ouverture = {}): Promise<void> {
  const maintenant = o.maintenant ?? MAINTENANT, e = monde(maintenant);
  if (o.connecte) {
    const p = personneDe(o.connecte);
    Object.assign(e.session, { personneId: p.id, role: p.role, derniereActivite: Date.parse(maintenant), vuTuto: true });
  } else if (o.vuTuto) e.session.vuTuto = true;
  o.preparer?.(e);
  await page.addInitScript(({ cle, valeur }) => {
    try { if (!sessionStorage.getItem('am.injecte')) { localStorage.setItem(cle, valeur); sessionStorage.setItem('am.injecte', '1'); } } catch { /* stockage indisponible */ }
  }, { cle: CLE, valeur: JSON.stringify(e) });
  await page.goto(`${chemin}${chemin.includes('?') ? '&' : '?'}maintenant=${maintenant}`);
}

/** Navigation dans l'application sans recharger (comme un clic sur un lien) : l'état en mémoire est conservé. */
export async function aller(page: Page, chemin: string): Promise<void> {
  await page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')); }, chemin);
}
/** Le chemin courant (sans l'hôte). */
export const chemin = (page: Page) => page.evaluate(() => location.pathname + location.search);

/** Se connecte par l'entrée de démonstration (`/entree`) : la personne, puis son PIN au pavé. La voyageuse entre directement. */
export async function entrerEn(page: Page, personneId: string): Promise<void> {
  const p = personneDe(personneId);
  await aller(page, '/entree');
  if (p.role === 'voyageur') await page.getByRole('button', { name: `Entrer directement comme ${p.prenom}` }).click();
  else {
    await page.getByRole('button', { name: new RegExp(`${p.prenom} ${p.nom}`) }).click();
    const pave = page.getByRole('dialog', { name: `Code PIN de ${p.prenom}` });
    for (const c of p.pin!) await pave.getByRole('button', { name: c, exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${ACCUEIL[p.role].replace(/\//g, '\\/')}$`));
}

/** Le monde persisté : on force l'écriture (comme à la fermeture de la page) puis on relit le stockage. */
export async function lireEtat(page: Page): Promise<Etat> {
  const brut = await page.evaluate((cle) => { dispatchEvent(new Event('pagehide')); return localStorage.getItem(cle); }, CLE);
  if (!brut) throw new Error('aucun état dans le stockage');
  return decoder(brut) as Etat;
}
export const lireMonde = async (page: Page): Promise<Monde> => (await lireEtat(page)).monde;
/** Taille du stockage de l'application (caractères). */
export const tailleStockage = (page: Page) => page.evaluate((cle) => { dispatchEvent(new Event('pagehide')); return (localStorage.getItem(cle) ?? '').length; }, CLE);

/** Aucune barre de défilement horizontale : ni sur la page, ni dans les conteneurs défilants de l'app (`.bd`, `.scr`, cadres), qui masquent le débordement de la page. */
export async function sansDebordement(page: Page): Promise<{ ok: boolean; largeur: number; fenetre: number; fautif?: string }> {
  return page.evaluate(() => {
    const fenetre = innerWidth, conteneurs = [document.documentElement, document.body, ...Array.from(document.querySelectorAll<HTMLElement>('.bd, .scr, .cadre-mobile, .cadre-web, .siege, main'))];
    let largeur = 0, fautif: string | undefined, ok = true;
    for (const c of conteneurs) {
      const l = c === document.documentElement || c === document.body ? Math.max(c.scrollWidth, fenetre) : c.scrollWidth, ref = c === document.documentElement || c === document.body ? fenetre : c.clientWidth;
      largeur = Math.max(largeur, l);
      if (l > ref + 1) {
        ok = false;
        if (!fautif) for (const n of Array.from(c.querySelectorAll<HTMLElement>('*'))) {
          const r = n.getBoundingClientRect(), cr = c.getBoundingClientRect(); if (r.width === 0 || r.right <= cr.right + 1) continue;
          let a = n.parentElement, defile = false; while (a && a !== c) { if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) { defile = true; break; } a = a.parentElement; }
          if (!defile && getComputedStyle(n).position !== 'fixed') { fautif = `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} (${Math.round(r.right)} px)`; break; }
        }
      }
    }
    return { ok, largeur, fenetre, fautif };
  });
}

/** Un siège libre du plan 3D (en partant de la fin pour éviter les premières rangées à supplément). */
export const siegeLibre = (page: Page, depuisLaFin = 0): Locator => page.locator('button.st:not([disabled])').nth(-1 - depuisLaFin);
/** Le pavé numérique d'un écran (PIN, code) : tape les chiffres un par un. */
export async function taper(zone: Locator, chiffres: string): Promise<void> { for (const c of chiffres) await zone.getByRole('button', { name: c, exact: true }).click(); }

/** « 66 000 F » (espaces insécables) → 66000 ; « −1 500 F » → −1500. */
export const nombre = (texte: string | null): number => { const t = texte ?? ''; const n = Number(t.replace(/[^\d]/g, '')); return /^[\s  ]*[−-]/.test(t) ? -n : n; };

/** Met le billet d'Aïcha (b-aicha1) sur un autre départ (resigné) : pour jouer le « jour du voyage » à l'heure figée. */
export function billetAichaSur(e: Etat, departId: string): void {
  const b = e.monde.billets.find((x) => x.id === 'b-aicha1')!, avant = e.monde.departs.find((d) => d.id === b.departId)!, d = e.monde.departs.find((x) => x.id === departId)!;
  avant.prisAilleurs = avant.prisAilleurs.filter((s) => s !== b.siege); d.prisAilleurs = d.prisAilleurs.filter((s) => s !== b.siege);
  b.departId = d.id; b.prix = d.prix; b.sceau = sceller({ code: b.code, departId: d.id, siege: b.siege, nom: b.passager.nom });
  const p = e.monde.paiements.find((x) => x.id === b.paiementId)!; p.montant = d.prix;
}
