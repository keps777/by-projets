import { expect, test } from '@playwright/test';
import { aller, contient, ouvrirDemo, solde } from './aide';

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
});
