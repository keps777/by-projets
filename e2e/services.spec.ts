import { expect, test } from '@playwright/test';
import { aller, attendreEnregistrement, contient, etatEnregistre, JOUR_DE_PAIE, ouvrirDemo, rouvrirEtDeverrouiller, solde } from './aide';

const CODE_DEMO = '482916';

test.describe('accueil → services, piliers et prélèvements des services', () => {
  test('« Plus de services » de l’accueil mène aux quatre services réels', async ({ page }) => {
    await ouvrirDemo(page);
    const services: [string, RegExp, string][] = [
      ['Diaspora', /\/diaspora$/, 'Payer pour un proche'],
      ['Commerce', /\/commerce$/, 'Encaisser'],
      ['Protection', /\/protection$/, 'Protection famille'],
      ['Énergie', /\/energie$/, 'Énergie solaire']
    ];
    for (const [nom, url, titre] of services) {
      await page.getByRole('link', { name: nom, exact: true }).last().click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: titre })).toBeVisible();
      await expect(page).toHaveTitle(/AssureMe$/);
      await page.goBack();
      await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible();
    }
  });

  test('grille des piliers : chaque pilier ouvre son vrai écran', async ({ page }) => {
    await ouvrirDemo(page);
    await page.getByRole('link', { name: 'Tout voir' }).click();
    await expect(page).toHaveURL(/\/piliers$/);
    const attendu: [string, RegExp][] = [
      ['Santé', /\/sante$/], ['Mobilité', /\/auto$/], ['Logement', /\/logement$/], ['École', /\/ecole$/], ['Coffres', /\/coffres$/],
      ['Protection', /\/protection$/], ['Énergie', /\/energie$/], ['Commerce', /\/commerce$/], ['Diaspora', /\/diaspora$/]
    ];
    for (const [nom, url] of attendu) {
      await page.getByRole('button', { name: new RegExp(`^${nom}\\.`) }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByText('Page introuvable')).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(/\/piliers$/);
    }
  });

  test('kit solaire commandé : prélevé à la paie de novembre, une seule fois, avec le Pass, l’école et le coffre', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/energie');
    await page.getByRole('button', { name: /Commander le kit Maison/ }).click();
    await page.getByText('Lundi 26 octobre').click();
    await page.getByRole('button', { name: 'Confirmer la commande' }).click();
    await expect(page.locator('body')).toContainText(/commandé|Installation/);

    // octobre inchangé (premier prélèvement le 28 nov.), novembre = 69 000 + 17 473
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');
    await page.getByRole('button', { name: /NOV/ }).click();
    await expect(page.getByText(contient('Kit solaire Maison · 24 mois 17 473'))).toBeVisible();
    await attendreEnregistrement(page, (e) => e?.credits?.some((c: any) => c.produit === 'solaire'));

    // on rouvre le 28 nov. : les paies du 28 oct. et du 28 nov. sont rattrapées, le kit n'est prélevé qu'à la seconde
    await rouvrirEtDeverrouiller(page, JOUR_DE_PAIE);
    await expect.poll(() => solde(page)).toBe(86_500 + 2 * 520_000 - 2 * 69_000 - 17_473);
    await attendreEnregistrement(page, (e) => e?.dernierePaie === '2026-11-28');
    const e = await etatEnregistre(page);
    expect(e.credits.find((c: any) => c.produit === 'solaire')).toMatchObject({ payees: 1, statut: 'actif' });
    expect(e.mouvements.filter((m: any) => m.titre.startsWith('Kit solaire'))).toHaveLength(1);
  });
});
