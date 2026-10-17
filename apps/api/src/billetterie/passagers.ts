import { Injectable } from "@nestjs/common";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import type { Passager } from "./modeles";

const CONTEXTE_PASSAGER = "billet.passager";
const CONTEXTE_PASSAGERS = "commande.passagers";
const CONTEXTE_REPONSE = "billetterie.evenement";

/**
 * Chiffrement au repos de ce qui identifie un voyageur : nom, téléphone, 4 derniers chiffres de la
 * pièce d'identité (billets), passagers d'une commande, et les réponses mémorisées des événements
 * (elles reprennent le billet imprimé). Le téléphone se retrouve par un index aveugle.
 */
@Injectable()
export class Passagers {
  constructor(private readonly chiffrement: ChiffrementService) {}

  chiffrer(passager: Passager): string {
    return this.chiffrement.chiffrerJson(passager, CONTEXTE_PASSAGER);
  }

  dechiffrer(valeur: string): Passager {
    return this.chiffrement.dechiffrerJson<Passager>(valeur, CONTEXTE_PASSAGER);
  }

  indexTelephone(telephone: string | null): string | null {
    return telephone ? this.chiffrement.indexAveugle(telephone, "telephone") : null;
  }

  chiffrerListe(passagers: readonly Passager[]): string {
    return this.chiffrement.chiffrerJson(passagers, CONTEXTE_PASSAGERS);
  }

  dechiffrerListe(valeur: string): Passager[] {
    return this.chiffrement.dechiffrerJson<Passager[]>(valeur, CONTEXTE_PASSAGERS);
  }

  chiffrerReponse(reponse: unknown): string {
    return this.chiffrement.chiffrerJson(reponse, CONTEXTE_REPONSE);
  }

  dechiffrerReponse<T>(valeur: string): T {
    return this.chiffrement.dechiffrerJson<T>(valeur, CONTEXTE_REPONSE);
  }
}
