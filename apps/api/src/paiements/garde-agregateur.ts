import { Injectable } from "@nestjs/common";
import {
  AgregateurPaiement,
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  type DemandeEncaissement,
  type DemandeRemboursementAgregateur,
  type ReponseEncaissement,
  type ReponseRemboursement,
  type StatutTransaction,
} from "./agregateur";
import { DisjoncteurPaiements } from "./disjoncteur";

/** Code porté par l'erreur quand le disjoncteur est ouvert : l'appel n'est pas parti. */
export const CODE_CIRCUIT_OUVERT = "circuit_ouvert";

/**
 * Tous les appels à l'agrégateur passent par ici : le disjoncteur compte les échecs (réseau, délai,
 * 5xx), laisse passer un seul appel d'essai quand il est « semi-ouvert », et coupe les appels tant
 * qu'il est ouvert. Un refus définitif (carte refusée) prouve que l'agrégateur répond : il ne compte
 * pas comme une panne.
 */
@Injectable()
export class GardeAgregateur {
  constructor(
    readonly agregateur: AgregateurPaiement,
    readonly disjoncteur: DisjoncteurPaiements,
  ) {}

  private async garder<T>(appel: () => Promise<T>): Promise<T> {
    if (!this.disjoncteur.autoriser()) throw new ErreurAgregateurTemporaire(CODE_CIRCUIT_OUVERT);
    try {
      const resultat = await appel();
      this.disjoncteur.succes();
      return resultat;
    } catch (e) {
      if (e instanceof ErreurAgregateurDefinitive) {
        this.disjoncteur.succes();
        throw e;
      }
      this.disjoncteur.echec();
      // Toute autre erreur est traitée comme temporaire (contrat du port).
      if (e instanceof ErreurAgregateurTemporaire) throw e;
      throw new ErreurAgregateurTemporaire("erreur_inattendue");
    }
  }

  initier(demande: DemandeEncaissement): Promise<ReponseEncaissement> {
    return this.garder(() => this.agregateur.initier(demande));
  }

  consulter(reference: string): Promise<StatutTransaction | null> {
    return this.garder(() => this.agregateur.consulter(reference));
  }

  rembourser(demande: DemandeRemboursementAgregateur): Promise<ReponseRemboursement> {
    return this.garder(() => this.agregateur.rembourser(demande));
  }

  tauxMillieme(devise: string): Promise<number | null> {
    return this.garder(() => this.agregateur.tauxMillieme(devise));
  }
}
