import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const ouvrirAlex = (page: Page, route: string, preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: ALEX, preparer });
/** Alex a déjà nommé le voyageur de son droit AE 812 (avant le chargement). */
const nommerAvant = (e: Etat) => {
  const d = e.monde.droits.find((x) => x.id === 'd-812')!;
  d.statut = 'nomme'; d.pnr = '6K4P9X'; d.voyageur = { prenom: 'Alex', nom: 'Exemple', pourSoi: true, naissance: '1990-03-14' };
  d.chaine.push({ id: 'm-test', quand: Date.parse('2026-10-12T09:00'), type: 'nommage', de: ALEX, vers: ALEX, prix: 0 });
};
const payer = (page: Page) => page.getByRole('button', { name: /^Payer .* \(démo\)$/ });
const remplirCarte = async (page: Page, numero = '4242 4242 4242 4242', exp = '12/28') => {
  await page.getByLabel('Numéro de carte').fill(numero); await page.getByLabel('Expiration (MM/AA)').fill(exp); await page.getByLabel('Code de sécurité').fill('123'); await page.getByLabel('Nom sur la carte').fill('ALEX T. (TEST)');
};

test.describe('garde d’accès', () => {
  for (const r of ['/paiement/revente%3Ad-r816', '/confirmation/d-812', '/voyage/d-812', '/nommer/d-812', '/pret-a-voyager/d-812']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('paiement (démo)', () => {
  test('récapitulatif de la revente, bandeau démo et premier regard à 390 × 700', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await expect(page.getByRole('note').filter({ hasText: 'MODE DÉMO — aucun paiement réel' })).toBeVisible();
    await expect(page.getByText('YUL → CDG')).toBeVisible(); await expect(page.getByText('ven. 18 déc. · 18:05 · Aérolys 816')).toBeVisible(); await expect(page.getByText('Revente', { exact: true })).toBeVisible();
    await expect(page.getByText('Billet (droit de voyage)')).toBeVisible(); await expect(page.locator('dd').first()).toHaveText(/^1\s500\s\$$/);
    await expect(page.getByText('Frais de service')).toBeVisible(); await expect(page.getByText('hypothèse', { exact: true })).toBeVisible(); await expect(page.locator('dd').nth(1)).toHaveText(/^0\s\$$/);
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    const bouton = payer(page); await expect(bouton).toHaveText(/Payer\s1\s500\s\$\s\(démo\)/);
    const b = (await bouton.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700); expect(b.y).toBeGreaterThan(400);
    await expect(page.getByRole('radio', { name: /Carte/ })).toBeChecked(); await expect(page.getByLabel('Numéro de carte')).toBeVisible(); await expect(page.getByText('4242 4242 4242 4242 — carte de test')).toBeVisible();
    await page.screenshot({ path: '/tmp/achat-paiement.png' });
  });

  test('règle de revente à cocher, erreurs de carte, puis paiement : le droit passe à Alex, aucune carte conservée', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await payer(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cochez cette case pour continuer.' })).toBeVisible();
    await expect(page.getByText('Entrez le numéro de la carte.')).toBeVisible();
    await expect(page.getByLabel('Numéro de carte')).toBeFocused();
    await page.getByLabel('Numéro de carte').fill('4242 4242 4242 4241'); await expect(page.getByText('Ce numéro de carte n’est pas valide : vérifiez les chiffres.')).toBeVisible();
    await page.getByLabel('Expiration (MM/AA)').fill('1327'); await expect(page.getByLabel('Expiration (MM/AA)')).toHaveValue('13/27'); await expect(page.getByText('Mois invalide : de 01 à 12.')).toBeVisible();
    await expect(page.getByLabel('Expiration (MM/AA)')).toHaveAttribute('aria-invalid', 'true');
    await remplirCarte(page); await expect(page.getByText('Mois invalide : de 01 à 12.')).toHaveCount(0);
    await page.getByLabel(/J’accepte les règles de revente et de finalisation/).check(); await expect(page.getByText('Vous devrez nommer le voyageur au plus tard le jeu. 17 déc. à 18:05.')).toBeVisible();
    await payer(page).click(); await expect(page.getByRole('button', { name: /Traitement du paiement/ })).toBeVisible();
    await expect.poll(() => chemin(page)).toBe('/confirmation/d-r816');
    const e = await lireEtat(page); const d = e.monde.droits.find((x) => x.id === 'd-r816')!;
    expect(d.detenteurId).toBe(ALEX); expect(d.statut).toBe('detenu'); expect(d.chaine.at(-1)?.type).toBe('revente');
    const brut = JSON.stringify(e); expect(brut).not.toContain('4242 4242'); expect(brut).not.toContain('4242424242'); expect(brut).not.toContain('ALEX T. (TEST)');
  });

  test('refus simulé (carte 0002) : message clair, on peut réessayer avec une autre carte', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/neuf%3Av-ae816');
    await expect(page.getByText('Neuf', { exact: true })).toBeVisible(); await expect(payer(page)).toHaveText(/Payer\s2\s050\s\$/);
    await remplirCarte(page, '4000 0000 0000 0002'); await page.getByLabel(/J’accepte les règles/).check(); await payer(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Paiement refusé par la banque' })).toBeVisible(); expect(chemin(page)).toBe('/paiement/neuf%3Av-ae816');
    expect((await lireEtat(page)).monde.droits.filter((d) => d.volId === 'v-ae816' && d.detenteurId === ALEX)).toHaveLength(0);
    await page.getByLabel('Numéro de carte').fill('4242 4242 4242 4242'); await payer(page).click();
    await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\/d-/);
    const e = await lireEtat(page); expect(e.monde.droits.some((d) => d.volId === 'v-ae816' && d.detenteurId === ALEX && d.origine === 'neuf')).toBe(true);
  });

  test('wallet du téléphone : explication, puis achat d’une offre d’agence', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/agence%3Aoa-1');
    await expect(page.getByText('Agence', { exact: true })).toBeVisible(); await expect(page.getByText('YUL → CDG')).toBeVisible();
    await page.getByRole('radio', { name: /Wallet du téléphone/ }).check(); await expect(page.getByText(/aucune fenêtre réelle ne s’ouvre/)).toBeVisible(); await expect(page.getByLabel('Numéro de carte')).toHaveCount(0);
    await page.getByLabel(/J’accepte les règles/).check(); await payer(page).click(); await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\/d-/);
    expect((await lireEtat(page)).monde.droits.some((d) => d.origine === 'agence' && d.detenteurId === ALEX)).toBe(true);
  });

  test('mobile money : numéro invalide, refus (…00), puis succès', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/neuf%3Av-ae816'); await page.getByRole('radio', { name: /Mobile money/ }).check();
    await expect(page.getByText('Numéro fictif. Le compte mobile money doit être à votre nom.')).toBeVisible(); await expect(page.getByText(/Un code de confirmation vous sera envoyé/)).toBeVisible();
    await page.getByLabel(/J’accepte les règles/).check(); await payer(page).click(); await expect(page.getByText('Entrez votre numéro de téléphone mobile money.')).toBeVisible();
    await page.getByLabel('Numéro de téléphone (mobile money)').fill('+1 514 555 0100'); await payer(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Paiement refusé par l’opérateur mobile money' })).toBeVisible();
    await page.getByLabel('Numéro de téléphone (mobile money)').fill('+1 514 555 0142'); await payer(page).click(); await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\/d-/);
  });

  test('offre devenue indisponible : annonce retirée, identifiant inconnu', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816', (e) => { const d = e.monde.droits.find((x) => x.id === 'd-r816')!; d.statut = 'detenu'; delete d.annonce; });
    await expect(page.getByRole('alert').filter({ hasText: 'Offre indisponible' })).toBeVisible(); await expect(page.getByText(/vient d’être vendu ou retiré/)).toBeVisible(); await expect(payer(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Voir d’autres offres' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
  });
  test('sa propre annonce ne s’achète pas', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-hav'); await expect(page.getByRole('alert').filter({ hasText: 'Vous ne pouvez pas acheter votre propre annonce.' })).toBeVisible();
  });
  test('hors ligne : message clair, aucun paiement', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/neuf%3Av-ae816'); await remplirCarte(page); await page.getByLabel(/J’accepte les règles/).check();
    await page.context().setOffline(true); await expect(page.getByRole('alert').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible();
    await payer(page).click({ force: true }); expect(chemin(page)).toBe('/paiement/neuf%3Av-ae816'); await expect(page.getByRole('button', { name: /Traitement/ })).toHaveCount(0);
    await page.context().setOffline(false); await expect(page.getByText('Vous êtes hors ligne')).toHaveCount(0);
  });
  test('au clavier : les moyens se choisissent aux flèches, Entrée dans un champ envoie le formulaire', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/neuf%3Av-ae816');
    await page.getByRole('radio', { name: /Carte/ }).focus(); await page.keyboard.press('ArrowDown'); await expect(page.getByRole('radio', { name: /Wallet du téléphone/ })).toBeChecked();
    await page.keyboard.press('ArrowDown'); await expect(page.getByRole('radio', { name: /Mobile money/ })).toBeChecked();
    await page.getByLabel('Numéro de téléphone (mobile money)').fill('+1 514 555 0142'); await page.getByLabel(/J’accepte les règles/).focus(); await page.keyboard.press('Space');
    await page.getByLabel('Numéro de téléphone (mobile money)').press('Enter'); await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\/d-/);
  });
});

test.describe('confirmation', () => {
  test('« Vous détenez ce droit de voyage », référence, payé, échéance, trois étapes et deux actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrirAlex(page, '/confirmation/d-812');
    await expect(page.getByRole('heading', { name: 'Vous détenez ce droit de voyage', level: 1 })).toBeVisible(); await expect(page.getByText('Paiement de démonstration accepté — aucun débit réel.')).toBeVisible();
    await expect(page.getByText('YUL', { exact: true })).toBeVisible(); await expect(page.getByText('CDG', { exact: true })).toBeVisible(); await expect(page.getByText(/lun\. 14 déc\. 2026 · 18:05 → 07:10 \(\+1\) · Aérolys 812 · Économie/)).toBeVisible();
    await expect(page.getByText('À nommer avant le 13 déc. 18:05')).toBeVisible(); await expect(page.getByText('NXG-7Q2M')).toBeVisible(); await expect(page.getByText('Payé (démo)')).toBeVisible();
    await expect(page.getByText('Gardez-le, revendez-le ou transférez-le')).toBeVisible(); await expect(page.getByText('Nommez le voyageur au plus tard à J-1')).toBeVisible(); await expect(page.getByText('La compagnie émet le billet nominatif')).toBeVisible();
    const voir = page.getByRole('link', { name: 'Voir mon portefeuille' }), nommer = page.getByRole('link', { name: 'Nommer le voyageur maintenant' });
    await expect(voir).toHaveAttribute('href', '/portefeuille'); await expect(nommer).toHaveAttribute('href', '/nommer/d-812');
    const b = (await nommer.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: '/tmp/achat-confirmation.png' });
    await nommer.click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
  });
  test('le droit d’un autre compte est introuvable', async ({ page }) => {
    await ouvrirAlex(page, '/confirmation/d-8wc2'); await expect(page.getByRole('alert').filter({ hasText: 'Droit introuvable' })).toBeVisible();
  });
});

test.describe('mon voyage', () => {
  test('J-63, compte à rebours, route, échéance et préparation (cases mémorisées)', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-812');
    await expect(page.getByRole('heading', { name: 'Mon voyage' }).or(page.getByText('Mon voyage', { exact: true }).first())).toBeVisible();
    await expect(page.getByText('Montréal → Paris')).toBeVisible(); await expect(page.getByText('À nommer', { exact: true }).first()).toBeVisible(); await expect(page.getByText('J-63', { exact: true })).toBeVisible();
    await expect(page.getByText('lun. 14 déc.', { exact: true })).toBeVisible(); await expect(page.getByText('2026 · Aérolys 812')).toBeVisible();
    await expect(page.getByText('Décollage dans')).toBeVisible(); await expect(page.getByRole('timer').first()).toHaveText(/^63 j \d\d:\d\d:\d\d$/);
    await expect(page.getByText('Direct · 7 h 05 · droit de voyage NXG-7Q2M')).toBeVisible();
    await expect(page.getByText('Vous détenez ce billet')).toBeVisible(); await expect(page.getByText('Détenteur : Alex T.')).toBeVisible();
    await expect(page.getByText('Jusqu’à J-1, le billet peut encore changer de mains')).toBeVisible(); await expect(page.getByText('Revendre, transférer ou échanger reste possible pendant 62 jours.')).toBeVisible();
    await expect(page.getByText('dim. 13 déc. · 18:05')).toBeVisible(); await expect(page.getByText('Échéance J-1')).toBeVisible();
    await expect(page.getByText('mar. 15 déc. · 07:10, heure de Paris')).toBeVisible(); await expect(page.getByText('Paris-Charles de Gaulle')).toBeVisible();
    await expect(page.getByText('Prêt : 0 / 4')).toBeVisible(); await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await page.getByLabel(/Passeport valide/).check(); await page.getByLabel(/Bagages : 2 inclus, 1 utilisé/).check(); await expect(page.getByText('Prêt : 2 / 4')).toBeVisible();
    await expect(page.getByText('Vérifiez les exigences d’entrée en France')).toBeVisible(); await expect(page.getByText('2 × 23 kg en soute avec votre tarif (hypothèse démo). Le 2e reste libre.')).toBeVisible();
    await expect(page.getByText('Paris a 6 h d’avance sur Montréal en décembre. Arrivée 07:10 à Paris, soit 01:10 à Montréal.')).toBeVisible(); await expect(page.getByText('+6 h', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText('Prêt : 2 / 4')).toBeVisible(); await expect(page.getByLabel(/Passeport valide/)).toBeChecked();
    await expect(page.getByRole('link', { name: 'Nommer le voyageur' })).toHaveAttribute('href', '/nommer/d-812'); await expect(page.getByRole('link', { name: /Gérer mes bagages/ })).toHaveAttribute('href', '/bagages');
    await expect(page.getByRole('link', { name: /Revendre ce billet/ })).toHaveAttribute('href', '/revendre/d-812'); await expect(page.getByRole('link', { name: /Transférer à un proche/ })).toHaveAttribute('href', '/transferer/d-812');
    await expect(page.getByRole('link', { name: 'Chaîne de détention' })).toHaveAttribute('href', '/droit/d-812');
    await expect(page.getByText('Ouvre le verso · revente possible jusqu’au 13 déc. 18:05.')).toBeVisible();
    await page.screenshot({ path: '/tmp/achat-voyage.png', fullPage: true });
  });
  test('première vue à 390 × 700 : J-63, compte à rebours et le début de la route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/voyage/d-812');
    for (const t of ['J-63', 'Décollage dans', 'La route jusqu’à Paris']) { const b = (await page.getByText(t, { exact: true }).first().boundingBox())!; expect(b.y + b.height, t).toBeLessThanOrEqual(700); }
  });
  test('un droit déjà nommé : badge « Nommé — prêt », revente et transfert fermés', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-812', nommerAvant);
    await expect(page.getByText('Nommé — prêt', { exact: true })).toBeVisible(); await expect(page.getByText('Revente et transfert fermés')).toBeVisible(); await expect(page.getByRole('link', { name: /Revendre ce billet/ })).toHaveCount(0);
    await expect(page.getByText('Prêt : 1 / 4')).toBeVisible(); await expect(page.getByText('ALEX EXEMPLE · transmis à Aérolys')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir ma carte d’embarquement' })).toHaveAttribute('href', '/pret-a-voyager/d-812');
  });
  test('ouvert après l’échéance : l’application nomme le détenteur par défaut, revente et nommage sont fermés', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-812?maintenant=2026-12-13T19:00');
    await expect(page.getByText('Nommé — prêt', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: /Revendre ce billet/ })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Nommer le voyageur', exact: true })).toHaveCount(0);
  });
  test('l’échéance passe pendant la visite : les échanges se ferment sans recharger', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-12-13T18:04:30') });
    await ouvrirAlex(page, '/voyage/d-812?maintenant=2026-12-13T18:04:30');
    await expect(page.getByRole('link', { name: /Revendre ce billet/ })).toBeVisible(); await expect(page.getByText('Jusqu’à J-1, le billet peut encore changer de mains')).toBeVisible();
    await page.clock.fastForward('01:00');
    await expect(page.getByText('Les échanges sont fermés')).toBeVisible(); await expect(page.getByRole('link', { name: /Revendre ce billet/ })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Nommer le voyageur', exact: true })).toHaveCount(0);
  });
  test('un autre vol affiche ses propres données (Punta Cana, vol NO 905)', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-puj'); await expect(page.getByText('Montréal → Punta Cana')).toBeVisible(); await expect(page.getByText('2027 · Nordelle 905')).toBeVisible(); await expect(page.getByText('Vérifiez les exigences d’entrée en République dominicaine')).toBeVisible();
  });
  test('le droit d’un autre compte est introuvable', async ({ page }) => { await ouvrirAlex(page, '/voyage/d-8wc2'); await expect(page.getByRole('alert').filter({ hasText: 'Voyage introuvable' })).toBeVisible(); });
});

test.describe('nommer le voyageur', () => {
  test('échéance, « Qui voyage ? », avertissement définitif et confirmation obligatoire', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/nommer/d-812');
    await expect(page.getByText('Échéance de finalisation')).toBeVisible(); await expect(page.getByText(/Il reste 62 j (9|10) h · échéance 13 déc\. 18:05/)).toBeVisible(); /* 10 h : le passage à l’heure normale ajoute une heure réelle */
    await expect(page.getByText('Après l’échéance, plus aucune transaction n’est possible sur ce billet.')).toBeVisible();
    await expect(page.getByText('YUL → CDG')).toBeVisible(); await expect(page.getByText(/Lun\. 14 déc\. 2026 · 18:05/)).toBeVisible();
    await expect(page.getByRole('radio', { name: /Moi \(Alex T\.\)/ })).toBeChecked(); await expect(page.getByText('Données de votre profil, à vérifier')).toBeVisible();
    await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Tremblay'); await expect(page.getByLabel('Prénom(s)')).toHaveValue('Alex');
    await expect(page.getByText('Voyageur transmis')).toBeVisible(); await expect(page.locator('.nom')).toHaveText('ALEX TREMBLAY');
    const bouton = page.getByRole('button', { name: /Confirmer et transmettre à Aérolys/ });
    await expect(bouton).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Cochez la confirmation pour continuer.')).toBeVisible();
    const b = (await bouton.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: '/tmp/achat-nommer.png' });
    await bouton.click({ force: true }); await expect(page.getByLabel(/Je confirme que ces informations/)).toBeFocused(); expect(chemin(page)).toBe('/nommer/d-812');
    await page.getByLabel(/Je confirme que ces informations/).check(); await expect(bouton).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Action définitive', { exact: false }).first()).toBeVisible();
  });
  test('erreurs de saisie : nom vide, date de naissance absente ou future, numéro de document invalide', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812'); await page.getByRole('radio', { name: /Nouveau voyageur/ }).check();
    await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(''); await expect(page.getByText('À compléter')).toBeVisible();
    await page.getByLabel(/Je confirme que ces informations/).check(); const bouton = page.getByRole('button', { name: /Confirmer et transmettre/ }); await bouton.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Indiquez le nom tel qu’inscrit sur le passeport.' })).toBeVisible(); await expect(page.getByText('Indiquez le ou les prénoms tels qu’inscrits sur le passeport.')).toBeVisible(); await expect(page.getByText('Indiquez la date de naissance.')).toBeVisible();
    await expect(page.getByLabel('Nom', { exact: true })).toBeFocused(); await expect(page.getByLabel('Nom', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Nom', { exact: true }).fill('Roy'); await page.getByLabel('Prénom(s)').fill('Léa Marie'); await page.getByLabel('Date de naissance').fill('2001-05-09'); await page.getByLabel(/Numéro de document/).fill('AB1');
    await bouton.click(); await expect(page.getByText('Numéro invalide : 6 à 12 lettres ou chiffres.')).toBeVisible(); await expect(page.getByLabel(/Numéro de document/)).toBeFocused(); await expect(page.locator('.nom')).toHaveText('LÉA MARIE ROY');
    expect(chemin(page)).toBe('/nommer/d-812'); expect((await lireEtat(page)).monde.droits.find((d) => d.id === 'd-812')!.statut).toBe('detenu');
  });
  test('un proche enregistré se choisit dans la liste', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812'); await page.getByRole('radio', { name: /Un proche enregistré/ }).check();
    await expect(page.getByLabel('Nom', { exact: true })).toHaveCount(0); await expect(page.getByText('À choisir', { exact: true })).toBeVisible();
    await page.getByLabel(/Je confirme que ces informations/).check(); await page.getByRole('button', { name: /Confirmer et transmettre/ }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Choisissez le proche qui voyage.' })).toBeVisible();
    await page.getByRole('radio', { name: /Camille Tremblay/ }).check(); await expect(page.locator('.nom')).toHaveText('CAMILLE TREMBLAY'); await page.getByRole('button', { name: /Confirmer et transmettre/ }).click();
    await expect.poll(() => chemin(page)).toBe('/pret-a-voyager/d-812');
    const d = (await lireEtat(page)).monde.droits.find((x) => x.id === 'd-812')!; expect(d.voyageur).toMatchObject({ prenom: 'Camille', nom: 'Tremblay', pourSoi: false, compteId: 'ACC-0187' });
  });
  test('sans proche enregistré : état vide et accès au formulaire', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812', (e) => { e.monde.comptes.find((c) => c.id === ALEX)!.proches = []; });
    await page.getByRole('radio', { name: /Un proche enregistré/ }).check(); await expect(page.getByText('Aucun proche enregistré pour l’instant')).toBeVisible();
    await page.getByRole('button', { name: 'Saisir un nouveau voyageur' }).click(); await expect(page.getByRole('radio', { name: /Nouveau voyageur/ })).toBeChecked(); await expect(page.getByLabel('Nom', { exact: true })).toBeVisible();
  });
  test('parcours : nouveau voyageur → transmission → prêt à voyager (le billet devient nominatif)', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812'); await page.getByRole('radio', { name: /Nouveau voyageur/ }).check();
    await page.getByLabel('Nom', { exact: true }).fill('Exemple'); await page.getByLabel('Prénom(s)').fill('Alex'); await page.getByLabel('Date de naissance').fill('1990-03-14'); await page.getByLabel(/Genre/).selectOption('X');
    await page.getByLabel(/Je confirme/).check(); await page.getByRole('button', { name: /Confirmer et transmettre à Aérolys/ }).click();
    await expect.poll(() => chemin(page)).toBe('/pret-a-voyager/d-812');
    const e = await lireEtat(page), d = e.monde.droits.find((x) => x.id === 'd-812')!;
    expect(d.statut).toBe('nomme'); expect(d.voyageur).toMatchObject({ prenom: 'Alex', nom: 'Exemple', naissance: '1990-03-14', genre: 'X', pourSoi: false }); expect(d.chaine.at(-1)?.type).toBe('nommage'); expect(d.pnr).toMatch(/^[2-9A-Z]{6}$/);
    await expect(page.getByRole('heading', { name: 'ALEX EXEMPLE' })).toBeVisible();
  });
  test('échéance passée pendant la visite : lecture seule', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-12-13T18:04:30') });
    await ouvrirAlex(page, '/nommer/d-812?maintenant=2026-12-13T18:04:30'); await expect(page.getByLabel('Nom', { exact: true })).toBeVisible();
    await page.clock.fastForward('01:00');
    await expect(page.getByRole('alert').filter({ hasText: 'L’échéance est passée' })).toBeVisible(); await expect(page.getByText('Le nommage est fermé')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmer et transmettre/ })).toHaveCount(0); await expect(page.getByLabel('Nom', { exact: true })).toHaveCount(0);
  });
  test('ouvert après l’échéance : le détenteur voyage (nommé par défaut), plus de nommage possible', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812?maintenant=2026-12-13T19:00'); await expect(page.getByText('Le voyageur est déjà nommé')).toBeVisible(); await expect(page.getByLabel('Nom', { exact: true })).toHaveCount(0);
  });
  test('volets : dernier jour (3 h 12 min restantes) puis déjà nommé', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812?maintenant=2026-12-13T14:53'); await expect(page.getByText(/Il reste 3 h 1\d min · échéance 13 déc\. 18:05/)).toBeVisible();
  });
  test('un droit déjà nommé renvoie à la carte d’embarquement', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812', nommerAvant); await expect(page.getByText('Le voyageur est déjà nommé')).toBeVisible(); await page.getByRole('link', { name: 'Voir la carte d’embarquement' }).click(); await expect.poll(() => chemin(page)).toBe('/pret-a-voyager/d-812');
  });
  test('hors ligne : la transmission attend le réseau', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812'); await page.getByLabel('Date de naissance').fill('1990-03-14'); await page.getByLabel(/Je confirme/).check();
    await page.context().setOffline(true); await expect(page.getByRole('alert').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible();
    await page.getByRole('button', { name: /Confirmer et transmettre/ }).click(); expect(chemin(page)).toBe('/nommer/d-812'); expect((await lireEtat(page)).monde.droits.find((d) => d.id === 'd-812')!.statut).toBe('detenu'); await page.context().setOffline(false);
  });
});

test.describe('prêt à voyager', () => {
  test('carte d’embarquement « Nommé — prêt », sans code, chaîne finalisée, ajout simulé au wallet', async ({ page }) => {
    await ouvrirAlex(page, '/pret-a-voyager/d-812', nommerAvant);
    await expect(page.getByText('Nom transmis à Aérolys le 12 oct. 2026 (démo)')).toBeVisible(); await expect(page.getByText('Nommé — prêt à voyager')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ALEX EXEMPLE' })).toBeVisible(); await expect(page.getByText('18:05', { exact: true })).toBeVisible(); await expect(page.getByText('07:10', { exact: false }).first()).toBeVisible(); await expect(page.getByText('Direct · 7 h 05')).toBeVisible();
    await expect(page.getByText('Aérolys 812', { exact: true }).first()).toBeVisible(); await expect(page.getByText('14 déc. 2026', { exact: true })).toBeVisible(); await expect(page.getByText('À choisir auprès de la compagnie')).toBeVisible();
    await expect(page.getByText('6K4P9X')).toBeVisible(); await expect(page.getByText('(fictive)')).toBeVisible(); await expect(page.getByText('1 × 23 kg')).toBeVisible();
    await expect(page.getByText('Carte d’embarquement émise par Aérolys à l’enregistrement')).toBeVisible(); await expect(page.getByText('Aucun code ici : seule la compagnie l’émet.')).toBeVisible();
    await expect(page.locator('canvas, img[src*="qr"], svg[aria-label*="QR"]')).toHaveCount(0);
    await expect(page.getByText('Ce billet ne peut plus être revendu.')).toBeVisible(); await expect(page.getByText('NXG-7Q2M').first()).toBeVisible();
    await expect(page.getByText('Chaîne de détention')).toBeVisible(); await expect(page.getByText('Finalisée', { exact: true })).toBeVisible(); await expect(page.getByText('Achat neuf')).toBeVisible(); await expect(page.getByText('Alex T. devient détenteur · 1 000 $')).toBeVisible();
    await expect(page.getByText('Finalisation — voyageur nommé')).toBeVisible(); await expect(page.getByText('Alex Exemple, transmis à la compagnie. Revente et transfert fermés.')).toBeVisible(); await expect(page.getByText('Départ YUL → CDG')).toBeVisible();
    const wallet = page.getByRole('button', { name: 'Ajouter au portefeuille du téléphone' }); await wallet.click(); await expect(page.getByRole('button', { name: 'Ajouté au portefeuille du téléphone' })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByText('Démo : aucun ajout réel n’a été effectué.')).toBeVisible();
    await page.reload(); await expect(page.getByRole('button', { name: 'Ajouté au portefeuille du téléphone' })).toBeVisible();
    await page.screenshot({ path: '/tmp/achat-pret.png', fullPage: true });
    await expect(page.getByRole('link', { name: /Retour au portefeuille/ })).toHaveAttribute('href', '/portefeuille');
  });
  test('un billet pas encore nommé renvoie à la finalisation', async ({ page }) => {
    await ouvrirAlex(page, '/pret-a-voyager/d-812'); await expect(page.getByText('Le voyageur n’est pas encore nommé')).toBeVisible(); await page.getByRole('link', { name: 'Nommer le voyageur' }).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
  });
  test('le droit d’un autre compte est introuvable', async ({ page }) => { await ouvrirAlex(page, '/pret-a-voyager/d-8wc2'); await expect(page.getByRole('alert').filter({ hasText: 'Droit introuvable' })).toBeVisible(); });
});

test.describe('petits écrans (320 px) et tout le parcours', () => {
  const routes: [string, ((e: Etat) => void) | undefined][] = [['/paiement/revente%3Ad-r816', undefined], ['/confirmation/d-812', undefined], ['/voyage/d-812', undefined], ['/nommer/d-812', undefined], ['/pret-a-voyager/d-812', nommerAvant], ['/voyage/d-puj', undefined]];
  for (const [r, p] of routes) {
    test(`aucun débordement horizontal à 320 px : ${r}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, r, p); await expect(page.getByRole('heading').first()).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    });
  }
  test('paiement à 320 px : méthode mobile money et erreurs sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, '/paiement/neuf%3Av-ae816'); await payer(page).click(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('radio', { name: /Mobile money/ }).check(); expect(await sansDebordement(page)).toBe(true);
  });
  test('de l’achat à l’embarquement : paiement → confirmation → nommer → prêt à voyager', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await remplirCarte(page); await page.getByLabel(/J’accepte les règles/).check(); await payer(page).click();
    await expect.poll(() => chemin(page)).toBe('/confirmation/d-r816'); await expect(page.getByText('NXG-3K9X')).toBeVisible(); await expect(page.getByText('À nommer avant le 17 déc. 18:05')).toBeVisible();
    await page.getByRole('link', { name: 'Nommer le voyageur maintenant' }).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-r816'); await expect(page.getByText('Il reste 66 j')).toBeVisible();
    await page.getByLabel('Date de naissance').fill('1990-03-14'); await page.getByLabel(/Je confirme/).check(); await page.getByRole('button', { name: /Confirmer et transmettre/ }).click();
    await expect.poll(() => chemin(page)).toBe('/pret-a-voyager/d-r816'); await expect(page.getByRole('heading', { name: 'ALEX TREMBLAY' })).toBeVisible(); await expect(page.getByText('Aérolys 816', { exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: /Retour au portefeuille/ }).click(); await expect.poll(() => chemin(page)).toBe('/portefeuille');
  });
});
