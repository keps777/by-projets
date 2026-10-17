import { HttpException, Injectable } from "@nestjs/common";
import { Horloge } from "../../socle/horloge";
import { versIsoDouala } from "../temps";
import { EvenementsTraites } from "./ports";

export interface Accuse {
  evenementId: string;
  statut: "accepte" | "deja_recu";
  recuA: string;
}

/**
 * Idempotence des écritures de l'agence. L'UUID de l'événement, créé sur l'appareil, est la clé :
 * renvoyer le même événement (retour du réseau, relance du moteur hors ligne) ne fait rien de plus et
 * répond `deja_recu` avec le résultat de la première fois. Un événement refusé (4xx) n'est pas
 * retenu : l'appareil peut le renvoyer une fois la cause levée.
 */
@Injectable()
export class IdempotenceService {
  constructor(
    private readonly traites: EvenementsTraites,
    private readonly horloge: Horloge,
  ) {}

  async executer<R extends object>(
    evenementId: string,
    traiter: () => Promise<R>,
  ): Promise<R & { accuse: Accuse }> {
    const etat = await this.traites.commencer(evenementId);
    if (etat.etat === "termine") {
      return {
        ...(etat.resultat as R),
        accuse: { evenementId, statut: "deja_recu", recuA: etat.recuA },
      };
    }
    if (etat.etat === "en_cours") {
      // 425 : le moteur hors ligne et le client HTTP relancent seuls les statuts de ce genre.
      throw new HttpException(
        { code: "EVENEMENT_EN_COURS", message: "Cet événement est en cours de traitement" },
        425,
      );
    }
    try {
      const resultat = await traiter();
      const recuA = versIsoDouala(this.horloge.maintenant());
      await this.traites.terminer(evenementId, resultat, recuA);
      return { ...resultat, accuse: { evenementId, statut: "accepte", recuA } };
    } catch (e) {
      await this.traites.abandonner(evenementId);
      throw e;
    }
  }
}
