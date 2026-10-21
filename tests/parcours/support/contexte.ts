import type { Browser } from "playwright";
import { afterAll, beforeAll, inject, it } from "vitest";
import { Parcours, lancerNavigateur, type OptionsOuverture } from "./parcours";

/**
 * Un Chromium par fichier de tests, un téléphone neuf par parcours. À appeler une fois en tête de fichier :
 * `const { ouvrir } = utiliserBanc();`.
 */
export function utiliserBanc(): { ouvrir: (options: OptionsOuverture) => Promise<Parcours> } {
  let navigateur: Browser;
  const ouverts: Parcours[] = [];

  beforeAll(async () => {
    navigateur = await lancerNavigateur();
  });

  afterAll(async () => {
    for (const p of ouverts) await p.fermer().catch(() => undefined);
    await navigateur?.close();
  });

  return {
    async ouvrir(options) {
      const p = await Parcours.ouvrir(navigateur, inject("urlApp"), options);
      ouverts.push(p);
      return p;
    },
  };
}

/**
 * Parcours dont le comportement actuel de l'application s'écarte de la carte des parcours (écran qui demande
 * plus de touches, lien manquant, donnée de démonstration absente). Le scénario décrit le comportement ATTENDU
 * et reste écrit en entier : `it.fails` le fait passer tant que l'écart existe et le fait échouer le jour où
 * il est corrigé (il faut alors retirer la marque). Chaque écart est détaillé dans le rapport du ticket.
 *
 * `PARCOURS_ECARTS=1` joue ces scénarios comme des tests ordinaires : ils échouent, avec le message exact de
 * l'écart (écran, étape, touches comptées).
 */
export function ecartConnu(nom: string, ecart: string, corps: () => Promise<void>): void {
  const titre = `${nom} — ÉCART CONNU : ${ecart}`;
  if (process.env["PARCOURS_ECARTS"] === "1") it(titre, corps);
  else it.fails(titre, corps);
}
