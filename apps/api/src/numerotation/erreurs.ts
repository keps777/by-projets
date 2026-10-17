import type { AttributionPlage } from "./ports";
import type { Plage } from "./regles";

/** La demande d'attribution est incohérente (rang hors plan, plage mal formée, plage réservée au serveur). */
export class PlageInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlageInvalide";
  }
}

/** Cette plage recouvre celle d'un autre appareil de la gare : un numéro serait attribué deux fois. */
export class PlageChevauchante extends Error {
  constructor(
    readonly demandee: Plage,
    readonly enConflitAvec: AttributionPlage,
  ) {
    super(
      `La plage ${demandee.debut}–${demandee.fin} recouvre celle de l'appareil ` +
        `${enConflitAvec.appareilId} (${enConflitAvec.plage.debut}–${enConflitAvec.plage.fin})`,
    );
    this.name = "PlageChevauchante";
  }
}

export class AppareilSansPlage extends Error {
  constructor(readonly appareilId: string) {
    super(`Aucune plage n'est attribuée à l'appareil ${appareilId}`);
    this.name = "AppareilSansPlage";
  }
}

/** Les numéros 4001–9999 d'une gare sont tous pris pour ce jour : le serveur ne numérote plus. */
export class NumerosEnLigneEpuises extends Error {
  constructor(
    readonly gareId: string,
    readonly jour: string,
  ) {
    super(`Plus de numéro en ligne pour la gare ${gareId} le ${jour}`);
    this.name = "NumerosEnLigneEpuises";
  }
}
