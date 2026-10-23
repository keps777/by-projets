import { expect } from '@playwright/test';
import { test, aller, attendreEnregistrement, contient, etatEnregistre, JOUR_DE_PAIE, ouvrirDemo, patcherEtat, rouvrirEtDeverrouiller, solde } from './aide';

test.describe('règle des 33 % et crédit auto', () => {
  test('Yaris en 36 mois avec 500 000 d’apport : refusée à 40 % à cause du crédit scolaire', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/auto/catalogue');
    await page.getByRole('button', { name: 'Simuler la Yaris' }).click();
    await expect(page).toHaveURL(/\/auto\/simulation$/);
    const corps = page.locator('body');
    await expect(corps).toContainText(contient('162 610'));
    await expect(corps).toContainText(contient('40 % du salaire net'));
    await expect(corps).toContainText(contient('dont ce crédit 31 % + 44 000 déjà prélevés'));
    await expect(corps).toContainText('TROP LOURD');
    // l'apport proposé est celui du vrai coffre « Apport voiture » (500 000), pas un montant inventé
    await expect(corps).toContainText(contient('Coffre voiture : 500 000 disponibles'));
    await page.getByRole('button', { name: /Demander quand même la décision/ }).click();
    await expect(page).toHaveURL(/\/auto\/decision$/);
    await expect(corps).toContainText(/REFUSÉ/i);
    await expect(corps).toContainText(/40 %/);

    // aucun crédit n'est créé, le prélèvement reste à 69 000, une notification de refus est envoyée
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');
    await page.getByRole('button', { name: /Notifications|Retour/ }).first().click().catch(() => {});
    await attendreEnregistrement(page, (e) => e?.notifications?.some((n: any) => n.titre === 'Crédit auto refusé'));
    const e = await etatEnregistre(page);
    expect(e.credits.filter((c: any) => c.produit === 'auto')).toHaveLength(0);
  });

  test('au-delà de 33 %, l’étalement d’une facture est indisponible (même règle que le crédit)', async ({ page }) => {
    await ouvrirDemo(page);
    await patcherEtat(page, (e) => {
      e.credits.push({ id: 'c-test', produit: 'logement', libelle: 'Crédit de test', capital: 1_000_000, mensualite: 130_000, duree: 10, payees: 0, prochaine: '2026-10-28', statut: 'actif' });
    });
    await aller(page, '/pay/facture?id=f-1190');
    const etaler = page.getByRole('radio', { name: /Étaler sur 3 mois/ });
    await expect(etaler).toBeDisabled();
    await expect(page.getByText('Indisponible : dépasserait 33 % de votre salaire')).toBeVisible();
    // payer comptant reste possible
    await expect(page.getByRole('radio', { name: /Payer maintenant/ })).toBeChecked();
    // la même règle côté santé : l'écran de la facture santé refuse aussi l'étalement
    await aller(page, '/sante/facture/f-1190');
    await page.getByRole('radio', { name: /Étaler sur 3 mois/ }).click();
    await expect(page.getByRole('alert')).toContainText(/Mensualités totales 34 %/);
    await expect(page.getByRole('button', { name: /^Confirmer/ })).toBeDisabled();
  });
});

test.describe('crédit auto de bout en bout', () => {
  test('moto Haojue : approuvée, signée, apport pris au coffre Voiture, accordée et livrée par la concession, prélevée à la paie suivante', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/auto/catalogue');
    await page.getByRole('button', { name: 'Motos' }).click();
    await page.getByRole('button', { name: /Simuler la Haojue/ }).click();
    await expect(page.locator('body')).toContainText(/confortable/i);
    await expect(page.locator('body')).toContainText(contient('Montant financé 250 000'));
    await page.getByRole('button', { name: 'Demander la décision' }).click();
    await expect(page.getByText('APPROUVÉ', { exact: false }).first()).toBeVisible();
    await expect(page.locator('body')).toContainText(/1er\s*prélèvement\s*28\s*nov\./i);
    await page.getByRole('link', { name: 'Accepter et signer' }).click();

    // signature : tracé enregistré + accord + code AssureMe
    await expect(page).toHaveURL(/\/auto\/contrat$/);
    await page.getByRole('button', { name: 'Utiliser ma signature enregistrée' }).click();
    const accord = page.locator('label.accord');
    await accord.scrollIntoViewIfNeeded();
    await accord.click({ position: { x: 20, y: 15 } });
    await page.getByRole('button', { name: 'Signer avec mon code AssureMe' }).click();
    await page.locator('input[type=password]').fill('482916');
    await page.getByRole('button', { name: 'Signer le contrat' }).click();
    await expect(page).toHaveURL(/\/auto\/livraison$/);
    await expect(page.locator('body')).toContainText('Contrat signé');

    // l'apport (500 000) est sorti du vrai coffre « Apport voiture » ; le crédit existe mais rien n'est prélevé avant la livraison
    await attendreEnregistrement(page, (e) => e?.credits?.some((c: any) => c.produit === 'auto'));
    let e = await etatEnregistre(page);
    const coffre = e.tranches.coffres.coffres.find((c: any) => c.genre === 'Voiture');
    expect(coffre.epargne).toBe(0);
    expect(coffre.operations[0]).toMatchObject({ type: 'retrait', montant: -500_000 });
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');

    // la concession voit le dossier et le fait avancer jusqu'à la livraison
    await aller(page, '/portail/concession');
    const dossier = page.getByRole('group', { name: /Aïcha Ndiba/ });
    await expect(dossier).toBeVisible();
    await dossier.getByRole('button', { name: 'Passer en étude' }).click();
    await page.getByRole('group', { name: /Aïcha Ndiba/ }).getByRole('button', { name: 'Accorder le financement' }).click();
    await page.getByRole('group', { name: /Aïcha Ndiba/ }).getByRole('button', { name: 'Confirmer la livraison' }).click();
    await attendreEnregistrement(page, (s) => s?.tranches?.auto?.dossiers?.some((d: any) => d.membre && d.etape === 'livree'));

    // à la paie du 28 nov. (la session a expiré : on la rouvre avec le code), la mensualité de 27 038 est prélevée une fois
    await rouvrirEtDeverrouiller(page, JOUR_DE_PAIE);
    await expect.poll(() => solde(page)).toBe(86_500 + 2 * 520_000 - 2 * 69_000 - 27_038);
    await attendreEnregistrement(page, (s) => s?.dernierePaie === '2026-11-28');
    e = await etatEnregistre(page);
    expect(e.credits.find((c: any) => c.produit === 'auto')).toMatchObject({ payees: 1, statut: 'actif' });
    expect(e.mouvements.filter((m: any) => m.titre.startsWith('Mensualité auto'))).toHaveLength(1);
  });
});
