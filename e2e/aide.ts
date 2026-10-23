// Aides communes des tests de bout en bout.
// Horloge : toutes les pages s'ouvrent avec `?maintenant=…` (gardé pour l'onglet par l'application) pour que la démo soit rejouable à l'identique.
import { expect, type Page } from '@playwright/test';

/** Jeudi 23 octobre 2026, 10 h : cinq jours avant la paie du 28. */
export const AUJOURDHUI = '2026-10-23T10:00';
/** Lendemain de la paie de novembre, pour rejouer une paie. */
export const JOUR_DE_PAIE = '2026-11-28T10:00';

/** Espaces insécables et fines des montants (« 86 500 ») ramenés à des espaces simples, pour comparer du texte. */
export const normaliser = (t: string) => t.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
export const corps = async (page: Page) => normaliser(await page.locator('body').innerText());

/** Ouvre une page de l'application à l'heure simulée. */
export async function ouvrir(page: Page, chemin = '/', maintenant = AUJOURDHUI) {
  await page.goto(`${chemin}${chemin.includes('?') ? '&' : '?'}maintenant=${maintenant}`);
}

/** Compte de démonstration d'Aïcha (bouton de la page de bienvenue), arrivée sur l'accueil. */
export async function ouvrirDemo(page: Page, maintenant = AUJOURDHUI) {
  await ouvrir(page, '/bienvenue', maintenant);
  await page.getByRole('button', { name: 'Essayer avec un compte de démonstration' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible();
}

/** Navigation interne sans recharger (comme un clic sur un lien). */
export async function aller(page: Page, chemin: string) {
  await page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')); }, chemin);
  await expect.poll(() => new URL(page.url()).pathname).toBe(chemin.split('?')[0]);
}

/** Saisit des chiffres sur le pavé de l'application. */
export async function pave(page: Page, chiffres: string) {
  for (const d of chiffres) await page.getByRole('button', { name: `Chiffre ${d}`, exact: true }).click();
}

/** Lit l'onglet « solde » de l'accueil, en nombre. */
export async function solde(page: Page): Promise<number> {
  const t = normaliser(await page.getByTestId('solde').innerText());
  return Number(t.replace(/FCFA/, '').replace(/\s/g, ''));
}

/** Dernier état enregistré par l'application (écrit à `pagehide` et, après 150 ms, à chaque changement). */
export async function etatEnregistre(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('assureme.v1') ?? 'null'));
}
export async function attendreEnregistrement(page: Page, condition: (e: any) => boolean) {
  await expect.poll(async () => condition(await etatEnregistre(page))).toBe(true);
}

/** Touche un bouton ou un lien par son nom accessible. */
export const toucher = (page: Page, nom: string | RegExp) =>
  page.getByRole('button', { name: nom }).or(page.getByRole('link', { name: nom })).first().click();

/**
 * Modifie l'état enregistré avant le prochain rendu, puis recharge la page. L'application réécrit son état à `pagehide` :
 * on ne peut donc pas le changer depuis la page ; le script d'initialisation lit le stockage après cette écriture, une seule fois.
 */
let compteurPatchs = 0;
export async function patcherEtat(page: Page, modifier: (etat: any) => void) {
  const drapeau = `e2e-patch-${++compteurPatchs}`;
  await page.addInitScript(({ source, drapeau }) => {
    if (sessionStorage.getItem(drapeau)) return;
    sessionStorage.setItem(drapeau, '1');
    const brut = localStorage.getItem('assureme.v1');
    if (!brut) return;
    const etat = JSON.parse(brut);
    (new Function('etat', `(${source})(etat)`))(etat);
    localStorage.setItem('assureme.v1', JSON.stringify(etat));
  }, { source: modifier.toString(), drapeau });
  await page.reload();
}

/** Motif tolérant : les espaces (y compris insécables ou absents entre deux éléments) valent « zéro ou plus d'espaces ». */
export const contient = (texte: string) => new RegExp(texte.trim().split(/\s+/).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));

/** Aucun défilement horizontal de la page (y compris l'éventuel `overflow` caché d'un élément décoratif qui élargit le document). */
export async function pasDeDebordement(page: Page, contexte = '') {
  const m = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, fenetre: document.documentElement.clientWidth, corps: document.body.scrollWidth }));
  expect(m.document, `${contexte} déborde (${m.document} px > ${m.fenetre} px)`).toBeLessThanOrEqual(m.fenetre);
  expect(m.corps, `${contexte} : le corps déborde`).toBeLessThanOrEqual(m.fenetre);
}

/**
 * Rouvre l'application à une autre date : la session de 5 minutes a expiré, l'écran « Session expirée » attend le code (démo : 482916),
 * puis le moteur de paie rattrape les paies échues.
 */
export async function rouvrirEtDeverrouiller(page: Page, maintenant: string, code = '482916') {
  await ouvrir(page, '/', maintenant);
  await expect(page).toHaveURL(/\/session/);
  await expect(page.getByRole('group', { name: 'Pavé numérique' })).toBeVisible();
  await page.keyboard.type(code);
  await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible({ timeout: 15_000 });
}

/** Écran « Confirmer le paiement » : attend le pavé, tape le code (démo : 482916), attend le reçu. */
export async function confirmerPaiement(page: Page, code = '482916') {
  await expect(page).toHaveURL(/\/pay\/confirme$/);
  await expect(page.getByRole('img', { name: /^0 chiffre saisi sur 6/ })).toBeVisible();
  await page.keyboard.type(code);
  await expect(page).toHaveURL(/\/pay\/confirme\?ref=AM-/);
}
