import { Injectable } from "@nestjs/common";
import { Clotures } from "./ports";
import {
  debutDuMois,
  estMoisValide,
  libelleMois,
  moisDe,
  moisSuivant,
  debutDuMoisSuivant,
} from "./temps";
import { erreurApi } from "./validation";

/**
 * Le verrou des mois clôturés, à la disposition des autres modules (caisse, billetterie, synchronisation,
 * paiements) : « un mois verrouillé refuse toute écriture ». Une écriture datée d'un mois clôturé est
 * refusée (409 `MOIS_VERROUILLE`) ; elle doit s'écrire dans le premier mois ouvert qui suit
 * (`premierInstantOuvert`). Le module comptable l'utilise lui-même pour ses propres écritures.
 */
@Injectable()
export class VerrouillageMois {
  constructor(private readonly clotures: Clotures) {}

  private moisDeLa(cible: string | Date): string {
    return typeof cible === "string" && estMoisValide(cible) ? cible : moisDe(cible);
  }

  async estVerrouille(compagnieId: string, cible: string | Date): Promise<boolean> {
    return this.clotures.existe(compagnieId, this.moisDeLa(cible));
  }

  /** Lève 409 `MOIS_VERROUILLE` si le mois (ou l'instant) tombe dans un mois clôturé. */
  async exigerOuvert(compagnieId: string, cible: string | Date): Promise<void> {
    const mois = this.moisDeLa(cible);
    if (await this.estVerrouille(compagnieId, mois)) {
      throw erreurApi(
        409,
        "MOIS_VERROUILLE",
        `${libelleMois(mois)} est clôturé : l'écriture se fait dans le mois suivant`,
      );
    }
  }

  /**
   * L'instant où une écriture datée de `instant` doit s'inscrire (ISO UTC) : `instant` lui-même si son mois est
   * ouvert, sinon le début du premier mois ouvert qui suit (« seulement des écritures du mois suivant »).
   */
  async premierInstantOuvert(compagnieId: string, instant: Date): Promise<string> {
    let mois = moisDe(instant);
    if (!(await this.estVerrouille(compagnieId, mois))) return instant.toISOString();
    // Au plus une centaine de mois d'affilée : au-delà, il y a un problème de données.
    for (let i = 0; i < 120; i++) {
      mois = moisSuivant(mois);
      if (!(await this.estVerrouille(compagnieId, mois))) {
        return new Date(debutDuMois(mois)).toISOString();
      }
    }
    throw erreurApi(409, "MOIS_VERROUILLE", `Aucun mois ouvert après ${debutDuMoisSuivant(mois)}`);
  }
}

/** Une file par clé : deux appels sur la même clé s'exécutent l'un après l'autre (double clic, rejeu). */
export class Exclusion {
  private readonly files = new Map<string, Promise<unknown>>();

  async executer<T>(cle: string, travail: () => Promise<T>): Promise<T> {
    const precedent = this.files.get(cle) ?? Promise.resolve();
    const courant = precedent.then(travail, travail);
    const suite = courant.catch(() => undefined);
    this.files.set(cle, suite);
    try {
      return await courant;
    } finally {
      if (this.files.get(cle) === suite) this.files.delete(cle);
    }
  }
}
