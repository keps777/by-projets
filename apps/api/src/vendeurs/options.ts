import { DELAI_REGLEMENT_MS, SONDAGE_REGLEMENT_MS } from "./regles";
import type { OptionsVendeurs } from "./ports";

export const BASE_LIEN_BILLET_DEFAUT = "https://afrimove.app/b/";

/** Période par défaut des tâches de fond : 15 s (une vente en attente se résout vite). */
export const TACHES_PERIODE_DEFAUT_MS = 15_000;

/**
 * Réglages du module, lus dans l'environnement :
 * `VENDEURS_DELAI_REGLEMENT_MS` (60 000), `VENDEURS_SONDAGE_MS` (1 000), `VENDEURS_TACHES_MS` (15 000 ;
 * 0 = pas de minuterie), `VENDEURS_BASE_LIEN_BILLET` (https, terminée par « / »). Une valeur
 * illisible fait échouer le démarrage plutôt que de prendre un défaut en silence.
 */
export function chargerOptionsVendeurs(
  env: Record<string, string | undefined> = process.env,
): OptionsVendeurs {
  const entier = (nom: string, defaut: number, min: number, max: number): number => {
    const brut = env[nom];
    if (brut === undefined || brut === "") return defaut;
    const n = Number(brut);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new Error(`${nom} : entier entre ${min} et ${max} attendu`);
    }
    return n;
  };
  const baseLienBillet = env["VENDEURS_BASE_LIEN_BILLET"] || BASE_LIEN_BILLET_DEFAUT;
  if (
    !/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?\/$/.test(baseLienBillet) ||
    baseLienBillet.length > 40
  ) {
    throw new Error(
      "VENDEURS_BASE_LIEN_BILLET : adresse https terminée par « / », 40 caractères au plus",
    );
  }
  return {
    delaiReglementMs: entier("VENDEURS_DELAI_REGLEMENT_MS", DELAI_REGLEMENT_MS, 0, 300_000),
    sondageMs: entier("VENDEURS_SONDAGE_MS", SONDAGE_REGLEMENT_MS, 1, 60_000),
    tachesMs: entier("VENDEURS_TACHES_MS", TACHES_PERIODE_DEFAUT_MS, 0, 3_600_000),
    baseLienBillet,
  };
}
