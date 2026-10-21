import {
  AGENCE,
  AUTRE_AGENCE,
  BAFOUSSAM,
  DOUALA_AKWA,
  GARE_AUTRE_AGENCE,
  PIN_PATRON,
  YAOUNDE_MVAN,
  creerAppModulesTest,
  type OptionsAppModulesTest,
} from "../../modules/testing/app-modules-test";
import { AppareilsSync } from "../../sync/ports";
import { AnnuaireAdmin, Lignes, Programme } from "../ports";
import type { AnnuaireAdminMemoire, LignesMemoire, ProgrammeMemoire } from "../memoire";

export {
  AGENCE,
  AUTRE_AGENCE,
  BAFOUSSAM,
  DOUALA_AKWA,
  GARE_AUTRE_AGENCE,
  PIN_PATRON,
  YAOUNDE_MVAN,
};

/**
 * L'API complète (gardes, rôles, journal d'audit) avec l'administration sur ses adaptateurs en mémoire, une agence
 * « ALP » à trois gares (Douala DLA, Yaoundé YDE, Bafoussam BFM) et une autre agence « DEM ». L'horloge démarre
 * le lundi 2 novembre 2026 à 9 h, heure de Douala.
 */
export async function creerAppAdminTest(options: OptionsAppModulesTest = {}) {
  const base = await creerAppModulesTest(options);
  const annuaire = base.app.get(AnnuaireAdmin) as AnnuaireAdminMemoire;
  annuaire.declarerCompagnie({ id: AGENCE, code: "ALP", nom: "Alpha Voyages" });
  annuaire.declarerCompagnie({ id: AUTRE_AGENCE, code: "DEM", nom: "Demo Express" });
  const gares = [
    { id: DOUALA_AKWA, compagnieId: AGENCE, code: "DLA", nom: "Douala Akwa", ville: "Douala" },
    { id: YAOUNDE_MVAN, compagnieId: AGENCE, code: "YDE", nom: "Yaoundé Mvan", ville: "Yaoundé" },
    { id: BAFOUSSAM, compagnieId: AGENCE, code: "BFM", nom: "Bafoussam", ville: "Bafoussam" },
    {
      id: GARE_AUTRE_AGENCE,
      compagnieId: AUTRE_AGENCE,
      code: "DLA",
      nom: "Douala Akwa",
      ville: "Douala",
    },
  ];
  for (const g of gares) annuaire.declarerGare(g);

  const signature = (pin = PIN_PATRON, signeA = base.iso()) => ({
    pin,
    methode: "pin" as const,
    signeA,
  });

  return {
    ...base,
    annuaireAdmin: annuaire,
    lignesMemoire: base.app.get(Lignes) as LignesMemoire,
    programmeMemoire: base.app.get(Programme) as ProgrammeMemoire,
    appareilsSync: base.app.get(AppareilsSync),
    signature,
    /** `Authorization: Bearer …`. */
    auth: (jeton: string) => ({ Authorization: `Bearer ${jeton}` }),
    /** Tout le journal d'audit en texte (les numéros d'ordre sont des BigInt). */
    journalEnTexte: () =>
      JSON.stringify(base.auditRepo.lignes, (_cle, valeur: unknown) =>
        typeof valeur === "bigint" ? valeur.toString() : valeur,
      ),
  };
}

export type AppAdminTest = Awaited<ReturnType<typeof creerAppAdminTest>>;
