// Parcours du patron (Luther) : tableau 3D, assistant chiffré, modules, financement, convention signée, colis inter-agences.
// Horloge figée au mardi 3 novembre 2026, 19:10 (`?maintenant=`). Connexion par l'entrée de démonstration (PIN 0001).
import type { Page } from '@playwright/test';
import { expect, test } from './aide'; // le test d'aide échoue à la moindre exception de page ou console.error

async function entrerCommeLuther(page: Page) {
  await page.goto('/entree?maintenant=2026-11-03T19:10');
  await page.getByText('Luther Kepseu').click();
  for (const c of '0001') await page.locator('.pad button', { hasText: new RegExp(`^${c}$`) }).click();
  await page.waitForURL('**/patron');
  await page.waitForSelector('.tile');
}
const dock = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });
const ouvrir = (page: Page, chemin: string) => page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, chemin);

test.describe('patron', () => {
  test('tableau 3D, modules lisibles par les autres apps, assistant et changement de prix', async ({ page }) => {
    await entrerCommeLuther(page);
    await expect(page.locator('.big').first()).toContainText('F');
    const tuile = page.locator('.tile').first(), boite = (await tuile.boundingBox())!;
    await page.mouse.move(boite.x + boite.width * 0.8, boite.y + boite.height * 0.2);
    await expect.poll(() => tuile.evaluate((e) => getComputedStyle(e).transform)).not.toBe('none');

    await dock(page).getByRole('link', { name: 'Modules' }).click();
    const colis = page.getByRole('switch', { name: 'Colis', exact: true });
    await colis.click();
    await expect(colis).toHaveAttribute('aria-checked', 'false');
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('afrimove.v1')!).monde.params.modules.colis)).toBe(false);
    await colis.click();

    await dock(page).getByRole('link', { name: 'Assistant', exact: true }).click();
    await page.getByPlaceholder('Pose ta question…').fill('Pourquoi les ventes baissent sur Yaoundé → Douala ?');
    await page.getByRole('button', { name: 'Envoyer la question' }).click();
    await page.waitForSelector('.cmp');
    await expect(page.locator('.cause').first()).toContainText('Finex propose un 06:15');
    await page.getByRole('button', { name: /Passer le 07:00/ }).click();
    await expect(page.getByRole('group', { name: 'Confirmer le changement de prix' })).toBeVisible();
    await page.getByRole('button', { name: 'Oui, appliquer' }).click();
    await expect(page.getByText('Prix appliqué')).toBeVisible();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByText(/Si tu passes à 6/)).toBeVisible();
  });

  test('financement : dossier suivi en étapes, la visite exige le devis', async ({ page }) => {
    await entrerCommeLuther(page);
    await dock(page).getByRole('link', { name: 'Finance' }).click();
    await page.getByRole('button', { name: /Envoyer le dossier/ }).click();
    await page.waitForURL('**/financement/demande**');
    await expect(page.locator('.ev.cur')).toContainText('Dossier envoyé');
    await page.getByRole('button', { name: /Avancer le dossier/ }).click();
    await page.getByRole('button', { name: /Avancer le dossier/ }).click();
    await expect(page.locator('.ev.cur')).toContainText('Analyse');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByRole('button', { name: /Avancer le dossier/ }).click();
    await expect(page.locator('.ev.cur')).toContainText('Visite');
  });

  test('équipe : suspendre, nouveau PIN, changer de gare', async ({ page }) => {
    await entrerCommeLuther(page);
    await dock(page).getByRole('link', { name: 'Gares' }).click();
    await page.getByRole('button', { name: 'Personnes' }).click();
    await page.getByRole('link', { name: /Ibrahim/ }).click();
    await page.getByRole('button', { name: 'Suspendre' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('suspendu', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /Réactiver/ }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await page.getByRole('button', { name: 'Nouveau PIN' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('PIN provisoire envoyé par SMS')).toBeVisible();
    await page.getByRole('button', { name: 'Changer de gare' }).click();
    await page.locator('select').selectOption('akwa');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.locator('.hero')).toContainText('Douala Akwa');
  });

  test('inter-agences : convention signée au doigt, contre-signée, colis confié', async ({ page }) => {
    await entrerCommeLuther(page);
    await ouvrir(page, '/inter-agences/convention?partenaire=AV');
    await page.waitForSelector('canvas');
    await expect(page.getByRole('button', { name: 'Signer avec ma signature' })).toBeDisabled();
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await page.locator('.bd').evaluate((e) => e.scrollBy(0, 150));
    const zone = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(zone.x + 30, zone.y + 60); await page.mouse.down();
    await page.mouse.move(zone.x + 90, zone.y + 20, { steps: 8 }); await page.mouse.move(zone.x + 150, zone.y + 80, { steps: 8 }); await page.mouse.up();
    await page.getByLabel(/J’ai lu la convention/).check();
    await page.getByRole('button', { name: 'Signer avec ma signature' }).click();
    await expect(page.locator('.sig.ok')).toBeVisible();
    await page.getByRole('button', { name: /Envoyer à Alpha VIP/ }).click();
    await page.getByRole('button', { name: /contre-signe/ }).click();
    await expect(page.getByText('Convention active')).toBeVisible();
    await ouvrir(page, '/inter-agences');
    await page.getByRole('button', { name: /Confier à Alpha VIP/ }).first().click();
    await expect(page.getByText('Colis confiés')).toBeVisible();
  });

  test('pas de débordement horizontal à 320 px', async ({ page }) => {
    await entrerCommeLuther(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const chemin of ['/patron', '/patron/equipe', '/patron/gare?gare=mvan', '/patron/personne?personne=p-fatou', '/assistant', '/assistant/reponse?q=bilan', '/modules', '/financement', '/financement/demande', '/inter-agences', '/inter-agences/convention?partenaire=AV']) {
      await ouvrir(page, chemin);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); // écran chargé
      const largeurs = await page.evaluate(() => [document.documentElement.scrollWidth, ...[...document.querySelectorAll('.bd')].map((e) => e.scrollWidth)]);
      expect(Math.max(...largeurs), chemin).toBeLessThanOrEqual(320);
    }
  });
});
