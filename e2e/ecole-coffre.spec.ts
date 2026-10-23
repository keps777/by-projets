import { expect, test } from '@playwright/test';
import { aller, attendreEnregistrement, contient, etatEnregistre, ouvrirDemo, solde } from './aide';

test.describe('école et coffres : une seule épargne', () => {
  test('l’école lit le coffre « Rentrée » : un versement dans le coffre change le financement à demander', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/ecole/frais');
    const corps = page.locator('body');
    await expect(corps).toContainText(contient('Total rentrée · 3 enfants'));
    await expect(corps).toContainText(contient('Dans votre coffre Rentrée − 160 000'));
    await expect(corps).toContainText(contient('À financer 440 000'));

    // on verse 10 000 dans le coffre Rentrée (première carte de la pile)
    await aller(page, '/coffres');
    await expect(page.getByRole('heading', { name: 'Coffres' })).toBeVisible();
    await expect(page.locator('body')).toContainText(contient('160 000'));
    await page.getByRole('button', { name: /Verser maintenant dans Rentrée 2027/ }).click();
    await page.getByRole('button', { name: /^Verser 10 000/ }).click();
    await expect(page.locator('body')).toContainText(contient('170 000'));

    await aller(page, '/ecole/frais');
    await expect(page.locator('body')).toContainText(contient('Dans votre coffre Rentrée − 170 000'));
    await expect(page.locator('body')).toContainText(contient('À financer 430 000'));

    // le versement est bien sorti du solde et figure à l'historique
    await aller(page, '/');
    await expect.poll(() => solde(page)).toBe(76_500);
  });

  test('crédit école de la démo : mensualité 3 / 10 de 44 000, remboursé 88 000 sur 440 000, cohérent avec le prélèvement', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/ecole');
    const corps = page.locator('body');
    await expect(corps).toContainText(contient('88 000/ 440 000'));
    await expect(corps).toContainText(contient('2 / 10 mensualités'));
    await expect(corps).toContainText(contient('44 000'));
    await aller(page, '/prelevement');
    await expect(page.getByRole('button', { name: /Mensualité école 3 \/ 10, 44 000/ })).toBeVisible();
  });

  test('accepter le plan de paiement : les écoles sont payées avec le crédit et le coffre Rentrée, qui est vidé', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/ecole/frais');
    await page.getByRole('link', { name: /Choisir mon plan de paiement/ }).or(page.getByRole('button', { name: /Choisir mon plan de paiement/ })).first().click();
    await expect(page).toHaveURL(/\/ecole\/plan$/);
    await expect(page.locator('body')).toContainText(contient('Mensualités totales 18 % du salaire'));
    await page.getByRole('button', { name: /Payer les écoles dès l’accord/ }).click();
    const feuille = page.getByRole('dialog', { name: 'Accord du plan' });
    await expect(feuille).toContainText(contient('Versé aux écoles aujourd’hui 600 000'));
    await feuille.getByRole('checkbox').check();
    await feuille.getByRole('button', { name: 'Signer et accepter' }).click();
    await attendreEnregistrement(page, (e) => e?.credits?.filter((c: any) => c.produit === 'ecole').length === 2);
    const e = await etatEnregistre(page);
    expect(e.credits.find((c: any) => c.id !== 'c-ecole' && c.produit === 'ecole')).toMatchObject({ capital: 440_000, mensualite: 47_711, duree: 10 });
    const rentree = e.tranches.coffres.coffres.find((c: any) => c.genre === 'Rentrée');
    expect(rentree.epargne).toBe(0);
    expect(rentree.operations[0]).toMatchObject({ type: 'retrait', montant: -160_000 });
    // le solde ne bouge pas (le crédit paie les écoles), le prélèvement d'octobre non plus : la 1re mensualité est en septembre 2027
    await aller(page, '/');
    expect(await solde(page)).toBe(86_500);
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');
    // l'école ne compte plus ces 160 000 comme disponibles
    await aller(page, '/ecole/frais');
    await expect(page.locator('body')).toContainText(contient('Dans votre coffre Rentrée − 0'));
  });
});
