// Parcours de l'entrée et de « Moi » : splash → tutoriel → connexion (visage simulé, passkey, code SMS), USSD, fidélité, litige, réglages.
import type { Page } from '@playwright/test';
import { expect, test } from './aide'; // le test d'aide échoue à la moindre exception de page ou console.error

const HORLOGE = '?maintenant=2026-11-03T07:30';
/** Entre comme Aïcha via l'entrée de démonstration, puis ouvre `chemin`. */
async function connecterAicha(page: Page, chemin = '/moi') {
  await page.goto(`/entree${HORLOGE}`);
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await page.evaluate(() => dispatchEvent(new Event('pagehide'))); // l'état est écrit dans le stockage
  await page.goto(chemin);
}
const stubCredentials = (page: Page, corps: string) => page.addInitScript(`Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: ${corps}, create: ${corps} } });`);

test('splash, langue, tutoriel puis connexion par visage simulé', async ({ page }) => {
  await page.goto(`/splash${HORLOGE}`);
  await expect(page.getByRole('heading', { name: 'AfriMove' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await page.getByRole('link', { name: 'Commencer' }).click();
  await expect(page).toHaveURL(/\/tuto$/);
  await expect(page.getByText('1 / 3')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click(); await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('3 / 3')).toBeVisible();
  await page.getByRole('link', { name: 'C’est parti' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText('Touche le cadre pour simuler Face ID.')).toBeVisible();
  await page.getByRole('button', { name: 'Lancer la reconnaissance' }).click();
  await expect(page.getByRole('heading', { name: 'Salut Aïcha' })).toBeVisible();
  await page.getByRole('button', { name: 'Voir les départs' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('passkey acceptée : connexion directe ; passkey absente : repli sur le visage simulé', async ({ page }) => {
  await stubCredentials(page, 'async () => ({ id: "cle" })');
  await page.goto(`/connexion${HORLOGE}`);
  await page.getByRole('button', { name: 'Continuer avec Face ID' }).click();
  await expect(page).toHaveURL(/\/$/);
});
test('passkey indisponible : on simule Face ID', async ({ page }) => {
  await stubCredentials(page, 'async () => { throw new Error("pas de passkey"); }');
  await page.goto(`/connexion${HORLOGE}`);
  await page.getByRole('button', { name: 'Continuer avec Face ID' }).click();
  await expect(page.getByRole('heading', { name: 'Salut Aïcha' })).toBeVisible();
});

test('code SMS : mauvais code refusé, bon code saisi, connexion d’Aïcha', async ({ page }) => {
  await page.goto(`/connexion/code${HORLOGE}`);
  await page.getByLabel('Numéro de téléphone').fill('691221008');
  await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
  await expect(page.getByRole('button', { name: 'Continuer', exact: true })).toBeDisabled();
  for (const c of '1111') await page.getByRole('button', { name: c, exact: true }).first().click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Code incorrect');
  await expect(page.getByText('Renvoyer dans 0:4')).toBeVisible();
  for (const c of '4821') await page.getByRole('button', { name: c, exact: true }).first().click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
test('code SMS : lecture automatique du code puis connexion', async ({ page }) => {
  await page.goto(`/connexion/code${HORLOGE}`);
  await page.getByLabel('Numéro de téléphone').fill('+237 6 91 22 10 08');
  await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
  await expect(page.getByText('code complet')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.otp span').first()).toHaveText('4');
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('code SMS : un numéro inconnu crée un compte voyageur avec son nom', async ({ page }) => {
  await page.goto(`/connexion/code${HORLOGE}`);
  await page.getByLabel('Numéro de téléphone').fill('655123456');
  await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
  for (const c of '4821') await page.getByRole('button', { name: c, exact: true }).first().click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByText('Nouveau numéro')).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('alert')).toContainText('prénom');
  await page.getByLabel('Ton nom').fill('Éloïse Biya');
  await page.getByLabel('Code parrain (facultatif)').fill('AICHA-24');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => dispatchEvent(new Event('pagehide'))); // l'état est écrit dans le stockage
  await page.goto('/moi/fidelite');
  await expect(page.getByTestId('points')).toContainText('500');
});
test('numéro invalide refusé', async ({ page }) => {
  await page.goto(`/connexion/code${HORLOGE}`);
  await page.getByLabel('Numéro de téléphone').fill('12345');
  await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
  await expect(page.getByRole('alert')).toContainText('invalide');
});

test('USSD : acheter un billet par menu, il apparaît dans Moi et rapporte des points', async ({ page }) => {
  await connecterAicha(page, '/ussd');
  const terminal = page.getByTestId('terminal');
  await expect(terminal).toContainText('1 Voyager');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(terminal).toContainText('De Yaounde vers');
  await page.getByRole('button', { name: '1', exact: true }).click(); await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(terminal).toContainText('par MoMo');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(terminal).toContainText('Paiement en cours');
  await expect(terminal).toContainText(/Billet AM-[A-Z0-9]{4}-[A-Z0-9]{2}/);
  await page.evaluate(() => dispatchEvent(new Event('pagehide'))); // l'état est écrit dans le stockage
  await page.goto('/moi');
  await expect(page.getByText('2 à venir · 0 passé')).toBeVisible();
  await page.goto('/moi/fidelite');
  expect(Number((await page.getByTestId('points').innerText()).replace(/\D/g, ''))).toBeGreaterThan(1480);
});
test('WhatsApp : réserver en écrivant « Douala demain » puis « 1 »', async ({ page }) => {
  await connecterAicha(page, '/ussd?canal=whatsapp');
  await page.getByRole('textbox', { name: 'Message' }).fill('Douala demain'); await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('log')).toContainText('Réponds 1, 2 ou 3');
  await page.getByRole('textbox', { name: 'Message' }).fill('1'); await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('log')).toContainText('Paiement MoMo');
});

test('litige : signaler un problème sur le billet, suivi du dossier', async ({ page }) => {
  await connecterAicha(page, '/litige');
  await expect(page.getByTestId('cible')).toContainText('AM-7F3K-22');
  await expect(page.getByRole('button', { name: 'Envoyer · réponse sous 2 h' })).toBeDisabled();
  await page.getByRole('button', { name: 'Retard' }).click();
  await page.getByLabel('Raconte').fill('Le bus est parti avec une heure de retard.');
  await page.getByRole('button', { name: 'Ajouter une photo' }).first().click();
  await page.getByRole('button', { name: 'Envoyer · réponse sous 2 h' }).click();
  await expect(page.getByRole('heading', { name: 'Dossier L-2041 ouvert' })).toBeVisible();
  await expect(page.getByTestId('statut-L-2041')).toHaveText('ouvert');
  await page.getByRole('button', { name: 'Nouveau signalement' }).click();
  await expect(page.getByText('Mes dossiers')).toBeVisible();
});

test('notifications : marquer lu et suivre le lien', async ({ page }) => {
  await connecterAicha(page, '/notifications');
  await expect(page.getByText('Billet confirmé')).toBeVisible();
  await page.getByRole('button', { name: 'Tout marquer lu' }).click();
  await expect(page.getByRole('button', { name: 'Tout est lu' })).toBeVisible();
  await page.getByRole('link', { name: /Billet confirmé/ }).click();
  await expect(page).toHaveURL(/\/pass$/);
});

test('Moi, proches, réglages (langue, hors ligne, effacer)', async ({ page }) => {
  await connecterAicha(page, '/moi');
  await expect(page.getByText('Aïcha Ndiba')).toBeVisible(); await expect(page.getByText('niveau Argent')).toBeVisible();
  await page.getByRole('link', { name: /Mes proches/ }).click();
  await page.getByRole('button', { name: 'Ajouter un proche' }).click();
  await page.getByLabel('Prénom et nom').fill('Tonton Sa’a'); await page.getByLabel('Numéro').fill('655329810');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Tonton Sa’a')).toBeVisible();
  await page.goto('/reglages');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('Security and payment')).toBeVisible();
  await page.getByRole('switch', { name: 'Mode hors ligne' }).click();
  await expect(page.getByRole('switch', { name: 'Mode hors ligne' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Effacer le monde de démo' }).click();
  await page.getByRole('button', { name: 'Oui, tout effacer' }).click();
  await expect(page).toHaveURL(/\/splash$/);
});

test('autorisations : l’état réel du navigateur est affiché', async ({ page }) => {
  await connecterAicha(page, '/autorisations');
  await expect(page.getByText('0 / 5')).toBeVisible();
  await expect(page.locator('[data-permission="camera"]')).toContainText('Caméra');
});

test('erreur et maintenance : réessayer, avancer l’horloge', async ({ page }) => {
  await page.goto(`/erreur${HORLOGE}`);
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('heading', { name: 'C’est revenu' })).toBeVisible({ timeout: 5000 });
  await page.goto('/maintenance');
  await expect(page.locator('.rings b')).toHaveText('38 min');
  await page.getByRole('button', { name: 'Avancer l’horloge (démo)' }).click();
  await expect(page.locator('.rings b')).toHaveText('28 min');
});

test('accessibilité de base : pas de débordement horizontal à 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of ['/splash', '/tuto', '/connexion', '/connexion/code', '/ussd', '/erreur', '/maintenance']) {
    await page.goto(url + HORLOGE);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); // écran chargé
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.scr, .bd')].some((e) => e.scrollWidth > e.clientWidth + 1));
    expect(deborde, url).toBe(false);
  }
});

test('écrans de Moi sans débordement horizontal à 320 px', async ({ page }) => {
  await connecterAicha(page, '/moi');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of ['/moi', '/moi/fidelite', '/moi/proches', '/notifications', '/litige', '/reglages', '/autorisations']) {
    await page.goto(url); await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); // écran chargé
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.scr, .bd')].some((e) => e.scrollWidth > e.clientWidth + 1));
    expect(deborde, url).toBe(false);
  }
});

test('tutoriel : glisser au doigt change de carte', async ({ page }) => {
  await page.goto(`/tuto${HORLOGE}`);
  const scene = page.getByRole('group', { name: 'Tutoriel' }), boite = (await scene.boundingBox())!;
  await page.mouse.move(boite.x + boite.width * 0.8, boite.y + 150); await page.mouse.down(); await page.mouse.move(boite.x + boite.width * 0.3, boite.y + 150, { steps: 6 }); await page.mouse.up();
  await expect(page.getByText('2 / 3')).toBeVisible();
  await scene.press('ArrowLeft');
  await expect(page.getByText('1 / 3')).toBeVisible();
});
