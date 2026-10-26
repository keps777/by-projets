// Aides communes aux tests de bout en bout : ouvrir l'application avec un état de départ choisi, lire l'état persisté.
import { expect, test, type Page } from '@playwright/test';
import { decoder, encoder } from '../src/data/codec';
import { CLE_STOCKAGE, CODE_DEMO } from '../src/data/constantes';
import { etatInitial } from '../src/data/seed';
import type { Etat } from '../src/domain/types';

export { expect, test, CODE_DEMO };
/** Ouvre `chemin` avec le monde de démonstration. `connecte` : identifiant du compte déjà connecté (« ACC-0412 » = Alex) ; `preparer` : retouche l'état avant le chargement. L'état n'est écrit qu'une fois, un rechargement le garde. */
export async function ouvrir(page: Page, chemin: string, opts: { connecte?: string; preparer?: (e: Etat) => void } = {}) {
  const e = etatInitial(); if (opts.connecte) e.session.compteId = opts.connecte; opts.preparer?.(e);
  await page.addInitScript(([cle, v]) => { if (!localStorage.getItem(cle)) localStorage.setItem(cle, v); }, [CLE_STOCKAGE, encoder(e)] as const);
  await page.goto(chemin);
}
/** L'état persisté par l'application (attend l'écriture différée de 150 ms). */
export async function lireEtat(page: Page): Promise<Etat> {
  await page.waitForTimeout(300);
  const brut = await page.evaluate((cle) => localStorage.getItem(cle), CLE_STOCKAGE);
  return decoder(brut!) as Etat;
}
export const chemin = (page: Page) => new URL(page.url()).pathname;
/** Aucun défilement horizontal de la page (à 320 px comme à 390 px). */
export async function sansDebordement(page: Page): Promise<boolean> { return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); }
