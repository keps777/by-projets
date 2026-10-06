import { expect, test } from '@playwright/test';

test.describe('parcours principal (mode local)', () => {
  test('ajouter un rendez-vous, le retrouver au Fil, le cocher, le garder après rechargement', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));

    await page.goto('/');
    await expect(page.getByText('Luther Life').first()).toBeVisible();

    await page.getByRole('link', { name: 'Ajouter une tâche' }).click();
    // Sans projet associé, un message demande d'en choisir un ; un rendez-vous s'ajoute sans projet.
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
    await expect(page).toHaveURL(/\/tache\/nouvelle/);
    await page.goto('/tache/nouvelle?sans-projet=1');
    await page.getByLabel('Titre de la tâche').fill('Rencontre avec Christopher');
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();

    await expect(page).toHaveURL(/\/$|\/\?/);
    await expect(page.getByText('Rencontre avec Christopher').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText('Rencontre avec Christopher').first()).toBeVisible();

    await page.getByRole('link', { name: 'Recherche' }).or(page.getByRole('link', { name: 'Rechercher' })).first().click();
    await page.getByRole('searchbox').or(page.locator('input').first()).fill('christopher');
    await expect(page.getByText('Rencontre avec Christopher').first()).toBeVisible();
    expect(erreurs).toEqual([]);
  });

  test('changer l’apparence dans les Réglages', async ({ page }) => {
    await page.goto('/reglages');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nuit');
    await page.getByRole('button', { name: 'Jour', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jour');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'jour');
  });

  test('navigation par les onglets', async ({ page }) => {
    await page.goto('/');
    for (const [nom, url] of [['Projets', /\/projets$/], ['Rapports', /\/rapports$/], ['Archive', /\/archive$/], ['Réglages', /\/reglages$/], ['Le Fil', /\/$/]] as const) {
      await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: nom }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test('l’app s’ouvre hors ligne après une première visite', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // le service worker contrôle maintenant la page
    await context.setOffline(true);
    await page.goto('/projets');
    await expect(page.getByText('Diviser ma vie en plusieurs projets.')).toBeVisible();
    await context.setOffline(false);
  });
});

test('cocher un bloc depuis son volet, le garder après rechargement', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1');
  await page.getByLabel('Titre de la tâche').fill('Appel important');
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.getByText('Appel important').first().click();
  const marquer = page.getByRole('button', { name: /Marquer comme fait/ });
  await marquer.click();
  await page.reload();
  await page.getByText('Appel important').first().click();
  await expect(page.getByRole('button', { name: /Fait · toucher pour annuler/ })).toBeVisible();
});

test('reporter un bloc avec un rappel « à l’heure », sans débordement à l’écran', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1');
  await page.getByLabel('Titre de la tâche').fill('Bloc à déplacer');
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.getByText('Bloc à déplacer').first().click();
  await page.getByRole('button', { name: /Reporter/ }).first().click();
  const aLHeure = page.getByRole('button', { name: 'À l’heure' });
  await aLHeure.click();
  const boite = await aLHeure.boundingBox();
  expect(boite!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('Le Fil : gestes', () => {
  test.use({ hasTouch: true });

  test('toucher un espace libre ouvre l’ajout de tâche à l’heure touchée (demi-heure inférieure)', async ({ page }) => {
    // La veille : aucun bloc fantôme ni « maintenant » ne gêne le toucher.
    const veille = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    await page.goto(`/?jour=${veille}`);
    await page.waitForSelector('.grille');
    await page.locator('.defile-jour').evaluate((el) => { el.scrollTop = 0; });
    const box = (await page.locator('.grille').boundingBox())!;
    await page.mouse.click(260, box.y + 200 * (72 / 60)); // 03:20 → on attend 03:00 (180 min)
    await expect(page).toHaveURL(new RegExp(`/tache/nouvelle\\?heure=180&jour=${veille}$`));
    await expect(page.getByLabel('Titre de la tâche')).toBeVisible();
  });

  test('glisser la journée change de jour', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.grille');
    const titre = () => page.locator('h1').first().innerText();
    const avant = await titre();
    const client = await page.context().newCDPSession(page);
    const glisser = async (x0: number, x1: number) => {
      const y = 480;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 6; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 6, y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await glisser(320, 80); // vers la gauche : jour suivant
    await expect(page).toHaveURL(/\?jour=\d{4}-\d{2}-\d{2}$/);
    expect(await titre()).not.toBe(avant);
    await glisser(80, 320); // vers la droite : retour à aujourd'hui
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(titre).toBe(avant);
  });
});

test('ajout de tâche : choisir l’heure d’un coup et cumuler des rappels plus tôt', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1&heure=840'); // 14:00
  await page.getByLabel('Titre de la tâche').fill('Rendez-vous chez le dentiste');
  await expect(page.locator('.debut')).toHaveText('14:00');
  await page.getByLabel('Choisir l’heure de début').fill('18:20');
  await expect(page.locator('.debut')).toHaveText('18:20');
  await page.getByRole('button', { name: /^Soir/ }).click();
  await expect(page.locator('.debut')).toHaveText('18:00');
  await page.getByRole('button', { name: '2 h avant', exact: true }).click();
  await page.getByRole('button', { name: '1 jour avant', exact: true }).click();
  await expect(page.getByRole('button', { name: '2 h avant', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/rappels 1 jour, 2 h, 10 min avant/)).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await expect(page).toHaveURL(/\/$|\/\?/);
});

test.describe('Carnet', () => {
  test('écrire des notes libres : numérotées, gardées après rechargement, corrigées et retrouvées dans la recherche', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Carnet/ }).click();
    await expect(page).toHaveURL(/\/carnet/);
    const champ = page.getByLabel('Écrire une note libre');
    await expect(champ).toBeFocused();
    await champ.fill('Pardonner vite, sans attendre');
    await page.getByRole('button', { name: 'Ajouter au Carnet' }).click();
    await champ.fill('Appeler Christopher demain');
    await page.getByRole('button', { name: 'Ajouter au Carnet' }).click();
    const lignes = page.locator('.note');
    await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0).locator('.numero')).toHaveText('1');
    await expect(lignes.nth(1).locator('.numero')).toHaveText('2');
    await expect(page.getByText('Note libre ·').first()).toBeVisible();

    await page.reload();
    await expect(page.locator('.note')).toHaveCount(2);

    // Corriger la note 1 : le numéro ne change pas.
    await page.locator('.note').nth(0).locator('.texte').click();
    await page.getByLabel('Texte de la note 1').fill('Pardonner vite, sans rien attendre');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.note').nth(0)).toContainText('sans rien attendre');
    await expect(page.locator('.note').nth(0).locator('.numero')).toHaveText('1');

    // La recherche retrouve la note, avec son numéro.
    await page.goto('/recherche?q=christopher');
    await expect(page.getByText('Carnet n° 2').first()).toBeVisible();
  });

  test('le sommaire liste les pages avec leurs numéros', async ({ page }) => {
    await page.goto('/carnet?ecrire=1');
    await page.getByLabel('Écrire une note libre').fill('Une pensée du jour');
    await page.getByRole('button', { name: 'Ajouter au Carnet' }).click();
    await page.getByRole('button', { name: 'Sommaire des pages' }).click();
    await expect(page.getByRole('dialog', { name: 'Sommaire du Carnet' })).toContainText('n° 1');
  });
});

test('Mode Focus : les notes écrites pendant un bloc vont au Carnet, numérotées, avec leur provenance', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1&heure=60');
  await page.getByLabel('Titre de la tâche').fill('Étude du soir');
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.getByText('Étude du soir').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Lancer/ }).first().click();
  await page.getByRole('link', { name: /Mode Focus/ }).click();
  await expect(page).toHaveURL(/\/focus\?occ=/);
  const champ = page.getByLabel('Écrire une note');
  await champ.fill('Matthieu 6 : ne vous inquiétez pas');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.carnet-liste li')).toHaveCount(1);
  await expect(page.locator('.carnet-liste .num')).toHaveText('1');
  await champ.fill('Faire confiance, un jour à la fois');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.carnet-liste .num').nth(1)).toHaveText('2');

  await page.goto('/carnet');
  await expect(page.locator('.note')).toHaveCount(2);
  await expect(page.getByText(/Focus · Étude du soir/).first()).toBeVisible();
});

test.describe('Rapports', () => {
  test('s’ouvre sur la journée en cours (onglet Jour) ; une carte se modifie à la main', async ({ page }) => {
    await page.goto('/rapports');
    const jourNum = await page.evaluate(() => new Date().toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric' }));
    await expect(page.locator('.nom').first()).toContainText(jourNum);
    await expect(page.getByRole('tab', { name: 'Jour' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: /DDEWG : modifier les valeurs/ }).click();
    const volet = page.getByRole('dialog', { name: 'Saisir un jour' });
    await expect(volet).toBeVisible();
    await volet.locator('input.mono').first().fill('2');
    await volet.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(volet).toBeHidden();
    await expect(page.getByRole('button', { name: /DDEWG : modifier les valeurs/ }).locator('.valeur')).toContainText('2');
  });
});

test('ajout de tâche : durée libre (3h45, 4 h) en plus des durées courantes', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1&heure=480'); // 08:00
  await page.getByLabel('Titre de la tâche').fill('Atelier');
  const champ = page.getByLabel('Durée de la tâche');
  await champ.fill('3h45');
  await champ.blur();
  await expect(page.locator('.fin').first()).toHaveText('jusqu’à 11:45');
  await page.getByRole('button', { name: '15 minutes de plus' }).click();
  await expect(page.locator('.fin').first()).toHaveText('jusqu’à 12:00');
  await page.getByRole('button', { name: '4 h', exact: true }).click();
  await expect(page.locator('.fin').first()).toHaveText('jusqu’à 12:00');
  await champ.fill('1:30');
  await champ.press('Enter');
  await expect(page.locator('.fin').first()).toHaveText('jusqu’à 09:30');
  // Une durée qui dépasserait minuit fait commencer la tâche plus tôt.
  await page.goto('/tache/nouvelle?sans-projet=1&heure=1380'); // 23:00
  await page.getByLabel('Durée de la tâche').fill('3h');
  await page.getByLabel('Durée de la tâche').blur();
  await expect(page.locator('.debut')).toHaveText('21:00');
});

test('plusieurs blocs peuvent tourner en même temps ; la carte du bas les liste', async ({ page }) => {
  for (const [titre, heure] of [['Étude A', 60], ['Étude B', 120]] as const) {
    await page.goto(`/tache/nouvelle?sans-projet=1&heure=${heure}`);
    await page.getByLabel('Titre de la tâche').fill(titre);
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  }
  for (const titre of ['Étude A', 'Étude B']) {
    await page.locator('.bloc').filter({ hasText: titre }).getByRole('button', { name: new RegExp(`Lancer ${titre}`) }).click();
  }
  await expect(page.locator('.bloc.tourne')).toHaveCount(2);
  await expect(page.getByText('2 en cours en même temps')).toBeVisible();
  // Mettre l'un en pause laisse l'autre tourner.
  await page.getByRole('group', { name: /blocs en cours/ }).getByRole('button', { name: /Mettre en pause Étude A/ }).click();
  await expect(page.getByText('Étude A · en pause')).toBeVisible();
  await expect(page.getByText('Étude B · en pause')).toHaveCount(0);
});

test.describe('Propositions de titre', () => {
  test('reprennent les réglages d’une tâche déjà créée, et proposent des titres génériques', async ({ page }) => {
    await page.goto('/tache/nouvelle?sans-projet=1&heure=600');
    await page.getByLabel('Titre de la tâche').fill('Rencontre avec Christopher');
    await page.getByLabel('Durée de la tâche').fill('3h45');
    await page.getByLabel('Durée de la tâche').blur();
    await page.getByRole('button', { name: '2 h avant', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();

    await page.goto('/tache/nouvelle?sans-projet=1&heure=1200');
    const prop = page.getByRole('group', { name: 'Propositions de titre' });
    await expect(prop.getByRole('button', { name: /Rencontre avec Christopher/ })).toBeVisible();
    await page.getByLabel('Titre de la tâche').fill('renc');
    await expect(prop.getByRole('button', { name: /^Rencontre avec Christopher/ })).toBeVisible();
    await expect(prop.getByRole('button', { name: /^Rencontre avec…/ })).toBeVisible();
    await prop.getByRole('button', { name: /^Rencontre avec Christopher/ }).click();
    await expect(page.getByLabel('Titre de la tâche')).toHaveValue('Rencontre avec Christopher');
    await expect(page.locator('.debut')).toHaveText('20:00'); // l’heure choisie reste
    await expect(page.locator('.fin').first()).toHaveText('jusqu’à 23:45'); // la durée est reprise
    await expect(page.getByRole('button', { name: '2 h avant', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('modifier la durée d’une tâche agrandit son bloc sur le Fil', async ({ page }) => {
  await page.goto('/tache/nouvelle?sans-projet=1&heure=480');
  await page.getByLabel('Titre de la tâche').fill('Atelier');
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.waitForSelector('.bloc');
  const avant = (await page.locator('.bloc').first().boundingBox())!.height;
  await page.locator('.bloc .ouvrir').first().click();
  await page.getByRole('link', { name: /Modifier la tâche/ }).click();
  await page.getByLabel('Durée de la tâche').fill('3h');
  await page.getByLabel('Durée de la tâche').blur();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForSelector('.bloc');
  const apres = (await page.locator('.bloc').first().boundingBox())!.height;
  expect(apres).toBeGreaterThan(avant * 3);
});

test('Bible : choisir le livre et les chapitres dans des menus (Focus), puis les retrouver au rapport', async ({ page }) => {
  await page.goto('/tache/nouvelle?heure=60');
  await page.getByLabel('Titre de la tâche').fill('Lecture du soir');
  await page.getByRole('button', { name: /La lecture de la Bible/ }).first().click();
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.getByText('Lecture du soir').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Lancer/ }).first().click();
  await page.getByRole('link', { name: /Mode Focus/ }).click();

  // Menus déroulants : livre, du chapitre, au chapitre.
  await page.getByLabel('Livre de la Bible').selectOption('Luc');
  await page.getByLabel('Du chapitre').selectOption('22');
  await page.getByLabel('Au chapitre').selectOption('24');
  await page.getByRole('button', { name: /Ajouter le passage Luc 22–24/ }).click();
  await expect(page.getByText('Luc 22–24')).toBeVisible();
  await expect(page.locator('.compte')).toContainText('3');
  // Le suivant est prêt : le chapitre d’après (Luc 24 était le dernier, on reste sur 24).
  await expect(page.getByLabel('Du chapitre')).toHaveValue('24');
  // « Au chapitre » ne propose pas de chapitre avant « Du chapitre ».
  await page.getByLabel('Livre de la Bible').selectOption('Jude');
  await expect(page.getByLabel('Au chapitre').locator('option')).toHaveCount(1);
  await page.getByLabel('Livre de la Bible').selectOption('Matthieu');
  await page.getByLabel('Du chapitre').selectOption('1');
  await page.getByLabel('Au chapitre').selectOption('2');
  await page.getByRole('button', { name: /Ajouter le passage Matthieu 1–2/ }).click();
  await expect(page.locator('.compte')).toContainText('5');
  await expect(page.getByLabel('Du chapitre')).toHaveValue('3');

  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await page.getByRole('button', { name: /Oui, enregistrer et cocher/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Rapports' }).click();
  const br = page.getByRole('button', { name: /BR : modifier les valeurs/ });
  await expect(br).toContainText('5 chapitres');
  await expect(br).toContainText('Luc 22–24 · Matthieu 1–2');
});

test('Bible : depuis le rapport, la saisie du jour utilise les menus et met le nombre de chapitres à jour', async ({ page }) => {
  await page.goto('/rapports');
  await page.getByRole('button', { name: /BR : modifier les valeurs/ }).click();
  const volet = page.getByRole('dialog', { name: 'Saisir un jour' });
  await volet.getByLabel('Livre de la Bible').selectOption('Jean');
  await volet.getByLabel('Du chapitre').selectOption('3');
  await volet.getByRole('button', { name: /Ajouter le passage Jean 3/ }).click();
  await volet.getByLabel('Du chapitre').selectOption('5');
  await volet.getByLabel('Au chapitre').selectOption('7');
  await volet.getByRole('button', { name: /Ajouter le passage Jean 5–7/ }).click();
  await expect(volet.getByText('Jean 5–7')).toBeVisible();
  await volet.getByRole('button', { name: 'Enregistrer' }).click();
  const br = page.getByRole('button', { name: /BR : modifier les valeurs/ });
  await expect(br).toContainText('4 chapitres');
  await expect(br).toContainText('Jean 3 · Jean 5–7');
});

test.describe('Chrono sur les points du rapport', () => {
  /** Recule le début de la session d’un point (sans attendre vraiment) ; la session est relue au rechargement. */
  async function reculer(page: import('@playwright/test').Page, minutes: number) {
    await page.evaluate((m) => {
      const v = JSON.parse(localStorage.getItem('luther-life:chronos') ?? '{}');
      for (const k of Object.keys(v)) v[k].debut -= m * 60_000;
      localStorage.setItem('luther-life:chronos', JSON.stringify(v));
    }, minutes);
    await page.reload();
  }

  test('lancer, arrêter, valider : le temps s’ajoute au total, les sessions se cumulent', async ({ page }) => {
    await page.goto('/rapports');
    await page.getByRole('button', { name: 'Lancer un chrono pour DDEWG' }).click();
    await expect(page.getByRole('timer', { name: /Session de DDEWG/ })).toBeVisible();
    // Une pastille sur l’onglet Rapports signale le chrono depuis les autres écrans.
    await expect(page.getByRole('img', { name: 'Chrono en cours' })).toBeVisible();
    await reculer(page, 25); // 25 minutes plus tard (la session survit au rechargement)
    await expect(page.getByRole('timer', { name: /Session de DDEWG/ })).toContainText('25:');
    await page.getByRole('button', { name: 'Arrêter le chrono de DDEWG' }).click();
    const pop = page.getByRole('dialog', { name: 'Fin de la session' });
    await expect(pop.getByLabel('Minutes')).toHaveValue('25');
    await expect(pop.getByLabel('Heures')).toHaveValue('0');
    await expect(pop.getByRole('textbox', { name: 'Nombre de fois' })).toHaveValue('1'); // une séance = une rencontre
    await pop.getByRole('button', { name: 'Valider la session' }).click();
    const carte = page.getByRole('button', { name: /DDEWG : modifier les valeurs/ });
    await expect(carte).toContainText('0h25');
    await expect(carte).toContainText('1');

    // Deuxième session : elle s’ajoute.
    await page.getByRole('button', { name: 'Lancer un chrono pour DDEWG' }).click();
    await reculer(page, 10);
    await page.getByRole('button', { name: 'Arrêter le chrono de DDEWG' }).click();
    await page.getByRole('dialog', { name: 'Fin de la session' }).getByRole('button', { name: 'Valider la session' }).click();
    await expect(page.getByRole('button', { name: /DDEWG : modifier les valeurs/ })).toContainText('0h35');
    await expect(page.getByRole('img', { name: 'Chrono en cours' })).toHaveCount(0);
  });

  test('étude de la Bible : à l’arrêt, la pop-up demande les chapitres lus (menus) ; on peut aussi annuler', async ({ page }) => {
    await page.goto('/rapports');
    await page.getByRole('button', { name: 'Lancer un chrono pour BR' }).click();
    await reculer(page, 40);
    await page.getByRole('button', { name: 'Arrêter le chrono de BR' }).click();
    const pop = page.getByRole('dialog', { name: 'Fin de la session' });
    await pop.getByLabel('Livre de la Bible').selectOption('Jean');
    await pop.getByLabel('Du chapitre').selectOption('3');
    await pop.getByLabel('Au chapitre').selectOption('5');
    await pop.getByRole('button', { name: /Ajouter le passage Jean 3–5/ }).click();
    await expect(pop.getByRole('textbox', { name: 'Chapitres' })).toHaveValue('3');
    await pop.getByRole('button', { name: 'Valider la session' }).click();
    const br = page.getByRole('button', { name: /BR : modifier les valeurs/ });
    await expect(br).toContainText('3 chapitres');
    await expect(br).toContainText('Jean 3–5');
    await expect(br).toContainText('0h40');

    // Annuler une session : rien n’est ajouté.
    await page.getByRole('button', { name: 'Lancer un chrono pour PA' }).click();
    await reculer(page, 30);
    await page.getByRole('button', { name: 'Arrêter le chrono de PA' }).click();
    await page.getByRole('dialog', { name: 'Fin de la session' }).getByRole('button', { name: 'Annuler la session' }).click();
    await expect(page.getByRole('button', { name: /PA : modifier les valeurs/ })).toContainText('0h00');
  });

  test('fermer la pop-up sans valider garde la session à valider', async ({ page }) => {
    await page.goto('/rapports');
    await page.getByRole('button', { name: 'Lancer un chrono pour PA' }).click();
    await page.getByRole('button', { name: 'Arrêter le chrono de PA' }).click();
    await page.getByRole('dialog', { name: 'Fin de la session' }).getByRole('button', { name: 'Plus tard' }).click();
    await expect(page.getByRole('timer', { name: /Session de PA/ })).toContainText('à valider');
    await page.getByRole('button', { name: 'Valider la session de PA' }).click();
    await expect(page.getByRole('dialog', { name: 'Fin de la session' })).toBeVisible();
  });
});

test.describe('Fermer et supprimer depuis le volet d’un bloc', () => {
  test.use({ hasTouch: true });

  async function ouvrirBloc(page: import('@playwright/test').Page, titre: string, heure = 120) {
    await page.goto(`/tache/nouvelle?sans-projet=1&heure=${heure}`);
    await page.getByLabel('Titre de la tâche').fill(titre);
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
    await page.locator('.bloc').filter({ hasText: titre }).locator('.ouvrir').click();
    await expect(page.getByRole('dialog', { name: titre })).toBeVisible();
  }

  test('le bouton ✕ et le bouton « Fermer » ferment le volet', async ({ page }) => {
    await ouvrirBloc(page, 'À fermer');
    await page.getByRole('dialog', { name: 'À fermer' }).getByRole('button', { name: 'Fermer', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'À fermer' })).toBeHidden();
    await page.locator('.bloc').filter({ hasText: 'À fermer' }).locator('.ouvrir').click();
    await page.getByRole('dialog', { name: 'À fermer' }).getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await expect(page.getByRole('dialog', { name: 'À fermer' })).toBeHidden();
  });

  test('glisser vers le bas ferme le volet', async ({ page }) => {
    await ouvrirBloc(page, 'À glisser');
    const feuille = page.getByRole('dialog', { name: 'À glisser' });
    const box = (await feuille.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2, y0 = box.y + 20;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + i * 25 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(feuille).toBeHidden();
  });

  test('supprimer la tâche d’un bloc : une seule fois, puis le bloc disparaît du Fil', async ({ page }) => {
    await ouvrirBloc(page, 'À supprimer');
    await page.getByRole('button', { name: 'Supprimer la tâche' }).click();
    await page.getByRole('dialog', { name: 'Supprimer', exact: true }).getByRole('button', { name: 'Supprimer la tâche' }).click();
    await expect(page.locator('.bloc').filter({ hasText: 'À supprimer' })).toHaveCount(0);
  });

  test('tâche qui se répète : on choisit seulement ce bloc, les suivants ou toute la série', async ({ page }) => {
    await page.goto('/tache/nouvelle?sans-projet=1&heure=180');
    await page.getByLabel('Titre de la tâche').fill('Chaque jour');
    await page.getByRole('button', { name: 'Tous les jours' }).first().click();
    await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
    await page.locator('.bloc').filter({ hasText: 'Chaque jour' }).locator('.ouvrir').click();
    await page.getByRole('button', { name: 'Supprimer la tâche' }).click();
    const choix = page.getByRole('dialog', { name: 'Supprimer', exact: true });
    await expect(choix.getByRole('button', { name: /Seulement ce bloc/ })).toBeVisible();
    await expect(choix.getByRole('button', { name: /Celui-ci et les suivants/ })).toBeVisible();
    await choix.getByRole('button', { name: /Toute la série/ }).click();
    await expect(page.locator('.bloc').filter({ hasText: 'Chaque jour' })).toHaveCount(0);
  });
});

test('fin de session : le temps enregistré se corrige (heures, minutes, secondes)', async ({ page }) => {
  await page.goto('/rapports');
  await page.getByRole('button', { name: 'Lancer un chrono pour PWO' }).click();
  // Le chrono est resté lancé « 14 h 51 » : on corrige à 1 h 20 min 30 s.
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('luther-life:chronos') ?? '{}');
    for (const k of Object.keys(v)) v[k].debut -= (14 * 3600 + 51 * 60 + 32) * 1000;
    localStorage.setItem('luther-life:chronos', JSON.stringify(v));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Arrêter le chrono de PWO' }).click();
  const pop = page.getByRole('dialog', { name: 'Fin de la session' });
  await expect(pop.getByLabel('Heures')).toHaveValue('14');
  await expect(pop.getByLabel('Minutes')).toHaveValue('51');
  await pop.getByLabel('Heures').fill('1');
  await pop.getByLabel('Minutes').fill('20');
  await pop.getByLabel('Secondes').fill('30');
  await pop.getByLabel('Secondes').blur();
  await expect(pop.getByText(/Remettre le temps du chrono/)).toBeVisible();
  // Les boutons ±1 / ±5 min ajustent, et une saisie hors limites se normalise (90 min = 1 h 30).
  await pop.getByRole('button', { name: '+5 min' }).click();
  await expect(pop.getByLabel('Minutes')).toHaveValue('25');
  await pop.getByLabel('Minutes').fill('90');
  await pop.getByLabel('Minutes').blur();
  await expect(pop.getByLabel('Heures')).toHaveValue('2');
  await expect(pop.getByLabel('Minutes')).toHaveValue('30');
  await pop.getByLabel('Minutes').fill('0');
  await pop.getByLabel('Heures').fill('1');
  await pop.getByLabel('Heures').blur();
  await pop.getByLabel('Minutes').fill('20');
  await pop.getByLabel('Secondes').fill('0');
  await pop.getByLabel('Secondes').blur();
  await pop.getByRole('button', { name: 'Valider la session' }).click();
  await expect(page.getByRole('button', { name: /PWO : modifier les valeurs/ })).toContainText('1h20');
});

test('créer un projet puis un sous-projet depuis « Nouvelle tâche » et les utiliser tout de suite', async ({ page }) => {
  await page.goto('/tache/nouvelle');
  await page.getByLabel('Titre de la tâche').fill('Lecture du soir');
  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByRole('textbox', { name: 'Nouveau projet' }).fill('Projet éclair');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  const projet = page.getByRole('button', { name: /Projet éclair/ });
  await expect(projet).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Nouveau sous-projet' }).click();
  await page.getByRole('textbox', { name: 'Nouveau sous-projet' }).fill('Sprint un');
  await page.getByRole('button', { name: /Ce que le sous-projet mesure/ }).click();
  await page.getByRole('option', { name: /^Fois/ }).click();
  await page.getByRole('option', { name: /^Distance/ }).click();
  await page.getByRole('button', { name: /Ce que le sous-projet mesure/ }).click();
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText('Sprint un')).toBeVisible();
  await expect(page.getByText('Mesure : temps, fois, distance')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await expect(page).toHaveURL(/\/$|\/\?/);

  await page.getByRole('link', { name: 'Projets' }).first().click();
  await expect(page.getByText('Projet éclair').first()).toBeVisible();
});

test('Projets : une rubrique se replie avec sa flèche et le repli est gardé', async ({ page }) => {
  await page.goto('/projets');
  const projet = page.getByRole('link', { name: /La lecture de la Bible/ }).first();
  await expect(projet).toBeVisible();
  await page.getByRole('button', { name: /Replier la rubrique Ma relation avec Dieu/ }).click();
  await expect(projet).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: /Déplier la rubrique Ma relation avec Dieu/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(projet).toBeHidden();
  await page.getByRole('button', { name: /Déplier la rubrique Ma relation avec Dieu/ }).click();
  await expect(projet).toBeVisible();
});
