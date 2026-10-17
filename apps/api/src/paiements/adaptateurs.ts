import { Injectable } from "@nestjs/common";
import { Refus } from "../billetterie/erreurs";
import { CommandesService } from "../billetterie/commandes.service";
import { Catalogue, Commandes, ConversionDevises, type ConversionFcfa } from "../billetterie/ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONTEXTE_TELEPHONE } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { PasserelleSmsService } from "../sms/passerelle.service";
import { GardeAgregateur } from "./garde-agregateur";
import {
  AnnuaireVoyageurs,
  CommandesAPayer,
  NotifieurPaiements,
  type CommandeAPayer,
} from "./ports";

/**
 * Adaptateurs vers les autres modules : les paiements ne parlent à la billetterie, aux comptes et
 * aux SMS que par leurs ports et services exportés, sans rien y modifier.
 */

/** Les commandes de la billetterie (`Commandes`, `Catalogue`) et `CommandesService.confirmerPaiement`. */
@Injectable()
export class CommandesBilletterie extends CommandesAPayer {
  constructor(
    private readonly commandes: Commandes,
    private readonly catalogue: Catalogue,
    private readonly service: CommandesService,
  ) {
    super();
  }

  async trouver(commandeId: string): Promise<CommandeAPayer | null> {
    const c = await this.commandes.trouver(commandeId);
    if (!c) return null;
    const depart = await this.catalogue.depart(c.departId);
    if (!depart) return null;
    return {
      id: c.id,
      voyageurId: c.voyageurId,
      compagnieId: depart.compagnie.id,
      libelle: c.libelle,
      lignes: c.lignes.map((l) => ({ code: l.code, libelle: l.libelle, montant: l.montant })),
      total: c.total,
      conversion: c.conversion,
      statut: c.statut,
      expireA: new Date(c.expireA),
      nombreSieges: c.sieges.length,
      billetIds: [...c.billetIds],
    };
  }

  async confirmer(commandeId: string, moyen: string): Promise<string[]> {
    const { billets } = await this.service.confirmerPaiement(commandeId, moyen);
    return billets.map((b) => b.id);
  }
}

/** Le lien part par la passerelle SMS (type `systeme` : texte libre, jamais joignable depuis une route). */
@Injectable()
export class NotifieurSms extends NotifieurPaiements {
  constructor(private readonly passerelle: PasserelleSmsService) {
    super();
  }

  async envoyerLien(a: Parameters<NotifieurPaiements["envoyerLien"]>[0]): Promise<void> {
    await this.passerelle.envoyer({
      type: "systeme",
      variables: { texte: a.texte },
      destinataire: a.telephone,
      cle: a.cle,
      compagnieId: a.compagnieId,
      demandeurId: a.demandeurId,
      reference: { type: "commande", id: a.commandeId },
    });
  }
}

/** Téléphone et prénom d'un voyageur d'après son compte. */
@Injectable()
export class AnnuaireComptes extends AnnuaireVoyageurs {
  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async telephone(voyageurId: string): Promise<string | null> {
    const p = await this.personnes.trouverParId(voyageurId);
    return p ? this.chiffrement.dechiffrer(p.telephoneChiffre, CONTEXTE_TELEPHONE) : null;
  }

  async prenom(voyageurId: string): Promise<string | null> {
    const p = await this.personnes.trouverParId(voyageurId);
    const prenom = p?.nom.trim().split(/\s+/)[0];
    return prenom ? prenom : null;
  }
}

/**
 * `ConversionDevises` de la billetterie, au taux de l'agrégateur (carte d'un proche à l'étranger).
 * Le montant reste « approximatif » : le débit final se fait au taux du jour de l'émetteur de la carte.
 * À brancher par l'intégration à la place de `ConversionMemoire` (taux indicatifs).
 */
@Injectable()
export class ConversionDevisesPaiements extends ConversionDevises {
  constructor(private readonly garde: GardeAgregateur) {
    super();
  }

  async convertir(montantFcfa: number, devise: string): Promise<ConversionFcfa | null> {
    let taux: number | null;
    try {
      taux = await this.garde.tauxMillieme(devise);
    } catch {
      throw new Refus(503, "CONVERSION_INDISPONIBLE", "Le taux de change est indisponible");
    }
    if (taux === null) return null;
    return {
      devise,
      montantMineur: Math.round((montantFcfa * 100 * 1000) / taux),
      approximatif: true,
    };
  }
}
