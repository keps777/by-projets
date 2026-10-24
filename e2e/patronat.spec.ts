// (i) Le patron : indicateurs cohérents, assistant qui chiffre et applique un prix que la voyageuse retrouve, modules écrits dans le monde et obéis par les autres applications.
import { aller, entrerEn, expect, lireMonde, nombre, ouvrir, siegeLibre, test } from './aide';

const dock = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Navigation principale' });

test('(i) indicateurs, assistant → prix appliqué visible chez la voyageuse, modules désactivés partout', async ({ page }) => {
  // Abdou ouvre la gare de Mvan : sa recette du jour est celle que le patron lit sur sa tuile « Yaoundé Mvan »
  await ouvrir(page, '/superviseur', { connecte: 'p-abdou', maintenant: '2026-11-03T19:10' }); // en fin de journée, l'histoire des chiffres est lisible
  const ventesGare = nombre(await page.locator('.gl', { hasText: 'Ventes du jour' }).first().locator('.ttl').first().textContent());
  expect(ventesGare).toBeGreaterThan(0);
  await entrerEn(page, 'p-luther');
  await expect(page.getByText('RECETTE DU JOUR', { exact: false })).toBeVisible();
  const tuileMvan = page.locator('a', { hasText: 'Yaoundé Mvan' }).first();
  expect(nombre(await tuileMvan.locator('.ttl').first().textContent())).toBe(ventesGare);
  const total = nombre(await page.locator('a', { hasText: 'Recette du jour' }).locator('.big').first().textContent());
  expect(total).toBeGreaterThan(ventesGare); // le total couvre toutes les gares

  // l'assistant lit les chiffres du monde et propose un prix
  await dock(page).getByRole('link', { name: 'Assistant', exact: true }).click();
  await page.getByPlaceholder('Pose ta question…').fill('Pourquoi les ventes baissent sur Yaoundé → Douala ?');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
  await expect(page.locator('.cause').first()).toContainText('Finex propose un 06:15');
  await page.getByRole('button', { name: /Passer le 07:00/ }).click();
  await page.getByRole('button', { name: 'Oui, appliquer' }).click();
  await expect(page.getByText('Prix appliqué')).toBeVisible();
  let m = await lireMonde(page);
  const futurs = m.departs.filter((d) => d.ligneId === 'l-BX-Classique-mvan-aller' && d.heure === '07:00' && d.jour >= '2026-11-04');
  expect(futurs.length).toBeGreaterThan(5);
  const nouveau = futurs[0].prix;
  expect(nouveau).toBeLessThan(7000);
  expect(new Set(futurs.map((d) => d.prix))).toEqual(new Set([nouveau]));

  // modules : Covoiturage éteint, écrit dans le monde
  await aller(page, '/modules');
  const covoit = page.getByRole('switch', { name: 'Covoiturage', exact: true });
  await covoit.click();
  await expect(covoit).toHaveAttribute('aria-checked', 'false');
  m = await lireMonde(page);
  expect(m.params.modules.covoiturage).toBe(false);

  // la voyageuse voit le nouveau prix du 07 h et plus de covoiturage
  await entrerEn(page, 'p-aicha');
  await page.locator('.tick', { hasText: '6h' }).click();
  const prixRe = new RegExp(String(nouveau).replace(/(\d)(\d{3})$/, '$1[\\s\\u202f\\u00a0]?$2') + '[\\s\\u202f\\u00a0]?F');
  const sept = page.locator('.colm.front .bus', { hasText: '07:00' });
  await expect(sept).toContainText(prixRe);
  await sept.click();
  await expect(page.locator('.sel a.b.p')).toHaveAttribute('href', new RegExp(`&prix=${nouveau}$`));
  // le prix affiché est le prix payé (écran de siège, puis récapitulatif de paiement)
  await page.locator('.sel a.b.p').click();
  await siegeLibre(page).click();
  const payer = page.getByRole('button', { name: prixRe });
  await expect(payer).toBeVisible();
  await payer.click();
  await expect(page.getByRole('button', { name: prixRe })).toBeVisible();
  await expect(page.locator('.big')).toContainText(prixRe);
  await aller(page, '/covoit');
  await expect(page.getByText('Covoiturage : désactivé')).toBeVisible();
  await aller(page, '/orbe');
  await expect(page.getByRole('link', { name: 'Covoiturage' })).toHaveCount(0);

  // le patron le rallume : tout revient
  await entrerEn(page, 'p-luther');
  await aller(page, '/modules');
  await page.getByRole('switch', { name: 'Covoiturage', exact: true }).click();
  expect((await lireMonde(page)).params.modules.covoiturage).toBe(true);
  await entrerEn(page, 'p-aicha');
  await aller(page, '/covoit');
  await expect(page.getByText('Covoiturage : désactivé')).toHaveCount(0);
});
