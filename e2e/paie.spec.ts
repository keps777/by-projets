import { expect, test } from '@playwright/test';
import { aller, attendreEnregistrement, contient, etatEnregistre, JOUR_DE_PAIE, ouvrir, ouvrirDemo, solde } from './aide';

const CODE_DEMO = '482916';

test.describe('jour de paie rejoué (?maintenant=…)', () => {
  test('28 nov. : une paie traitée, 69 000 prélevés, 451 000 versés, score, notification, prochain prélèvement', async ({ page }) => {
    await ouvrirDemo(page, JOUR_DE_PAIE);
    await expect.poll(() => solde(page)).toBe(86_500 + 520_000 - 69_000);
    const corps = page.locator('body');
    await expect(corps).toContainText('Salaire reçu');
    // prochain prélèvement : celui de décembre, avec le Pass renouvelé et l'école 4 / 10
    const bandeau = page.getByRole('link', { name: /Prochain prélèvement/ });
    await expect(bandeau).toContainText(contient('28 déc.'));
    await expect(bandeau).toContainText('69 000');
    await expect(bandeau).toContainText('PASS 12 500');

    await attendreEnregistrement(page, (e) => e?.dernierePaie === '2026-11-28');
    const e = await etatEnregistre(page);
    const lignes = (cat: string) => e.mouvements.filter((m: any) => m.categorie === cat && m.ts >= Date.parse('2026-11-28T00:00:00'));
    expect(lignes('salaire')).toHaveLength(1);
    expect(lignes('pass').map((m: any) => m.montant)).toEqual([-12_500]);
    expect(lignes('credit').map((m: any) => m.montant)).toEqual([-44_000]);
    expect(lignes('coffre').map((m: any) => m.montant)).toEqual([-12_500]);
    expect(e.credits.find((c: any) => c.id === 'c-ecole')).toMatchObject({ payees: 3, prochaine: '2026-12-28' });
    expect(e.score.valeur).toBe(747);

    // notifications et écran « Jour de paie »
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Salaire reçu, prélèvements faits');
    await expect(page.getByRole('dialog')).toContainText('69 000 prélevés');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await aller(page, '/prelevement/notif');
    await expect(corps).toContainText(contient('Vous recevez'));
    await expect(corps).toContainText('451 000');
    await expect(corps).toContainText('− 69 000');
    await expect(corps).toContainText(contient('3 PRÉLÈVEMENTS'));
  });

  test('recharger la page ne repasse pas la paie', async ({ page }) => {
    await ouvrirDemo(page, JOUR_DE_PAIE);
    await expect.poll(() => solde(page)).toBe(537_500);
    await attendreEnregistrement(page, (e) => e?.dernierePaie === '2026-11-28');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible();
    expect(await solde(page)).toBe(537_500);
    await attendreEnregistrement(page, (e) => e?.mouvements?.filter((m: any) => m.categorie === 'salaire').length === 1);
  });

  test('application fermée pendant quatre paies : toutes rattrapées une fois, aucune oubliée', async ({ page }) => {
    await ouvrirDemo(page); // 23 oct. 2026
    await attendreEnregistrement(page, (e) => e?.mode === 'demo');
    // on rouvre le 28 janvier 2027 : paies du 28 oct., 28 nov., 28 déc. et 28 janv. échues ; la session a expiré, on déverrouille avec le code
    await ouvrir(page, '/', '2027-01-28T10:00');
    await expect(page).toHaveURL(/\/session/);
    await page.keyboard.type(CODE_DEMO);
    await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => solde(page)).toBe(86_500 + 4 * (520_000 - 69_000));
    await attendreEnregistrement(page, (e) => e?.dernierePaie === '2027-01-28');
    const e = await etatEnregistre(page);
    expect(e.mouvements.filter((m: any) => m.categorie === 'salaire')).toHaveLength(4);
    expect(e.credits.find((c: any) => c.id === 'c-ecole')).toMatchObject({ payees: 6, statut: 'actif', prochaine: '2027-02-28' });
    // une seconde ouverture le même jour ne change rien
    await page.reload();
    await expect(page.getByRole('heading', { name: /Bonjour, Aïcha/ })).toBeVisible();
    expect(await solde(page)).toBe(86_500 + 4 * (520_000 - 69_000));
  });
});
