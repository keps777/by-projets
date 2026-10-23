import { expect, test } from '@playwright/test';
import { aller, attendreEnregistrement, contient, ouvrir, pave, solde, toucher } from './aide';

test.describe('compte vierge : de l’inscription au premier coffre', () => {
  test('inscription complète, accueil vide, rechargement de la page, recharge, coffre, solde et mouvements', async ({ page }) => {
    // --- /bienvenue → inscription (SMS 123456, code d'app 135790)
    await ouvrir(page, '/bienvenue');
    await toucher(page, 'Créer mon compte en 2 minutes');
    await page.locator('#tel').fill('691234567');
    await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
    await expect(page).toHaveURL(/\/inscription\/code/);
    await expect(page.getByText('votre code est 123456')).toBeVisible();
    await pave(page, '123456');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page).toHaveURL(/\/inscription\/identite/);
    await page.getByRole('button', { name: 'Prendre la photo' }).click();
    await expect(page.getByText('LECTURE · 98 %')).toBeVisible();
    await page.getByLabel(/Nom et prénoms/i).fill('KAMGA Fanta Esther');
    await page.getByRole('button', { name: "C'est bien moi" }).click();

    await expect(page).toHaveURL(/\/inscription\/pass/);
    await page.getByRole('button', { name: 'Activer le Pass Famille' }).click();

    await expect(page).toHaveURL(/\/inscription\/creer-code/);
    await pave(page, '135790');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(/\/inscription\/confirmer-code/);
    await pave(page, '135790');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page).toHaveURL(/\/biometrie/);
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expect(page).toHaveURL(/\/notifications-permission/);
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expect(page).toHaveURL(/\/inscription\/pret/);
    await expect(page.getByText('Bienvenue, Fanta.')).toBeVisible();
    await page.getByRole('button', { name: 'Ouvrir mon app' }).click();

    // --- accueil vide : solde 0, rien dans l'historique, invitation à compléter le compte
    await expect(page.getByRole('heading', { name: 'Bonjour, Fanta' })).toBeVisible();
    expect(await solde(page)).toBe(0);
    await expect(page.getByText('Complétons votre compte')).toBeVisible();
    await expect(page.locator('body')).toContainText(/niveau start/i);
    await page.getByRole('button', { name: 'Historique' }).click();
    await expect(page.getByText("Aucun mouvement pour l'instant")).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();

    // --- rechargement de la page : le compte est toujours là, connecté
    await attendreEnregistrement(page, (e) => e?.compte?.prenom === 'Fanta');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bonjour, Fanta' })).toBeVisible();
    expect(await solde(page)).toBe(0);

    // --- recharge de 25 000 par Orange Money
    await page.getByRole('button', { name: 'Recharger', exact: true }).first().click();
    await page.getByRole('button', { name: 'Recharger 25 000' }).click();
    await expect.poll(() => solde(page)).toBe(25_000);

    // --- premier coffre : « Mariage », 1 M, 50 k par mois (valeurs proposées par défaut), puis un versement de 10 000
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Coffres' }).click();
    await expect(page.getByText(/Aucun coffre pour l.instant/)).toBeVisible();
    await toucher(page, /Créer mon premier coffre/);
    await expect(page).toHaveURL(/\/coffres\/nouveau/);
    await page.getByRole('button', { name: /Créer le coffre/ }).click();
    await expect(page).toHaveURL(/\/coffres\?c=/);
    await expect(page.getByText('Mariage').first()).toBeVisible();
    await page.getByRole('button', { name: /Verser maintenant/ }).click();
    await page.getByRole('button', { name: /^Verser 10 000/ }).click();

    // --- solde et mouvements
    await aller(page, '/');
    await expect.poll(() => solde(page)).toBe(15_000);
    await page.getByRole('button', { name: 'Historique' }).click();
    const histo = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(histo.getByText('Coffre Mariage')).toBeVisible();
    await expect(histo.getByText('Recharge Orange Money')).toBeVisible();
    await expect(histo).toContainText(contient('−10 000'));
    await expect(histo).toContainText(contient('+25 000'));
  });
});
