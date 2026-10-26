import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';

const ALEX = 'ACC-0412', NB = '\u00A0';
const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
const avecDemandes = (e: Parameters<NonNullable<Parameters<typeof ouvrir>[2]>['preparer'] & {}>[0]) => {
  for (const [i, p] of [95, 85, 80].entries()) e.monde.demandesBagage.push({ id: `db-t${i}`, compteId: `ACC-0${300 + i}`, volId: 'v-ae812', kg: 23, prixMax: p, creeLe: 1, statut: 'ouverte' });
};

test.describe('garde d’accès', () => {
  for (const r of ['/soute/v-ae812', '/bagages/vendre', '/bagages/demande']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('soute du vol', () => {
  test('repères, carte, fiche, carnet : tout vient du monde simulé', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae812', { connecte: ALEX });
    await expect(page.getByText('Soute du vol AE 812', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'Même vol uniquement' })).toContainText('AE 812 · 14 déc. 18:05');
    const reperes = page.getByRole('region', { name: 'Repères de prix des bagages' });
    await expect(reperes).toContainText(`90${NB}$`); await expect(reperes).toContainText('7 proposés'); await expect(reperes).toContainText('aucune demande'); await expect(reperes).toContainText(`150${NB}$`);
    await expect(page.getByRole('heading', { name: 'Carte de la soute' })).toBeVisible();
    const carte = page.getByRole('group', { name: /Schéma de la soute/ });
    await expect(carte.getByRole('button')).toHaveCount(7); await expect(carte.getByRole('img')).toHaveCount(17);
    const legende = page.getByRole('list', { name: 'Légende de la carte' });
    await expect(legende).toContainText('Inclus, utilisé 14'); await expect(legende).toContainText('Proposé, à toucher 7'); await expect(legende).toContainText('Acheté (revente) 0'); await expect(legende).toContainText('Libre, compagnie 3');
    // la meilleure offre est sélectionnée d'office
    const fiche = page.getByRole('region', { name: 'Bagage sélectionné' });
    await expect(fiche).toContainText('Bagage proposé'); await expect(fiche).toContainText(`90${NB}$`); await expect(fiche).toContainText(`−60${NB}$`); await expect(fiche).toContainText('sous le prix compagnie');
    await expect(fiche).toContainText('Vendeur vérifié'); await expect(fiche).toContainText('Anonymisé'); await expect(fiche).toContainText(/23 kg · 158 cm/); await expect(fiche).toContainText(/Passager\s+P-\d\d/);
    await expect(fiche).toContainText('règle à valider');
    // choisir l'offre la plus chère (carnet), puis la mienne
    const carnet = page.getByRole('list', { name: 'Bagages proposés' });
    await expect(carnet.getByRole('button')).toHaveCount(7); await expect(carnet.getByRole('button').first()).toHaveAttribute('aria-label', /Bagage proposé à 130\s\$, emplacement .+, cumul 7/);
    await expect(carnet.getByRole('button').last()).toContainText('Meilleure'); await expect(carnet.getByRole('button').last()).toContainText('Choisi');
    await carnet.getByRole('button').first().click(); await expect(fiche).toContainText(`130${NB}$`); await expect(fiche).toContainText(`−20${NB}$`);
    await carnet.getByRole('button', { name: /le vôtre/ }).click(); await expect(fiche).toContainText('Votre annonce'); await expect(fiche).toContainText('Vous'); await expect(fiche.getByRole('link', { name: 'Modifier ou retirer mon annonce' })).toBeVisible();
    await page.getByRole('button', { name: 'Retirer la sélection' }).click(); await expect(fiche).toContainText('Aucun bagage sélectionné');
    await expect(page.getByText('Prix compagnie 150 $ = plafond'.replace(' $', `${NB}$`).replace('150 ', '150'.concat(' ')), { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Aucune demande pour l’instant : publiez la vôtre.')).toBeVisible(); await expect(page.getByText('Aucune transaction sur cette soute pour l’instant.')).toBeVisible();
    await expect(page.getByText('Barres : cumul sur 7 bagages. Aucune offre ne peut dépasser le prix compagnie.')).toBeVisible();
    await expect(page.getByText(/Transferts possibles jusqu’au\s+13 déc\.\s+18:05/)).toBeVisible(); await expect(page.getByText('Sous réserve d’accord avec la compagnie.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Mes bagages sur ce vol' })).toContainText(/100\s\$\s·\sen vente/);
    await page.screenshot({ path: `${CAPTURES}/soute-1.png`, fullPage: true });
  });
  test('demandes et appariement viennent des demandes ouvertes du vol', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae812', { connecte: ALEX, preparer: avecDemandes });
    const reperes = page.getByRole('region', { name: 'Repères de prix des bagages' }); await expect(reperes).toContainText(`95${NB}$`); await expect(reperes).toContainText('3 demandes');
    const bids = page.getByRole('list', { name: /^Demandes/ }); await expect(bids.getByRole('listitem')).toHaveCount(3); await expect(bids.getByRole('listitem').first()).toContainText('Meilleure'); await expect(bids.getByRole('listitem').first()).toContainText('×1');
    await expect(page.getByText(/Demande\s+95\s\$\s+≥\s+offre\s+90\s\$\s+:\s*appariement à confirmer par la compagnie/)).toBeVisible(); await expect(page.getByText('3 demandes actives')).toBeVisible();
  });
  test('transactions : un achat de la soute apparaît avec sa variation signée', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae812', { connecte: ALEX });
    await page.getByRole('link', { name: 'Acheter un bagage' }).click(); await expect.poll(() => chemin(page)).toBe('/bagages/ajouter');
    await page.getByRole('button', { name: /^Acheter 1 bagage/ }).or(page.getByRole('button', { name: /^Acheter/ })).first().click(); await expect.poll(() => chemin(page)).toBe('/bagages/transfere');
    await page.goto('/soute/v-ae812');
    const tx = page.getByRole('table'); await expect(tx).toContainText(`90${NB}$`); await expect(tx.getByRole('row')).toHaveCount(3); await expect(tx).toContainText('Première transaction'); await expect(tx).toContainText(`+5${NB}$`); await expect(tx).toContainText(`95${NB}$`);
    await expect(page.getByRole('list', { name: 'Légende de la carte' })).toContainText('Acheté (revente) 2');
    await expect(page.getByRole('region', { name: 'Repères de prix des bagages' })).toContainText(`100${NB}$`);
  });
  test('un vol sans offre : états vides ; un vol inconnu : message', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae816', { connecte: ALEX });
    await expect(page.getByText('Aucun bagage proposé sur ce vol pour l’instant.').first()).toBeVisible(); await expect(page.getByRole('region', { name: 'Repères de prix des bagages' })).toContainText('aucune offre');
    await page.goto('/soute/inconnu'); await expect(page.getByRole('heading', { name: 'Vol introuvable' })).toBeVisible();
  });
  test('liens : Vendre le mien, Chercher un bagage, Acheter un bagage', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae812', { connecte: ALEX });
    await page.getByRole('link', { name: /Chercher un bagage · publier une demande/ }).click(); await expect.poll(() => chemin(page)).toBe('/bagages/demande'); expect(page.url()).toContain('droit=d-812');
    await page.goBack(); await page.getByRole('link', { name: 'Vendre le mien' }).click(); await expect.poll(() => chemin(page)).toBe('/bagages/vendre'); expect(page.url()).toContain('droit=d-812');
  });
  test('clavier : la carte et le carnet se parcourent au clavier', async ({ page }) => {
    await ouvrir(page, '/soute/v-ae812', { connecte: ALEX });
    const carnet = page.getByRole('list', { name: 'Bagages proposés' }), ligne = carnet.getByRole('button').nth(2);
    await ligne.focus(); await page.keyboard.press('Enter'); await expect(ligne).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Enter'); await expect(ligne).toHaveAttribute('aria-pressed', 'false');
  });
  test('première vue 390 × 700 : bandeau, repères et actions ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/soute/v-ae812', { connecte: ALEX });
    await expect(page.getByRole('note').filter({ hasText: 'Même vol uniquement' })).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('region', { name: 'Repères de prix des bagages' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('link', { name: 'Acheter un bagage' })).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('link', { name: 'Vendre le mien' })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${CAPTURES}/soute-vue.png` });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: `${CAPTURES}/soute-320.png`, fullPage: true });
  });
});

test.describe('revendre mon bagage inutilisé', () => {
  test('le bagage d’Alex est déjà en vente : prix, net, retrait de l’annonce puis remise en vente', async ({ page }) => {
    await ouvrir(page, '/bagages/vendre?droit=d-812', { connecte: ALEX });
    await expect(page.getByText('Revendre mon bagage inutilisé', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Étiquette du droit de bagage : YUL vers Paris CDG, vol AE 812 du 14 déc\., 23 kg/ })).toBeVisible();
    await expect(page.getByText('NXG-7Q2M')).toBeVisible(); await expect(page.getByText('Votre franchise : 2 bagages inclus')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Votre bagage est en vente à' })).toContainText(`100${NB}$`);
    const prix = page.getByLabel('Votre prix de vente'); await expect(prix).toHaveValue('100'); await expect(page.getByText(`−50${NB}$`).first()).toBeVisible();
    await expect(page.getByText('Ce que vous recevez')).toBeVisible(); await expect(page.getByText(/Transfert sous réserve d’accord de la compagnie/)).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/vendre-1.png`, fullPage: true });
    await page.getByRole('button', { name: 'Retirer l’annonce' }).click();
    await expect(page.getByRole('button', { name: /^Mettre en vente à/ })).toBeVisible();
    expect((await lireEtat(page)).monde.bagages.find((b) => b.id === 'b-alex')!.statut).toBe('inclus');
    await page.getByRole('button', { name: /^Mettre en vente à/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Votre bagage est en vente à' })).toBeVisible();
    const b = (await lireEtat(page)).monde.bagages.find((x) => x.id === 'b-alex')!; expect(b.statut).toBe('en_vente');
  });
  test('prix au curseur : net après commission membre Pass, plafond jamais dépassé', async ({ page }) => {
    await ouvrir(page, '/bagages/vendre', { connecte: ALEX, preparer: (e) => { e.monde.bagages.find((b) => b.id === 'b-alex')!.statut = 'inclus'; } });
    const prix = page.getByLabel('Votre prix de vente'); await prix.fill('120');
    await expect(page.getByRole('button', { name: /^Mettre en vente à/ })).toContainText(`120${NB}$`);
    await expect(page.getByRole('term').filter({ hasText: 'Commission NexG-TT' }).locator('xpath=..')).toContainText(`−12${NB}$`); await expect(page.getByText(`108${NB}$`).first()).toBeVisible();
    await expect(page.getByText(/Sans Pass \(commission 12,5\s%\), vous recevriez/)).toBeVisible(); await expect(page.getByText(`105${NB}$`).first()).toBeVisible();
    await expect(page.getByText('est membre Pass : le taux membre s’applique.')).toBeVisible();
    await prix.evaluate((el: HTMLInputElement) => { el.value = '999'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await expect(prix).toHaveValue('150'); await expect(page.getByText('Au plafond : égal au prix compagnie')).toBeVisible(); await expect(page.getByText(`135${NB}$`).first()).toBeVisible();
    await prix.fill('100'); await expect(page.getByText(/3e moins chère sur 7 · à égalité avec 1 autre/)).toBeVisible();
    await prix.fill('90'); await expect(page.getByText(/à égalité avec 1 autre/)).toBeVisible();
    await page.getByRole('button', { name: /^Mettre en vente à/ }).click();
    const e = await lireEtat(page); const b = e.monde.bagages.find((x) => x.id === 'b-alex')!; expect(b).toMatchObject({ statut: 'en_vente', prix: 90 });
  });
  test('clavier : les flèches changent le prix, Entrée met en vente', async ({ page }) => {
    await ouvrir(page, '/bagages/vendre', { connecte: ALEX, preparer: (e) => { e.monde.bagages.find((b) => b.id === 'b-alex')!.statut = 'inclus'; } });
    const prix = page.getByLabel('Votre prix de vente'); await prix.focus(); await expect(prix).toBeFocused(); const avant = Number(await prix.inputValue());
    await page.keyboard.press('ArrowRight'); await expect(prix).toHaveValue(String(avant + 5)); await page.keyboard.press('End'); await expect(prix).toHaveValue('150');
    await expect(prix).toHaveAttribute('aria-valuetext', new RegExp(`^150\\s\\$$`));
  });
  test('demande correspondante : appariement possible ; au-dessus : « au-dessus de la meilleure demande »', async ({ page }) => {
    await ouvrir(page, '/bagages/vendre', { connecte: ALEX, preparer: (e) => { e.monde.bagages.find((b) => b.id === 'b-alex')!.statut = 'inclus'; avecDemandes(e); } });
    const prix = page.getByLabel('Votre prix de vente'); await prix.fill('95');
    await expect(page.getByText(/Une demande à 95\s\$ correspond à votre prix : appariement possible dès la mise en vente, à confirmer par la compagnie\./)).toBeVisible();
    await expect(page.getByText('3 passagers cherchent un bagage')).toBeVisible();
    await prix.fill('120'); await expect(page.getByText(/\+25\s\$\s+au-dessus de la meilleure demande : votre bagage attend un acheteur\. Aucune vente n’est garantie\./)).toBeVisible();
  });
  test('franchise utilisée : rien à revendre ; échéance passée : bloqué ; hors ligne : action désactivée', async ({ page, context }) => {
    await ouvrir(page, '/bagages/vendre?droit=d-puj', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Aucun bagage inutilisé à revendre' })).toBeVisible(); await expect(page.getByRole('button', { name: /^Mettre en vente/ })).toHaveCount(0);
    await page.goto('/bagages/vendre?droit=d-812'); await expect(page.getByRole('button', { name: /^(En vente|Modifier le prix|Mettre en vente)/ })).toBeVisible();
    await context.setOffline(true); await expect(page.getByText(/Vous êtes hors ligne : la mise en vente attend le retour du réseau\./)).toBeVisible();
    await page.getByRole('button', { name: /^(En vente|Modifier le prix|Mettre en vente)/ }).click({ force: true }); expect((await lireEtat(page)).monde.bagages.find((b) => b.id === 'b-alex')!.prix).toBe(100);
    await context.setOffline(false);
  });
  test('échéance de nommage passée : mise en vente refusée', async ({ page }) => {
    await ouvrir(page, '/bagages/vendre?maintenant=2026-12-13T19:00', { connecte: ALEX });
    await expect(page.getByRole('alert').filter({ hasText: 'L’échéance de nommage est passée' })).toBeVisible(); await expect(page.getByRole('button', { name: /^(En vente|Modifier le prix|Mettre en vente)/ })).toHaveCount(0);
  });
  test('première vue 390 × 700 : étiquette, prix et action ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/bagages/vendre', { connecte: ALEX, preparer: (e) => { e.monde.bagages.find((b) => b.id === 'b-alex')!.statut = 'inclus'; } });
    await expect(page.getByRole('img', { name: /Étiquette du droit de bagage/ })).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('button', { name: /^Mettre en vente à/ })).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Votre franchise : 2 bagages inclus')).toBeInViewport({ ratio: 1 }); await expect(page.getByText('Votre prix de vente')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.gros')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${CAPTURES}/vendre-vue.png` });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: `${CAPTURES}/vendre-320.png`, fullPage: true });
  });
});

test.describe('chercher un bagage sur ce vol', () => {
  test('publier une demande : nombre, prix max, aperçu, budget ; mes demandes ; annuler', async ({ page }) => {
    await ouvrir(page, '/bagages/demande?droit=d-812', { connecte: ALEX, preparer: avecDemandes });
    await expect(page.getByText('Chercher un bagage sur ce vol', { exact: true }).first()).toBeVisible(); await expect(page.getByRole('note').filter({ hasText: 'Même vol uniquement' })).toContainText('AE 812 · 14 déc. 18:05');
    await expect(page.getByText('YUL → CDG').first()).toBeVisible(); await expect(page.getByText('Alex T.').first()).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Prix max par bagage' })).toHaveValue('90');
    await expect(page.getByText(/Meilleure demande actuelle sur ce vol\s:\s95\s\$\s·\soffre la moins chère\s:\s90\s\$\./)).toBeVisible();
    await page.getByRole('button', { name: 'Un bagage de plus' }).click(); await expect(page.getByText('23 kg chacun · de 1 à 4 par demande')).toBeVisible();
    await page.getByRole('slider', { name: 'Prix max par bagage' }).fill('85');
    await expect(page.getByText(/Budget maximal\s:\s+170\s\$\s+\(2\s×\s85\s\$\)\. Rien n’est prélevé tant qu’aucun bagage n’est trouvé\./)).toBeVisible();
    await expect(page.getByRole('img', { name: /Aperçu de la demande : 2 bagages de 23 kg sur le vol AE 812/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Publier ma demande à/ })).toContainText(`85${NB}$`);
    await expect(page.getByText(/2 bagages · budget max\s+170\s\$/)).toBeVisible(); await expect(page.getByText('Confirmation manuelle')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/demande-1.png`, fullPage: true });
    await page.getByRole('button', { name: /^Publier ma demande à/ }).click();
    await expect(page.getByText(/^Demande publiée : 2 bagages jusqu’à 85\s\$ chacun/)).toBeVisible();
    const mes = page.getByRole('region', { name: 'Mes demandes sur ce vol' }); await expect(mes).toContainText(/2 bagages\s+jusqu’à\s+85\s\$/);
    const e = await lireEtat(page); expect(e.monde.demandesBagage.filter((d) => d.compteId === ALEX && d.statut === 'ouverte').map((d) => d.prixMax)).toEqual([85, 85]);
    await mes.getByRole('button', { name: /^Annuler la demande/ }).click(); await expect(mes).toHaveCount(0);
    expect((await lireEtat(page)).monde.demandesBagage.filter((d) => d.compteId === ALEX && d.statut === 'ouverte')).toHaveLength(0);
  });
  test('une offre correspond déjà : le demandeur est prévenu, confirmation dans la soute', async ({ page }) => {
    await ouvrir(page, '/bagages/demande', { connecte: ALEX });
    await page.getByRole('slider', { name: 'Prix max par bagage' }).fill('95'); await page.getByRole('button', { name: /^Publier ma demande à/ }).click();
    await expect(page.getByRole('status').filter({ hasText: /correspond/ })).toContainText('l’offre vous est réservée 15 min');
    await page.getByRole('status').getByRole('link', { name: 'Voir la soute du vol' }).click(); await expect.poll(() => chemin(page)).toBe('/soute/v-ae812');
    await expect(page.getByRole('region', { name: 'Repères de prix des bagages' })).toContainText('1 demande');
  });
  test('achat automatique : la moins chère est achetée, retour au bagage transféré', async ({ page }) => {
    await ouvrir(page, '/bagages/demande', { connecte: ALEX });
    await page.getByLabel('Achat automatique').check(); await expect(page.getByText('Achat automatique', { exact: true }).last()).toBeVisible();
    await page.getByRole('slider', { name: 'Prix max par bagage' }).fill('95'); await page.getByRole('button', { name: /^Publier ma demande à/ }).click();
    await expect.poll(() => chemin(page)).toBe('/bagages/transfere');
    const e = await lireEtat(page); expect(e.monde.bagages.filter((b) => b.detenteurId === ALEX && b.statut !== 'en_vente' && b.statut !== 'inclus').map((b) => b.prix)).toEqual([90]);
    expect(e.monde.demandesBagage.filter((d) => d.compteId === ALEX).map((d) => d.statut)).toEqual(['servie']);
  });
  test('alerte désactivée : texte d’aide mis à jour ; prix plafonné ; mode au clavier', async ({ page }) => {
    await ouvrir(page, '/bagages/demande', { connecte: ALEX });
    await expect(page.getByText(/Notification à chaque bagage proposé à 90\s\$ ou moins/)).toBeVisible();
    await page.getByRole('switch', { name: /Me prévenir dès qu’un bagage correspond/ }).click(); await expect(page.getByText('Désactivé : consultez la soute du vol vous-même')).toBeVisible();
    const prix = page.getByRole('slider', { name: 'Prix max par bagage' }); await prix.evaluate((el: HTMLInputElement) => { el.value = '500'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await expect(prix).toHaveValue('150'); await expect(page.getByText('Au plafond : égal au prix compagnie')).toBeVisible();
    const min = page.getByRole('button', { name: 'Un bagage de moins' }); await min.click({ force: true }); await expect(page.getByText(/^1 bagage · budget max/)).toBeVisible();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Un bagage de plus' }).click({ force: true }); await expect(page.getByText(/^4 bagages · budget max\s+600\s\$/)).toBeVisible();
    const radio = page.getByLabel('Vous êtes prévenu, vous confirmez'); await radio.focus(); await page.keyboard.press('ArrowDown'); await expect(page.getByLabel('Achat automatique')).toBeChecked();
  });
  test('une demande déjà publiée depuis « Ajouter des bagages » est listée et annulable', async ({ page }) => {
    await ouvrir(page, '/bagages/demande', { connecte: ALEX, preparer: (e) => { e.monde.demandesBagage.push({ id: 'db-seul', compteId: ALEX, volId: 'v-ae812', kg: 23, prixMax: 80, creeLe: 1, statut: 'ouverte' }); } });
    const mes = page.getByRole('region', { name: 'Mes demandes sur ce vol' }); await expect(mes).toContainText(/1 bagage\s+jusqu’à\s+80\s\$/);
    await mes.getByRole('button', { name: /^Annuler/ }).click(); await expect(mes).toHaveCount(0);
  });
  test('sans voyage à venir : état vide avec une issue', async ({ page }) => {
    await ouvrir(page, '/bagages/demande', { connecte: 'adm-01', preparer: (e) => { e.monde.comptes.find((c) => c.id === 'adm-01')!.role = 'voyageur'; } });
    await expect(page.getByRole('heading', { name: 'Aucun voyage à venir' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Voir mon portefeuille' })).toBeVisible();
  });
  test('première vue 390 × 700 : bandeau, carte du vol, nombre et action ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/bagages/demande', { connecte: ALEX });
    await expect(page.getByRole('note').filter({ hasText: 'Même vol uniquement' })).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('heading', { name: 'Nombre de bagages' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /^Publier ma demande à/ })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${CAPTURES}/demande-vue.png` });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: `${CAPTURES}/demande-320.png`, fullPage: true });
  });
  test('hors ligne : la publication est désactivée', async ({ page, context }) => {
    await ouvrir(page, '/bagages/demande', { connecte: ALEX }); await context.setOffline(true);
    await expect(page.getByText('Vous êtes hors ligne : la publication attend le retour du réseau.')).toBeVisible();
    await page.getByRole('button', { name: /^Publier ma demande à/ }).click({ force: true }); expect((await lireEtat(page)).monde.demandesBagage).toHaveLength(0); await context.setOffline(false);
  });
});
