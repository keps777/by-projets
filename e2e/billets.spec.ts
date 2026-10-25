// Page Billets (/pass) : « Sans réseau », « Moto-taxi vers la gare », « Partager », « Annuler » et « Problème » s'ouvrent dans des fenêtres (l'adresse ne change pas) ;
// autocomplétion du lieu de départ, estimation d'arrivée d'après les véhicules connectés, espèces (commission AfriMove due), sélecteur « Ton bus » (billets pour des proches), repris par /direct.
import type { Locator, Page } from '@playwright/test';
import { billetAichaSur, expect, lireEtat as lireBrut, ouvrir, test, type Ouverture } from './aide';
import { sceller } from '../src/core/sceau.ts';
import type { Etat } from '../src/domain/types.ts';

// la tranche `route` / `reglement` lue dans le stockage (types larges)
const lireEtat = async (page: Page) => { const e = await lireBrut(page); return { ...e, tranches: e.tranches as Record<string, any> }; };
const CAPTURES = process.env.AM_CAPTURES ?? '';
const shot = async (page: Page, nom: string) => { if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/${nom}.png` }); };
const DEPART_MARIE = 'd-2026-11-04-BX-Classique-mvan-aller-0900'; // après le bus d'Aïcha (demain 08:00)
const DEPART_AICHA_AUJOURDHUI = 'd-2026-11-03-BX-Classique-mvan-aller-0900'; // le « jour du voyage » : 09:00, dans 2 h

/** Aïcha a aussi acheté un billet pour Marie (sa mère), place 7B du bus de 09:00 demain. */
function billetPourMarie(e: Etat): void {
  const base = e.monde.billets.find((b) => b.id === 'b-aicha1')!, pBase = e.monde.paiements.find((p) => p.id === base.paiementId)!, d = e.monde.departs.find((x) => x.id === DEPART_MARIE)!;
  const code = 'AM9K2P47', nom = 'Marie Ndiba';
  e.monde.paiements.push({ ...pBase, id: 'pay-marie', montant: d.prix, pour: { type: 'billet', ids: ['b-marie'] } });
  e.monde.billets.push({ ...base, id: 'b-marie', code, departId: d.id, siege: '7B', passager: { nom, tel: '677000111' }, prix: d.prix, paiementId: 'pay-marie', creeLe: base.creeLe + 1, sceau: sceller({ code, departId: d.id, siege: '7B', nom }) });
}
const ouvrirBillets = (page: Page, o: Ouverture = {}) => ouvrir(page, '/pass', { connecte: 'p-aicha', ...o });
const fenetre = (page: Page, titre: string | RegExp) => page.getByRole('dialog', { name: titre });
const courseAujourdhui = (e: Etat) => billetAichaSur(e, DEPART_AICHA_AUJOURDHUI);

test.describe('Billets : des fenêtres, pas de nouvelles pages', () => {
  test('chaque bouton ouvre sa fenêtre sans changer d’adresse, Échap la ferme', async ({ page }) => {
    await ouvrirBillets(page);
    await expect(page.getByText('AM-7F3K-22')).toBeVisible();
    const adresse = page.url();
    const cas: [string, string | RegExp, Locator][] = [
      ['Sans réseau', 'Sans réseau', page.getByText('sceau vérifié sur ce téléphone')],
      ['Moto-taxi vers la gare', 'Moto-taxi vers la gare', page.getByRole('combobox', { name: 'Je pars de' })],
      ['Partager', 'Partager mon billet', page.getByRole('link', { name: 'Envoyer sur WhatsApp' })],
      ['Annuler', 'Annuler ce billet', page.getByRole('button', { name: 'Confirmer l’annulation' })],
      ['Problème', 'Signaler un problème', page.getByRole('button', { name: /^Envoyer · réponse sous 2 h/ })]
    ];
    for (const [bouton, titre, contenu] of cas) {
      const declencheur = page.getByRole('button', { name: bouton, exact: true });
      await declencheur.click();
      const f = fenetre(page, titre);
      await expect(f).toBeVisible();
      await expect(contenu).toBeVisible();
      expect(page.url(), `${bouton} ne change pas l’adresse`).toBe(adresse);
      await page.waitForTimeout(500); // la fenêtre a fini de monter
      await shot(page, `fenetre-${bouton.toLowerCase().replace(/[^a-z]+/g, '-')}`);
      await page.keyboard.press('Escape');
      await expect(f).toBeHidden();
      await expect(declencheur).toBeFocused(); // le focus revient au bouton
    }
    expect(page.url()).toBe(adresse);
  });

  test('le bouton s’appelle « Moto-taxi vers la gare » et la fenêtre dit vers quelle gare', async ({ page }) => {
    await ouvrirBillets(page);
    await expect(page.getByRole('button', { name: /Moto vers la gare/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Moto-taxi vers la gare' }).click();
    const f = fenetre(page, 'Moto-taxi vers la gare');
    await expect(f.getByText('Vers la gare de Mvan · bus de 08:00')).toBeVisible();
    await expect(f.getByRole('group', { name: 'Véhicule' }).getByRole('button', { name: /Moto/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(f.getByRole('group', { name: 'Véhicule' }).getByRole('button', { name: /Taxi/ })).toBeVisible();
  });

  test('liens profonds : /course, /litige et /proche?billet= restent des pages', async ({ page }) => {
    await ouvrirBillets(page);
    await page.evaluate(() => { history.pushState({}, '', '/course'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('combobox', { name: 'Je pars de' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => { history.pushState({}, '', '/litige?billet=b-aicha1'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByTestId('cible')).toContainText('Yaoundé → Douala');
    await page.evaluate(() => { history.pushState({}, '', '/proche?billet=b-aicha1'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('link', { name: 'Envoyer sur WhatsApp' })).toBeVisible();
  });
});

test.describe('Moto-taxi : lieu avec autocomplétion, arrivée estimée, paiement', () => {
  const ouvrirCourse = async (page: Page) => {
    await ouvrirBillets(page, { preparer: courseAujourdhui });
    await page.getByRole('button', { name: 'Moto-taxi vers la gare' }).click();
    return fenetre(page, 'Moto-taxi vers la gare');
  };

  test('dès les premières lettres : propositions classées, accents ignorés, flèches + Entrée', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const champ = f.getByRole('combobox', { name: 'Je pars de' });
    await expect(f.getByRole('group', { name: 'Lieux fréquents' })).toBeVisible();
    await expect(f.getByRole('button', { name: 'Choisis ton point de départ' })).toBeDisabled();
    await champ.fill('b');
    const propositions = f.getByTestId('propositions-lieu').getByRole('option');
    await expect(propositions.first()).toContainText('Bastos'); // préfixe d'abord
    await champ.fill('hopital');
    await expect(f.getByRole('option', { name: /Hôpital Central/ })).toBeVisible(); // « hopital » trouve « Hôpital »
    await expect(f.getByRole('option', { name: /Hôpital Général/ })).toBeVisible();
    await expect(f.getByTestId('propositions-lieu')).not.toContainText('Laquintinie'); // un hôpital de Douala n'est pas proposé à Yaoundé
    await champ.fill('mar');
    await expect(f.getByRole('option', { name: /Marché central/ })).toBeVisible();
    await shot(page, 'course-autocompletion');
    await champ.fill('esso'); // ↓ puis Entrée
    await champ.press('ArrowDown');
    await expect(propositions.first()).toHaveAttribute('aria-selected', 'true');
    await champ.press('Enter');
    await expect(champ).toHaveValue('Essos');
    await expect(f.getByTestId('propositions-lieu')).toBeHidden();
    await expect(f.getByText('Essos → gare de Mvan')).toBeVisible();
    await expect(f.getByText('5 km · moto 500 F')).toBeVisible();
  });

  test('Entrée sans flèche valide la première proposition, un lieu libre est accepté', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const champ = f.getByRole('combobox', { name: 'Je pars de' });
    await champ.fill('Nlong'); await champ.press('Enter');
    await expect(champ).toHaveValue('Nlongkak');
    await champ.fill('Chez Tonton Sa’a'); // inconnu : « Utiliser … »
    await expect(f.getByRole('option', { name: /Utiliser « Chez Tonton Sa’a »/ })).toBeVisible();
    await champ.press('Enter');
    await expect(f.getByText('Chez Tonton Sa’a → gare de Mvan')).toBeVisible();
    await expect(f.getByText('6 km · moto 600 F · distance estimée')).toBeVisible();
  });

  test('l’arrivée estimée vient des motos et taxis connectés et suit le lieu de départ', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const champ = f.getByRole('combobox', { name: 'Je pars de' });
    const arrivee = f.getByTestId('tuile-arrivee');
    await expect(arrivee).toContainText('—'); // pas de lieu : pas d'estimation
    await expect(f.getByTestId('flotte-proche')).toContainText(/motos? connectées? à Yaoundé/);
    await champ.fill('Bastos'); await champ.press('Enter');
    await expect(arrivee).toContainText(/~\d+ min/);
    const proche = f.getByTestId('flotte-proche');
    await expect(proche).toContainText(/Moto à \d+ min · arrive dans ~\d+ min/);
    await expect(proche).toContainText(/(Aucune moto|\d+ motos?) à proximité/);
    const bastos = await proche.innerText();
    const n = Number((/Moto à (\d+) min/.exec(bastos) ?? [])[1]);
    expect(Number((/arrive dans ~(\d+) min/.exec(bastos) ?? [])[1])).toBe(n + 1); // temps d'approche + 1 min de marge pour une moto
    // un autre lieu change l'estimation (le plus proche n'est plus le même)
    const vus = new Set([bastos]);
    for (const lieu of ['Mendong', 'Essos', 'Etoudi']) { await champ.fill(lieu); await champ.press('Enter'); vus.add(await proche.innerText()); }
    expect(vus.size, 'l’estimation dépend du lieu').toBeGreaterThan(2);
    // taxi : plus lent, marge plus large
    await f.getByRole('group', { name: 'Véhicule' }).getByRole('button', { name: /Taxi/ }).click();
    await expect(proche).toContainText(/Taxi à \d+ min · arrive dans ~\d+ min/);
    await expect(proche).toContainText(/(Aucun taxi|\d+ taxis?) à proximité/);
    await shot(page, 'course-estimation');
  });

  test('quatre moyens de paiement ; MoMo : commission retenue sur le paiement', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const moyens = f.getByRole('radiogroup', { name: 'Paiement' });
    for (const m of ['MoMo', 'Orange Money', 'Cagnotte', 'Espèces']) await expect(moyens.getByRole('radio', { name: new RegExp(m) })).toBeVisible();
    await f.getByRole('combobox', { name: 'Je pars de' }).fill('Bastos'); await f.getByRole('combobox', { name: 'Je pars de' }).press('Enter');
    await expect(f.getByTestId('detail-commission')).toContainText('Tu paies 700 F dans l’app · commission AfriMove 70 F retenue sur le paiement (conducteur : 630 F)');
    await moyens.getByRole('radio', { name: /Orange Money/ }).click();
    await expect(f.getByTestId('detail-commission')).toContainText('commission AfriMove 70 F retenue sur le paiement');
    await f.getByRole('button', { name: /^Commander · 700 F/ }).click();
    expect((await lireEtat(page)).tranches.route.courses[0]).toMatchObject({ moyen: 'om', prix: 700, commission: 70, commissionMode: 'retenue' });
    expect((await lireEtat(page)).tranches.route.commissionsDues).toEqual([]);
  });

  test('espèces : le conducteur encaisse tout, AfriMove prélève sa commission sur son compte', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const champ = f.getByRole('combobox', { name: 'Je pars de' });
    await champ.fill('Bastos'); await champ.press('Enter');
    await f.getByRole('radiogroup', { name: 'Paiement' }).getByRole('radio', { name: /Espèces/ }).click();
    await expect(f.getByTestId('detail-commission')).toContainText('Tu paies 700 F au conducteur · commission AfriMove 70 F prélevée sur son compte');
    await shot(page, 'course-especes');
    await f.getByRole('button', { name: /^Commander · 700 F/ }).click();
    // suivi dans la même fenêtre, avec la commission
    await expect(f.getByText('Moto en route').first()).toBeVisible();
    await expect(f.getByTestId('detail-commission')).toContainText('commission AfriMove 70 F prélevée sur son compte');
    await expect(page.getByRole('dialog', { name: 'Moto-taxi vers la gare' })).toBeVisible();
    let e = await lireEtat(page);
    expect(e.tranches.route.courses[0]).toMatchObject({ moyen: 'especes', prix: 700, commission: 70, commissionMode: 'due', statut: 'en_cours' });
    expect(e.tranches.route.commissionsDues).toHaveLength(1);
    expect(e.tranches.route.commissionsDues[0]).toMatchObject({ montant: 70, prixCourse: 700, statut: 'due', courseId: e.tranches.route.courses[0].id });
    // suivi simulé : arrivée du véhicule, trajet, gare → commission prélevée
    await shot(page, 'course-suivi-0');
    for (const t of ['Moto arrivée', 'Vers la gare', 'Arrivée à la gare']) {
      await f.getByRole('button', { name: /Simuler l’étape suivante/ }).click();
      await expect(f.getByRole('list', { name: 'Étapes de la course' }).locator('[aria-current="step"]')).toBeVisible();
      if (t === 'Vers la gare') await shot(page, 'course-suivi-2');
    }
    e = await lireEtat(page);
    expect(e.tranches.route.courses[0].statut).toBe('terminee');
    expect(e.tranches.route.commissionsDues[0]).toMatchObject({ montant: 70, statut: 'prelevee' });
    await shot(page, 'course-suivi-fin');
  });

  test('annulation gratuite avant la prise en charge : la commission due disparaît', async ({ page }) => {
    const f = await ouvrirCourse(page);
    const champ = f.getByRole('combobox', { name: 'Je pars de' });
    await champ.fill('Essos'); await champ.press('Enter');
    await f.getByRole('radiogroup', { name: 'Paiement' }).getByRole('radio', { name: /Espèces/ }).click();
    await f.getByRole('button', { name: /^Commander/ }).click();
    await expect(f.getByText('Moto en route').first()).toBeVisible();
    await f.getByRole('button', { name: /Annuler la course/ }).click();
    await expect(f.getByText(/Dernière course : annulée/)).toBeVisible();
    const e = await lireEtat(page);
    expect(e.tranches.route.courses[0].statut).toBe('annulee');
    expect(e.tranches.route.commissionsDues[0].statut).toBe('annulee');
  });
});

test.describe('Partager', () => {
  test('lien WhatsApp et SMS préremplis, copie du message, partage du téléphone', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }));
    await page.addInitScript(() => { (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share = async (d) => { (window as unknown as { __partage: ShareData }).__partage = d; }; });
    await ouvrirBillets(page);
    await page.getByRole('button', { name: 'Partager', exact: true }).click();
    const f = fenetre(page, 'Partager mon billet');
    await expect(f.getByRole('radio', { name: /Marie/ })).toHaveAttribute('aria-checked', 'true');
    await expect(f.getByTestId('apercu-partage')).toContainText('Aïcha te partage son billet Yaoundé → Douala');
    await expect(f.getByTestId('apercu-partage')).toContainText('Code AM-7F3K-22');
    const wa = f.getByRole('link', { name: 'Envoyer sur WhatsApp' });
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/237677000111\?text=AfriMove/);
    await expect(f.getByRole('link', { name: 'Par SMS' })).toHaveAttribute('href', /^sms:\+237677000111\?body=AfriMove/);
    await f.getByRole('button', { name: 'Copier le message' }).click();
    await expect(page.getByText('Message copié').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('AM-7F3K-22');
    await f.getByRole('button', { name: 'Partager…' }).click();
    expect(await page.evaluate(() => (window as unknown as { __partage: ShareData }).__partage.text)).toContain('Code AM-7F3K-22');
    // nouveau numéro invalide : le lien ne part pas
    await f.getByRole('radio', { name: /Nouveau numéro/ }).click();
    await f.getByLabel('Prénom').fill('Tonton'); await f.getByLabel('Téléphone').fill('12');
    await wa.click();
    await expect(f.getByText('Numéro camerounais à 9 chiffres, il commence par 6.')).toBeVisible();
    await f.getByLabel('Téléphone').fill('6 55 32 98 10');
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/237655329810\?text=/);
    const [popup] = await Promise.all([page.waitForEvent('popup'), wa.click()]);
    await popup.close();
    await expect(f.getByText('Message prêt pour Tonton.')).toBeVisible();
    const e = await lireEtat(page);
    expect(e.tranches.reglement.partages[0]).toMatchObject({ versNom: 'Tonton', versTel: '6 55 32 98 10', canal: 'whatsapp', billetId: 'b-aicha1' });
    await shot(page, 'fenetre-partage-fait');
  });
});

test.describe('Ton bus : sélecteur de billet', () => {
  test('menu déroulant des billets en cours : les miens et ceux achetés pour un proche', async ({ page }) => {
    await ouvrirBillets(page, { preparer: billetPourMarie });
    const selecteur = page.getByRole('combobox', { name: /Ton bus/ });
    await expect(selecteur).toBeVisible();
    await expect(selecteur).toContainText('Toi');
    await expect(selecteur).toContainText('Yaoundé → Douala');
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('Aïcha Ndiba');
    await selecteur.click();
    await expect(selecteur).toHaveAttribute('aria-expanded', 'true');
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('Toi'); await expect(options.nth(0)).toContainText('08:00'); await expect(options.nth(0)).toContainText('à venir');
    await expect(options.nth(1)).toContainText('Marie · payé par toi'); await expect(options.nth(1)).toContainText('09:00'); await expect(options.nth(1)).toContainText('7B');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(500); await shot(page, 'selecteur-ouvert');
    await options.nth(1).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    // tout ce que la page montre suit le billet choisi : hologramme, code, place, QR, actions, fenêtres
    const holo = page.getByRole('group', { name: /Billet holographique/ });
    await expect(holo).toContainText('Marie Ndiba'); await expect(holo).toContainText('AM-9K2P-47'); await expect(holo).toContainText('7B');
    await expect(holo.getByRole('img', { name: /AM-9K2P-47/ })).toBeVisible();
    await expect(page.getByText(/Billet payé/)).toBeVisible();
    await expect(selecteur).toContainText('Marie');
    await page.getByRole('button', { name: 'Sans réseau' }).click();
    await expect(fenetre(page, 'Sans réseau')).toContainText('AM-9K2P-47');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Partager', exact: true }).click();
    await expect(page.getByTestId('apercu-partage')).toContainText('te partage le billet de Marie');
    await expect(page.getByTestId('apercu-partage')).toContainText('Code AM-9K2P-47');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(fenetre(page, 'Annuler ce billet')).toContainText('Marie');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Problème' }).click();
    await expect(page.getByTestId('cible')).toContainText('AM-9K2P-47');
    await page.keyboard.press('Escape');
    await shot(page, 'selecteur-billet-marie');
  });

  test('clavier : flèches, Entrée, Échap, Début et Fin', async ({ page }) => {
    await ouvrirBillets(page, { preparer: billetPourMarie });
    const selecteur = page.getByRole('combobox', { name: /Ton bus/ });
    await selecteur.focus();
    await selecteur.press('ArrowDown');
    await expect(selecteur).toHaveAttribute('aria-expanded', 'true');
    await selecteur.press('Escape');
    await expect(selecteur).toHaveAttribute('aria-expanded', 'false');
    await expect(selecteur).toBeFocused();
    await selecteur.press('ArrowDown'); await selecteur.press('ArrowDown'); // ouvre sur le billet courant puis descend
    await expect(page.getByRole('option').nth(1)).toHaveAttribute('id', await selecteur.getAttribute('aria-activedescendant') ?? '');
    await selecteur.press('Enter');
    await expect(selecteur).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-9K2P-47');
    await selecteur.press('ArrowUp'); await selecteur.press('Home'); await selecteur.press('Enter');
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-7F3K-22');
    await selecteur.press('Space'); await selecteur.press('End'); await selecteur.press('Space');
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-9K2P-47');
    // un clic ailleurs referme le menu
    await selecteur.click(); await expect(selecteur).toHaveAttribute('aria-expanded', 'true');
    await page.getByText('Billet payé').click(); await expect(selecteur).toHaveAttribute('aria-expanded', 'false');
  });

  test('le choix est mémorisé (tranche reglement) et repris par /direct, et inversement', async ({ page }) => {
    await ouvrirBillets(page, { preparer: billetPourMarie });
    await page.getByRole('combobox', { name: /Ton bus/ }).click();
    await page.getByRole('option', { name: /Marie/ }).click();
    expect((await lireEtat(page)).tranches.reglement.billetChoisi).toBe('b-marie');
    await page.reload();
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-9K2P-47'); // repris après rechargement
    // /direct suit le bus choisi (même sélecteur en haut de l'écran)
    await page.getByRole('link', { name: 'Suivre ce bus' }).click();
    await expect(page).toHaveURL(/\/direct\?billet=b-marie/);
    const sel = page.getByRole('combobox', { name: /Bus suivi/ });
    await expect(sel).toContainText('Marie');
    await expect(page.getByText('AM-9K2P-47').or(page.getByText('AM9K2P47'))).toBeVisible();
    await shot(page, 'direct-selecteur');
    await sel.click(); await page.getByRole('option', { name: /Toi/ }).click();
    await expect(page.getByText('AM7F3K22')).toBeVisible();
    expect((await lireEtat(page)).tranches.reglement.billetChoisi).toBe('b-aicha1');
    await page.evaluate(() => { history.pushState({}, '', '/pass'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-7F3K-22'); // /pass reprend le choix fait dans /direct
  });

  test('un seul billet : pas de menu inutile ; aucun billet : pas de sélecteur', async ({ page }) => {
    await ouvrirBillets(page);
    await expect(page.getByTestId('selecteur-bus')).toContainText('Yaoundé → Douala · 08:00');
    await expect(page.getByRole('combobox', { name: /Ton bus/ })).toHaveCount(0);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await shot(page, 'selecteur-un-billet');
    const vide = await page.context().newPage();
    await ouvrirBillets(vide, { preparer: (e) => { e.monde.billets.length = 0; } });
    await expect(vide.getByText('Aucun billet pour l’instant')).toBeVisible();
    await expect(vide.getByTestId('selecteur-bus')).toHaveCount(0);
    await vide.close();
  });

  test('un billet annulé ne figure plus dans le menu', async ({ page }) => {
    await ouvrirBillets(page, { preparer: billetPourMarie });
    await page.getByRole('combobox', { name: /Ton bus/ }).click();
    await page.getByRole('option', { name: /Marie/ }).click();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    const f = fenetre(page, 'Annuler ce billet');
    await f.getByRole('button', { name: 'Confirmer l’annulation' }).click();
    await expect(f.getByText(/renvoyés sur MoMo/)).toBeVisible();
    await f.getByRole('button', { name: 'Mes billets' }).click();
    await expect(page.getByRole('combobox', { name: /Ton bus/ })).toHaveCount(0); // un seul billet en cours : résumé sans menu
    await expect(page.getByTestId('selecteur-bus')).toContainText('Toi');
    await expect(page.getByRole('group', { name: /Billet holographique/ })).toContainText('AM-7F3K-22');
  });
});

test.describe('Écran Direct : mêmes fenêtres', () => {
  test('Partager, Moto-taxi vers la gare et Signaler s’ouvrent en fenêtre', async ({ page }) => {
    await ouvrir(page, '/direct', { connecte: 'p-aicha', preparer: courseAujourdhui });
    await expect(page.getByText('Étapes')).toBeVisible();
    const adresse = page.url();
    await page.getByRole('button', { name: 'Moto-taxi vers la gare' }).click();
    await expect(fenetre(page, 'Moto-taxi vers la gare').getByRole('combobox', { name: 'Je pars de' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Partager', exact: true }).click();
    await expect(fenetre(page, 'Partager mon billet')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Un souci à bord/ }).click();
    await expect(fenetre(page, 'Signaler un problème')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(page.url()).toBe(adresse);
  });
});

test.describe('Fenêtres à 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('aucune fenêtre ne déborde en largeur', async ({ page }) => {
    await ouvrirBillets(page, { preparer: (e) => { billetPourMarie(e); courseAujourdhui(e); } });
    await page.getByRole('combobox', { name: /Ton bus/ }).click();
    await page.waitForTimeout(500);
    await shot(page, 'selecteur-320');
    await page.keyboard.press('Escape');
    for (const [bouton, titre] of [['Sans réseau', 'Sans réseau'], ['Moto-taxi vers la gare', 'Moto-taxi vers la gare'], ['Partager', 'Partager mon billet'], ['Annuler', 'Annuler ce billet'], ['Problème', 'Signaler un problème']] as const) {
      await page.getByRole('button', { name: bouton, exact: true }).click();
      const f = fenetre(page, titre);
      await expect(f).toBeVisible();
      await page.waitForTimeout(450);
      if (titre === 'Moto-taxi vers la gare') { const c = f.getByRole('combobox', { name: 'Je pars de' }); await c.fill('hop'); await shot(page, 'course-320'); await c.press('Escape'); }
      const ecart = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]') as HTMLElement, l = innerWidth;
        const trop = [...d.querySelectorAll<HTMLElement>('*')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > l + 1 || r.left < -1); }).map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
        return { page: document.documentElement.scrollWidth - l, dialog: d.scrollWidth - d.clientWidth, trop: trop.slice(0, 3) };
      });
      expect(ecart, titre).toEqual({ page: 0, dialog: 0, trop: [] });
      await page.keyboard.press('Escape');
    }
  });
});
