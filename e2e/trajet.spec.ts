// Fenêtre « Où vas-tu ? » : se déroule depuis la ligne de trajet de l'accueil (jamais une autre page), carte du Cameroun en 3D, arc vers l'arrivée, barre Départ → Arrivée · Date.
// Horloge figée au mardi 3 novembre 2026, 07 h : « demain » = mer. 4 novembre. Les animations infinies sont figées par l'automatisation (navigator.webdriver).
import type { Page } from '@playwright/test';
import { expect, lireEtat, ouvrir, test } from './aide';
import type { Recherche } from '../src/apps/voyager/etat.ts';

/** À passer à `true` quand `Accueil.svelte` appelle `SelecteurTrajet` (branchement fait par l'agent « shell »). */
const BRANCHE = false;
const cas = BRANCHE ? test : test.fixme;

const ligne = (page: Page) => page.getByText('Yaoundé → Douala', { exact: true }).first();
const fenetre = (page: Page) => page.getByRole('dialog', { name: 'Où vas-tu ?' });
const rangee = (page: Page, ville: string) => fenetre(page).locator(`.vil[data-ville="${ville}"]`);
const recherche = async (page: Page) => (await lireEtat(page)).tranches.recherche as Recherche;
async function ouvrirFenetre(page: Page, o: Parameters<typeof ouvrir>[2] = {}) {
  await ouvrir(page, '/', { connecte: 'p-aicha', ...o });
  await expect(page.locator('.hd .pl')).toContainText('départ');
  await ligne(page).click();
  await expect(fenetre(page)).toBeVisible();
}

cas('la ligne de trajet déroule la fenêtre sur la même page : titre, carte 3D, étoile au départ, propositions', async ({ page }) => {
  await ouvrirFenetre(page);
  await expect(page).toHaveURL(/\/\?maintenant=/);
  await expect(fenetre(page).getByRole('heading', { name: 'Où vas-tu ?' })).toBeVisible();
  await expect(fenetre(page).getByRole('group', { name: /Carte du Cameroun en relief/ })).toBeVisible();
  await expect(fenetre(page).locator('.vp[data-etat="depart"]')).toHaveAttribute('data-ville', 'Yaoundé');
  await expect(fenetre(page).locator('.vp[data-etat="depart"]')).toContainText('tu es ici');
  expect(await fenetre(page).locator('.vp').count()).toBeGreaterThanOrEqual(14);
  await expect(fenetre(page).locator('.vp[data-ville="Garoua"]')).toHaveAttribute('data-etat', 'grisee');
  await expect(fenetre(page).locator('.vp[data-ville="Douala"]')).toHaveAttribute('data-etat', 'choisie');
  await expect(fenetre(page).locator('.vil')).toHaveCount(3);
  await expect(rangee(page, 'Douala')).toContainText('5 compagnies');
  await expect(rangee(page, 'Douala')).toContainText('dès 5 000 F');
  await expect(rangee(page, 'Douala')).toContainText('3 h 15');
  // la barre Départ → Arrivée · Date
  await expect(fenetre(page).locator('[data-carte="depart"]')).toContainText('Yaoundé');
  await expect(fenetre(page).locator('[data-carte="arrivee"]')).toContainText('Douala');
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('mer. 4 nov.');
});

cas('toucher une ville la choisit : l’arc se trace vers elle, la ligne d’info la décrit (aria-live)', async ({ page }) => {
  await ouvrirFenetre(page);
  const info = fenetre(page).locator('p.info');
  await expect(info).toHaveAttribute('aria-live', 'polite');
  await expect(info).toHaveText('Pour aller à Douala : 5 compagnies · dès 5 000 F · 3 h 15');
  const arcDouala = await fenetre(page).locator('.pont .trace:not(.halo)').getAttribute('d');
  await rangee(page, 'Bamenda').click();
  await expect(rangee(page, 'Bamenda')).toHaveAttribute('aria-pressed', 'true');
  await expect(rangee(page, 'Douala')).toHaveAttribute('aria-pressed', 'false');
  await expect(info).toHaveText('Pour aller à Bamenda : 1 compagnie · dès 7 000 F · 7 h 00');
  await expect(fenetre(page).locator('.pont')).toHaveCount(1); // l'arc est retracé : un seul pont, vers la nouvelle ville
  const arcBamenda = await fenetre(page).locator('.pont .trace:not(.halo)').getAttribute('d');
  expect(arcBamenda).not.toBe(arcDouala);
  await expect(fenetre(page).locator('.vp[data-ville="Bamenda"]')).toHaveAttribute('data-etat', 'choisie');
  await expect(fenetre(page).getByRole('button', { name: 'Voir les départs · Bamenda' })).toBeEnabled();
  // l'arc part bien du départ : son premier point est sur l'étoile
  const [x0, y0] = (arcBamenda!.match(/^M([\d.-]+) ([\d.-]+)/) ?? []).slice(1).map(Number);
  const svg = (await fenetre(page).locator('.carte > svg').boundingBox())!, etoile = (await fenetre(page).locator('.vp[data-etat="depart"] .etoile').boundingBox())!;
  expect(Math.abs(svg.x + (x0 / 370) * svg.width - (etoile.x + etoile.width / 2))).toBeLessThan(14); expect(Math.abs(svg.y + (y0 / 330) * svg.height - (etoile.y + etoile.height / 2))).toBeLessThan(14);
  // toucher un point de la carte revient au même
  await fenetre(page).locator('.vp[data-ville="Bafoussam"]').click();
  await expect(info).toHaveText('Pour aller à Bafoussam : 1 compagnie · dès 5 000 F · 4 h 00');
});

cas('second geste : le bouton « Voir les départs » ferme la fenêtre, revient à l’accueil et met la recherche à jour', async ({ page }) => {
  await ouvrirFenetre(page);
  await rangee(page, 'Bamenda').click();
  await fenetre(page).getByRole('button', { name: 'Voir les départs · Bamenda' }).click();
  await expect(fenetre(page)).toBeHidden();
  await expect(page).toHaveURL(/\/\?maintenant=/);
  await expect(page.getByText('Yaoundé → Bamenda', { exact: true }).first()).toBeVisible();
  const r = await recherche(page);
  expect(r).toMatchObject({ de: 'Yaoundé', vers: 'Bamenda', jour: '2026-11-04', heureCible: null });
});

cas('second geste : retoucher la ville déjà choisie valide aussi', async ({ page }) => {
  await ouvrirFenetre(page);
  await rangee(page, 'Bafoussam').click();
  await expect(fenetre(page)).toBeVisible(); // un seul toucher ne ferme pas
  await rangee(page, 'Bafoussam').click();
  await expect(fenetre(page)).toBeHidden();
  expect(await recherche(page)).toMatchObject({ de: 'Yaoundé', vers: 'Bafoussam' });
});

cas('Échap, bouton fermer et voile ferment sans toucher à la recherche ; le focus revient à la ligne', async ({ page }) => {
  await ouvrirFenetre(page);
  await rangee(page, 'Bamenda').click();
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toBeHidden();
  await expect(page.locator('.gl.hl').first().locator(':focus')).toHaveCount(1); // le focus est revenu sur la ligne de trajet
  expect((await recherche(page)).vers).toBe('Douala');
  await ligne(page).click(); await expect(fenetre(page)).toBeVisible();
  await fenetre(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(fenetre(page)).toBeHidden();
  await ligne(page).click(); await expect(fenetre(page)).toBeVisible();
  await page.mouse.click(195, 40); // le voile, au-dessus de la fenêtre
  await expect(fenetre(page)).toBeHidden();
  expect(await recherche(page)).toMatchObject({ de: 'Yaoundé', vers: 'Douala' });
});

cas('clavier complet : les flèches parcourent les villes, Entrée valide, le focus reste dans la fenêtre', async ({ page }) => {
  await ouvrirFenetre(page);
  await expect(rangee(page, 'Douala')).toBeFocused(); // focus initial sur la ville choisie
  await page.keyboard.press('ArrowDown');
  await expect(rangee(page, 'Bafoussam')).toBeFocused(); await expect(rangee(page, 'Bafoussam')).toHaveAttribute('aria-pressed', 'true');
  await expect(fenetre(page).locator('p.info')).toContainText('Pour aller à Bafoussam');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); // Bamenda, puis retour à Douala (boucle)
  await expect(rangee(page, 'Douala')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(rangee(page, 'Bamenda')).toBeFocused();
  // piège de focus : Tab fait le tour sans sortir de la fenêtre
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Shift+Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  await rangee(page, 'Bamenda').focus(); await page.keyboard.press('Enter');
  await expect(fenetre(page)).toBeHidden();
  expect(await recherche(page)).toMatchObject({ vers: 'Bamenda' });
});

cas('la barre : changer de ville de départ, grisées sans ligne, échangeur ⇅', async ({ page }) => {
  await ouvrirFenetre(page);
  // aucune ligne pour la paire : message + villes desservies, pas de validation
  await fenetre(page).locator('.vp[data-ville="Garoua"]').click();
  await expect(fenetre(page).locator('p.info')).toHaveText('Pas encore de ligne Yaoundé → Garoua. Villes desservies depuis Yaoundé : Douala, Bafoussam, Bamenda.');
  await expect(fenetre(page).locator('.pont')).toHaveCount(0);
  await expect(fenetre(page).getByRole('button', { name: 'Choisis une ville d’arrivée' })).toBeDisabled();
  // départ seul : on change de ville de départ, l'étoile suit
  await fenetre(page).locator('[data-carte="depart"]').click();
  await fenetre(page).getByRole('group', { name: 'Ville de départ' }).getByRole('button', { name: 'Douala', exact: true }).click();
  await expect(fenetre(page).locator('.vp[data-etat="depart"]')).toHaveAttribute('data-ville', 'Douala');
  await expect(rangee(page, 'Kribi')).toBeVisible(); await expect(rangee(page, 'Yaoundé')).toBeVisible(); await expect(fenetre(page).locator('.vil')).toHaveCount(2);
  await rangee(page, 'Kribi').click();
  await expect(fenetre(page).locator('p.info')).toContainText('Pour aller à Kribi : 1 compagnie · dès');
  await fenetre(page).getByRole('button', { name: 'Échanger départ et arrivée' }).click();
  await expect(fenetre(page).locator('.vp[data-etat="depart"]')).toHaveAttribute('data-ville', 'Kribi');
  await expect(fenetre(page).locator('[data-carte="arrivee"]')).toContainText('Douala');
  await fenetre(page).getByRole('button', { name: 'Voir les départs · Douala' }).click();
  await expect(fenetre(page)).toBeHidden();
  expect(await recherche(page)).toMatchObject({ de: 'Kribi', vers: 'Douala' });
});

cas('date et heure : la carte déploie calendrier et heure dans la même fenêtre, sans changer de page', async ({ page }) => {
  await ouvrirFenetre(page);
  await fenetre(page).locator('[data-carte="date"]').click();
  await expect(fenetre(page)).toBeVisible(); await expect(page).toHaveURL(/\/\?maintenant=/);
  const cal = fenetre(page).getByRole('group', { name: 'Choisir le jour' });
  await expect(cal).toBeVisible();
  await expect(cal.locator('[data-jour="2026-11-04"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(cal.locator('[data-jour="2026-11-04"]')).toContainText('5k'); // prix le plus bas du jour
  await expect(cal.locator('[data-jour="2026-11-02"]')).toBeDisabled(); // passé
  await cal.locator('[data-jour="2026-11-06"]').click();
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('ven. 6 nov. · toute la journée');
  await fenetre(page).getByRole('button', { name: '06–09 h' }).click();
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('ven. 6 nov. · 06:00');
  await fenetre(page).getByRole('group', { name: 'Minutes' }).getByRole('button', { name: ':30' }).click();
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('ven. 6 nov. · 06:30');
  await fenetre(page).getByRole('spinbutton', { name: 'Heure précise' }).focus(); await page.keyboard.press('ArrowUp');
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('ven. 6 nov. · 07:30');
  await fenetre(page).getByRole('button', { name: 'Toute la journée' }).click();
  await expect(fenetre(page).locator('[data-carte="date"]')).toContainText('toute la journée');
  await fenetre(page).getByRole('button', { name: '12–15 h' }).click();
  await fenetre(page).getByRole('button', { name: 'Voir les départs · Douala' }).click();
  await expect(fenetre(page)).toBeHidden();
  expect(await recherche(page)).toMatchObject({ de: 'Yaoundé', vers: 'Douala', jour: '2026-11-06', heureCible: '12:00' });
  await expect(page.getByText('Yaoundé → Douala', { exact: true }).first()).toBeVisible();
});

cas('hors ligne : le bandeau le dit, la sélection fonctionne ; mouvement réduit : la fenêtre s’ouvre en fondu', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrirFenetre(page, { preparer: (e) => { e.session.hors_ligne = true; } });
  await expect(fenetre(page).getByText('Hors ligne')).toBeVisible();
  await rangee(page, 'Bafoussam').click();
  await expect(fenetre(page).locator('.vp[data-ville="Bafoussam"]')).toHaveAttribute('data-etat', 'choisie');
  await fenetre(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(fenetre(page)).toBeHidden();
});

cas('à 320 px : aucun débordement horizontal dans la fenêtre, elle tient dans l’écran et le bouton principal reste visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ouvrirFenetre(page);
  await fenetre(page).locator('[data-carte="date"]').click();
  const f = (await fenetre(page).boundingBox())!;
  expect(f.x).toBeGreaterThanOrEqual(0); expect(f.x + f.width).toBeLessThanOrEqual(320); expect(f.y + f.height).toBeLessThanOrEqual(640);
  const bouton = (await fenetre(page).getByRole('button', { name: 'Voir les départs · Douala' }).boundingBox())!;
  expect(bouton.y + bouton.height).toBeLessThanOrEqual(640); expect(bouton.height).toBeGreaterThanOrEqual(44);
  // rien ne dépasse à l'intérieur de la fenêtre (l'éventuel débordement de l'accueil lui-même n'est pas de son ressort)
  const dedans = await fenetre(page).evaluate((el) => [el, el.querySelector('.corps')!, el.querySelector('.carte')!].map((n) => n.scrollWidth - n.clientWidth));
  expect(dedans.every((d) => d <= 1), JSON.stringify(dedans)).toBe(true);
  await fenetre(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(fenetre(page)).toBeHidden();
});

cas('toutes les cibles tactiles de la fenêtre font au moins 44 px à 390 px (hors points de carte, doublons des propositions)', async ({ page }) => {
  await ouvrirFenetre(page);
  await fenetre(page).locator('[data-carte="date"]').click();
  const petits = await fenetre(page).evaluate((el) => [...el.querySelectorAll<HTMLElement>('button, [role="spinbutton"]')].filter((b) => !b.closest('[aria-hidden="true"]') && b.offsetParent !== null)
    .map((b) => ({ t: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })).filter((b) => b.h < 43 || b.w < 43));
  expect(petits).toEqual([]);
});
