// (k) /parcours : chaque étape de chaque parcours est un lien vers une vraie route ; cliquée depuis /parcours, elle se charge sans erreur,
// connecte au besoin la personne du parcours (rôle auto-connecté) et n'est jamais renvoyée vers l'entrée.
import { aller, expect, ouvrir, test } from './aide';
import { PARCOURS } from '../src/apps/siege/parcours.ts';

test.use({ viewport: { width: 1280, height: 820 }, isMobile: false, hasTouch: false });
const PUBLIQUES = new Set(['/splash', '/tuto', '/connexion', '/connexion/code', '/erreur', '/maintenance', '/ussd']);

for (const parcours of PARCOURS) {
  test(`(k) parcours « ${parcours.titre} » : ${parcours.etapes.length} étapes`, async ({ page }) => {
    await ouvrir(page, '/parcours');
    await expect(page.getByRole('heading', { name: 'Tous les parcours' })).toBeVisible();
    for (const etape of parcours.etapes) {
      const lien = page.getByRole('region', { name: parcours.titre }).locator(`a[href="${etape.chemin}"]`).filter({ hasText: etape.nom }).first();
      await expect(lien, `${etape.nom} → ${etape.chemin}`).toBeVisible();
      await lien.click();
      await expect.poll(() => page.evaluate(() => location.pathname), { message: `${etape.nom} : on reste sur ${etape.chemin}` }).toBe(etape.chemin);
      await expect(page.locator('[aria-busy="true"]'), `${etape.chemin} : chargé`).toHaveCount(0);
      await expect(page).toHaveTitle(/ · AfriMove$/);
      expect(await page.title(), etape.chemin).not.toMatch(/introuvable/i);
      expect((await page.locator('body').innerText()).trim().length, `${etape.chemin} : page non vide`).toBeGreaterThan(20);
      if (!PUBLIQUES.has(etape.chemin)) expect(await page.evaluate(() => location.pathname), 'jamais renvoyé vers l’entrée').not.toMatch(/^\/(entree|splash|connexion)/);
      await aller(page, '/parcours');
    }
  });
}
