import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { agenceDe, EcrituresSignees, type AccuseSigne } from "./ecritures";
import { ReglagesFinancement } from "./ports";
import { decouperEnDeuxFois, type DeuxFois } from "./regles";
import { lireReglageDeuxFois } from "./validation";

export type BilletEnDeuxFoisRegle = AccuseSigne & { actif: boolean };

/**
 * Paiement du billet en 2 fois pour les voyageurs, option de l'agence : une part à la réservation (le
 * siège est bloqué), le reste la veille du départ (le billet part au 2e paiement). Les deux parts vont à la
 * compagnie comme tout paiement de billet : AfriMove ne détient rien.
 *
 * Ce service porte le réglage et la règle de découpage ; la billetterie et les paiements l'appellent
 * (`plan`) pour savoir si l'agence propose l'option et combien demander à chaque fois.
 */
@Injectable()
export class DeuxFoisService {
  constructor(
    private readonly reglages: ReglagesFinancement,
    private readonly ecritures: EcrituresSignees,
  ) {}

  /** Route ajoutée (absente des contrats) : le patron active ou coupe l'option pour son agence. */
  async regler(utilisateur: Utilisateur, corps: unknown): Promise<BilletEnDeuxFoisRegle> {
    const cmd = lireReglageDeuxFois(corps);
    const agenceId = agenceDe(utilisateur);
    return this.ecritures.executer(
      utilisateur,
      "financement.billet_en_deux_fois",
      { actif: cmd.actif },
      cmd.signature,
      async () => {
        await this.reglages.definirBilletEnDeuxFois(agenceId, cmd.actif);
        return { reponse: { actif: cmd.actif }, cible: { type: "agence", id: agenceId } };
      },
    );
  }

  /** L'agence propose-t-elle de payer en 2 fois ? */
  async actif(agenceId: string): Promise<boolean> {
    return (await this.reglages.lire(agenceId)).billetEnDeuxFois;
  }

  /**
   * Les deux paiements d'un billet de `prix` FCFA, ou `null` si l'agence n'a pas activé l'option ou si le
   * billet est trop petit pour être coupé.
   */
  async plan(agenceId: string, prix: number): Promise<DeuxFois | null> {
    return (await this.actif(agenceId)) ? decouperEnDeuxFois(prix) : null;
  }
}
