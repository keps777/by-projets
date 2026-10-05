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
