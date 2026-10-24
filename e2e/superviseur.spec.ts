// Parcours du superviseur (Abdou, gare de Mvan) sur l'application construite, horloge figée à 07:30.
import { expect, test, type Page } from '@playwright/test';

const HEURE = '?maintenant=2026-11-03T07:30';
async function entrer(page: Page, prenom: string, pin: string, chemin = '') {
  await page.goto(`/entree${HEURE}`);
  await page.getByRole('button', { name: new RegExp(prenom) }).first().click();
  for (const c of pin) await page.getByRole('dialog').getByRole('button', { name: c, exact: true }).click();
  await page.waitForURL(/\/(superviseur|patron|)$/);
  if (chemin) await page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')); }, chemin);
}
const pasDeDebordement = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1)).toBe(true);

test('la garde ferme l’espace superviseur à une voyageuse', async ({ page }) => {
  await page.goto(`/entree${HEURE}`);
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await page.evaluate(() => { history.pushState({}, '', '/superviseur'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForURL(/\/entree/);
});

test('le patron passe partout par la garde et suit la gare de Mvan', async ({ page }) => {
  await entrer(page, 'Luther', '0001', '/superviseur');
  await expect(page.getByText('Gare de Mvan')).toBeVisible();
});

test('la gare en direct : départs, quais, caisses et alertes', async ({ page }) => {
  await entrer(page, 'Abdou', '1357');
  await expect(page.getByText('Gare de Mvan')).toBeVisible();
  const alertes = page.locator('.al');
  await expect(alertes.filter({ hasText: 'Annulation demandée après départ' })).toBeVisible();
  await expect(alertes.filter({ hasText: 'Guichet 2 bloqué' })).toBeVisible();
  await expect(alertes.filter({ hasText: 'Écart de caisse' })).toBeVisible();
  await expect(page.getByText(/à traiter/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^Quai \d :/ }).first()).toBeVisible(); // numéro de quai partagé (core/quai.ts)
  await page.getByRole('button', { name: 'Tous' }).click();
  await expect(page.locator('.dep').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sup-gare.png' });
  await pasDeDebordement(page);
});

test('décider une annulation après départ : libère la place, ferme la demande et l’alerte disparaît', async ({ page }) => {
  await entrer(page, 'Abdou', '1357');
  await page.locator('.al', { hasText: 'Annulation demandée après départ' }).click();
  await expect(page.getByRole('heading', { level: 1 }).or(page.locator('.ttl', { hasText: /Annul/ })).first()).toBeVisible();
  await expect(page.getByText('capture d’écran présentée par un tiers').first()).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Rembourser le voyageur' })).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: 'test-results/sup-voir.png' });
  await page.getByRole('button', { name: /Annuler et libérer/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler le billet' }).click();
  await expect(page.getByText(/Billet annulé|Annulation acceptée/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Retour à la gare' }).click();
  await expect(page.locator('.al', { hasText: 'Annulation demandée après départ' })).toHaveCount(0);
});

test('valider une clôture : mauvais PIN refusé puis bon PIN accepté', async ({ page }) => {
  await entrer(page, 'Abdou', '1357');
  await page.locator('.al', { hasText: 'Écart de caisse' }).click();
  await expect(page.getByText('Attendu espèces')).toBeVisible();
  await expect(page.getByText('−1 500 F').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sup-valider.png' });
  for (const c of '0000') await page.locator('.pad').getByRole('button', { name: c, exact: true }).click();
  await page.getByRole('button', { name: /Valider la clôture/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'PIN incorrect' })).toBeVisible();
  for (const c of '1357') await page.locator('.pad').getByRole('button', { name: c, exact: true }).click();
  await page.getByRole('button', { name: /Valider la clôture/ }).click();
  await expect(page.getByText(/Clôture validée/).first()).toBeVisible();
});

test('débloquer un guichet après reconnaissance du visage', async ({ page }) => {
  await entrer(page, 'Abdou', '1357');
  await page.locator('.al', { hasText: 'Guichet 2 bloqué' }).click();
  const bouton = page.getByRole('button', { name: /Débloquer le guichet 2/ });
  await expect(bouton).toBeDisabled();
  await page.getByRole('button', { name: /Reconnaître Joseph/ }).click();
  await expect(page.getByText('Joseph reconnu')).toBeVisible();
  await page.screenshot({ path: 'test-results/sup-debloquer.png' });
  await bouton.click();
  await expect(page.getByText('Guichet 2 débloqué').first()).toBeVisible();
});

test('équipe : nouveau PIN par SMS, désactivation, ajout d’un agent', async ({ page }) => {
  await entrer(page, 'Abdou', '1357');
  await page.getByRole('link', { name: 'Équipe' }).first().click();
  await expect(page.getByText('Équipe de Mvan')).toBeVisible();
  await page.getByRole('button', { name: 'Nouveau PIN pour Ibrahim' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer le nouveau PIN' }).click();
  await expect(page.getByText(/SMS envoyé au 670 00 01 03/)).toBeVisible();
  await page.getByRole('button', { name: 'Voir le PIN (démo)' }).click();
  await expect(page.locator('.pe', { hasText: 'Ibrahim' }).locator('.mono')).toHaveText(/^\d{4}$/);
  await page.getByRole('switch', { name: /Compte de Ibrahim/ }).click();
  await expect(page.locator('.pe', { hasText: 'Ibrahim' }).getByText('désactivé', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un agent' }).click();
  await page.getByLabel('Prénom').fill('Awa'); await page.getByLabel('Nom', { exact: true }).fill('Mfou'); await page.getByLabel('Téléphone').fill('655123456');
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter à l’équipe' }).click();
  await expect(page.locator('.pe', { hasText: 'Awa Mfou' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sup-equipe.png' });
  await pasDeDebordement(page);
});

test('rapport du soir : texte WhatsApp, lien de partage, clôture', async ({ page, context }) => {
  await entrer(page, 'Abdou', '1357');
  await page.getByRole('link', { name: 'Rapport' }).first().click();
  await expect(page.getByText('Message au patron')).toBeVisible();
  await expect(page.locator('.msg')).toContainText('Rapport du soir · Mvan');
  await expect(page.locator('.msg')).toContainText('— Abdou');
  const lien = page.getByRole('link', { name: /Envoyer sur WhatsApp au patron/ });
  await expect(lien).toHaveAttribute('href', /^https:\/\/wa\.me\/237670000110\?text=/);
  await page.screenshot({ path: 'test-results/sup-rapport.png', fullPage: false });
  const [popup] = await Promise.all([context.waitForEvent('page'), lien.click()]);
  await popup.close();
  await expect(page.getByText(/envoyé 07:30/)).toBeVisible();
  await page.getByRole('button', { name: 'Clôturer la gare' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clôturer la gare' }).click();
  await expect(page.getByText(/Gare clôturée à 07:30/)).toBeVisible();
});

test('rapport après 20:00 : clôture tardive signalée', async ({ page }) => {
  await page.goto('/entree?maintenant=2026-11-03T21:12');
  await page.getByRole('button', { name: /Abdou/ }).first().click();
  for (const c of '1357') await page.getByRole('dialog').getByRole('button', { name: c, exact: true }).click();
  await page.waitForURL(/\/superviseur/);
  await page.getByRole('link', { name: 'Rapport' }).first().click();
  await expect(page.getByText(/72 min de retard, le patron sera alerté/)).toBeVisible();
  await page.getByRole('button', { name: 'Clôturer la gare' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clôturer la gare' }).click();
  await expect(page.getByText(/patron alerté/)).toBeVisible();
});

test('320 px : aucun débordement horizontal sur les six écrans', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await entrer(page, 'Abdou', '1357');
  for (const c of ['/superviseur', '/superviseur/voir', '/superviseur/valider', '/superviseur/equipe', '/superviseur/debloquer', '/rapport-soir', '/superviseur/moi']) {
    await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, c);
    await page.waitForTimeout(250);
    await pasDeDebordement(page);
  }
});
