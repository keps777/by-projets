import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { RemboursementsService } from "../paiements/remboursements.service";
import {
  CommandesAPayer,
  ComptesReversement,
  Paiements,
  type CommandeAPayer,
} from "../paiements/ports";
import { PasserelleSmsService } from "../sms/passerelle.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONTEXTE_TELEPHONE } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import {
  AnnuaireCovoiturage,
  NotifieurCovoiturage,
  RemboursementsCovoiturage,
  Reservations,
  type DemandeRemboursementCovoiturage,
  type IssueRemboursement,
  type NotificationCovoiturage,
} from "./ports";
import { ReservationsService } from "./reservations.service";
import { devisReservation } from "./regles";
import { statutCommande } from "./vues";

/**
 * Adaptateurs vers les autres modules : le covoiturage ne parle aux comptes, aux SMS et aux
 * paiements que par leurs ports et services exportés, sans rien y modifier.
 */

/** Nom et téléphone d'une personne d'après son compte. */
@Injectable()
export class AnnuaireComptesCovoiturage extends AnnuaireCovoiturage {
  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async identite(personneId: string) {
    const p = await this.personnes.trouverParId(personneId);
    if (!p) return null;
    return {
      nom: p.nom,
      telephone: this.chiffrement.dechiffrer(p.telephoneChiffre, CONTEXTE_TELEPHONE),
    };
  }
}

/**
 * Les SMS partent par la passerelle (type `systeme` : texte fixe écrit par ce module, jamais joignable
 * depuis une route). Un SMS qui ne part pas ne fait jamais échouer l'opération qui l'a demandé.
 */
@Injectable()
export class NotifieurSmsCovoiturage extends NotifieurCovoiturage {
  private readonly journal = new Logger("NotifieurCovoiturage");

  constructor(
    private readonly passerelle: PasserelleSmsService,
    private readonly annuaire: AnnuaireCovoiturage,
  ) {
    super();
  }

  async notifier(n: NotificationCovoiturage): Promise<void> {
    try {
      const identite = await this.annuaire.identite(n.personneId);
      if (!identite?.telephone) return;
      await this.passerelle.envoyer({
        type: "systeme",
        variables: { texte: n.texte },
        destinataire: identite.telephone,
        cle: n.cle,
        reference: n.reference,
      });
    } catch (e) {
      this.journal.warn(`SMS « ${n.cle} » non envoyé : ${e instanceof Error ? e.name : "erreur"}`);
    }
  }
}

/**
 * Remboursement du passager par `RemboursementsService` : le prix revient de la part « compagnie » du
 * paiement (le compte de séquestre du covoiturage), les frais de la part d'AfriMove. Le remboursement
 * est mis en file ; le balayage des paiements l'envoie et le reprend en cas de panne.
 */
@Injectable()
export class RemboursementsViaPaiements extends RemboursementsCovoiturage {
  constructor(
    private readonly paiements: Paiements,
    private readonly remboursements: RemboursementsService,
  ) {
    super();
  }

  async rembourser(d: DemandeRemboursementCovoiturage): Promise<IssueRemboursement> {
    const paiement = (await this.paiements.duCommande(d.reservationId)).find(
      (p) => p.statut === "reussi" && p.confirmation === "faite",
    );
    if (!paiement) return "sans_paiement";
    if (paiement.fournisseur === null) return "hors_agregateur";
    const lignes = [
      { beneficiaire: "compagnie" as const, montant: d.prix },
      { beneficiaire: "afrimove" as const, montant: d.frais },
    ].filter((l) => l.montant > 0);
    if (lignes.length === 0) return "demande";
    await this.remboursements.demander(paiement.id, {
      lignes,
      cause:
        d.cause === "trajet_annule"
          ? "depart_annule"
          : d.cause === "annulation_passager"
            ? "billet_annule"
            : "sieges_perdus",
      cle: d.cle,
      differe: true,
    });
    return "demande";
  }
}

/** Une réservation vue des paiements comme une commande à payer. */
@Injectable()
export class CommandesCovoiturage {
  constructor(
    private readonly reservations: Reservations,
    private readonly horloge: Horloge,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  async trouver(commandeId: string): Promise<CommandeAPayer | null> {
    const r = await this.reservations.trouver(commandeId);
    if (!r) return null;
    const devis = devisReservation(r.prixParPlace, r.places, r.fraisParPlace);
    return {
      id: r.id,
      voyageurId: r.passagerId,
      compagnieId: this.config.compagnieSequestreId,
      libelle: r.libelle,
      lignes: devis.lignes,
      total: devis.total,
      conversion: null,
      statut: statutCommande(r, this.horloge.maintenant()),
      expireA: r.expireA,
      nombreSieges: r.places,
      billetIds: [],
    };
  }
}

const MARQUE = Symbol.for("afrimove.covoiturage.paiements-abonnes");

/**
 * Branche les réservations de covoiturage sur les paiements sans toucher à leur module : au
 * démarrage, l'instance partagée de `CommandesAPayer` est enveloppée une seule fois. Une commande qui
 * est une réservation de covoiturage est lue et confirmée ici ; toute autre va à la billetterie comme
 * avant. Même procédé que `AbonnementAvisBilletterie` des paiements. Désactivable avec
 * `COVOITURAGE_ABONNER_PAIEMENTS=false` si l'intégration compose elle-même `CommandesAPayer`.
 *
 * Enregistre aussi le compte de séquestre chez les paiements quand `COVOITURAGE_COMPTE_SEQUESTRE`
 * est donné.
 */
@Injectable()
export class AbonnementPaiementsCovoiturage implements OnModuleInit {
  private readonly journal = new Logger("AbonnementPaiementsCovoiturage");

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly commandes: CommandesCovoiturage,
    private readonly reservations: Reservations,
    private readonly service: ReservationsService,
    private readonly comptes: ComptesReversement,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.compteSequestre !== null) {
      await this.comptes.definir(this.config.compagnieSequestreId, this.config.compteSequestre);
    }
    if (!this.config.abonnerPaiements) return;

    let cible: CommandesAPayer & { [MARQUE]?: AbonnementPaiementsCovoiturage };
    try {
      cible = this.moduleRef.get(CommandesAPayer, { strict: false });
    } catch {
      this.journal.warn("CommandesAPayer introuvable : les paiements ne sont pas branchés");
      return;
    }
    if (cible[MARQUE] === this) return;
    cible[MARQUE] = this;
    const trouverOriginal = cible.trouver.bind(cible);
    const confirmerOriginal = cible.confirmer.bind(cible);
    cible.trouver = async (commandeId: string) =>
      (await this.commandes.trouver(commandeId)) ?? trouverOriginal(commandeId);
    cible.confirmer = async (commandeId: string, moyen: string) => {
      if (await this.reservations.trouver(commandeId)) {
        return this.service.confirmerPaiement(commandeId, moyen);
      }
      return confirmerOriginal(commandeId, moyen);
    };
  }
}
