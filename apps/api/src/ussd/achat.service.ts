import { Inject, Injectable } from "@nestjs/common";
import { Refus, conflit } from "../billetterie/erreurs";
import type { Billet, DepartComplet } from "../billetterie/modeles";
import { Billets, Catalogue, Commandes } from "../billetterie/ports";
import { CommandesService } from "../billetterie/commandes.service";
import { DepartsService } from "../billetterie/departs.service";
import { SiegesService } from "../billetterie/sieges.service";
import { MS_PAR_JOUR, hhmmDouala, jourDouala } from "../billetterie/temps";
import { prixDuDepart } from "../billetterie/vues";
import { ModeDegradeService } from "../paiements/mode-degrade.service";
import type { Paiement } from "../paiements/modeles";
import { PaiementsService } from "../paiements/paiements.service";
import { Paiements } from "../paiements/ports";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { CONFIG_USSD, type ConfigUssd, type OperateurUssd } from "./config";
import { AchatsUssd, SuiviBusUssd } from "./ports";
import { TEXTES, type BilletUssd, type BusUssd, type LigneDepartUssd } from "./textes";

/** Plus aucun siège libre sur le départ choisi. */
export class DepartCompletUssd extends Error {
  constructor() {
    super("Départ complet");
    this.name = "DepartCompletUssd";
  }
}

/** Le total de la commande n'est pas le prix affiché (le code « sans frais » ne fait pas son effet). */
export class PrixInattenduUssd extends Error {
  constructor(
    readonly attendu: number,
    readonly obtenu: number,
  ) {
    super(`Prix inattendu : ${obtenu} F au lieu de ${attendu} F`);
    this.name = "PrixInattenduUssd";
  }
}

export interface DepartPropose {
  id: string;
  ligne: LigneDepartUssd;
}

export interface ListeDeparts {
  depart: string;
  arrivee: string;
  /** Aucun départ aujourd'hui : la liste est celle de demain. */
  demain: boolean;
  departs: DepartPropose[];
}

export interface ReservationUssd {
  commandeId: string;
  siege: number;
}

export interface BilletAVenir {
  billet: Billet;
  dc: DepartComplet;
}

export const CONTEXTE_DESTINATAIRE = (commandeId: string): string => `ussd.achat:${commandeId}`;

/** Essais de sièges avant de dire que le départ est complet (un autre voyageur peut nous devancer). */
const ESSAIS_SIEGE = 3;

/**
 * L'achat par USSD, de la liste des départs au paiement : tout passe par la billetterie et les
 * paiements, avec leurs règles (prix du tarif, siège retenu 15 minutes, filtres du voyageur,
 * un seul paiement par commande, mode dégradé). Rien n'est recalculé ici.
 *
 * Deux choix du produit : le siège est attribué (le plus petit siège libre) pour tenir en trois
 * réponses, et la commande porte le code « sans frais » pour que le prix payé soit le prix affiché.
 */
@Injectable()
export class AchatUssdService {
  constructor(
    private readonly departs: DepartsService,
    private readonly sieges: SiegesService,
    private readonly commandes: CommandesService,
    private readonly paiements: PaiementsService,
    private readonly mode: ModeDegradeService,
    private readonly billets: Billets,
    private readonly catalogue: Catalogue,
    private readonly commandesPort: Commandes,
    private readonly paiementsPort: Paiements,
    private readonly achats: AchatsUssd,
    private readonly suiviBus: SuiviBusUssd,
    private readonly chiffrement: ChiffrementService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_USSD) private readonly config: ConfigUssd,
  ) {}

  /* ------------------------------------------------------------------ départs */

  /** Le paiement en ligne est-il disponible ? Sinon on ne retient aucune place. */
  async paiementDisponible(): Promise<boolean> {
    return !(await this.mode.etat()).degrade;
  }

  /**
   * Le trajet du voyageur : celui de son dernier billet, sinon le trajet par défaut. La planche
   * n'a pas d'écran de choix de ville : l'achat tient en trois réponses.
   */
  async trajetDe(voyageurId: string): Promise<{ depart: string; arrivee: string }> {
    const billets = await this.billets.deLAcheteur(voyageurId);
    const dernier = [...billets].sort((a, b) => b.creeA.localeCompare(a.creeA))[0];
    if (dernier) {
      const dc = await this.catalogue.depart(dernier.departId);
      if (dc) return { depart: dc.origine.code, arrivee: dc.destination.code };
    }
    return this.config.trajetDefaut;
  }

  /** Les prochains départs du trajet : aujourd'hui, sinon demain. Mêmes filtres et même ordre que l'application. */
  async proposerDeparts(
    voyageurId: string,
    trajet: { depart: string; arrivee: string },
  ): Promise<ListeDeparts | null> {
    const aujourdhui = jourDouala(this.horloge.maintenant());
    const demain = jourDouala(new Date(this.horloge.maintenant().getTime() + MS_PAR_JOUR));
    for (const jour of [aujourdhui, demain]) {
      let recherche;
      try {
        recherche = await this.departs.rechercher(voyageurId, { ...trajet, jour });
      } catch (e) {
        if (e instanceof Refus && e.code === "VILLE_INCONNUE") return null;
        throw e;
      }
      const disponibles = recherche.departs
        .filter((d) => d.placesLibres > 0)
        .slice(0, this.config.nombreDeparts);
      if (disponibles.length > 0) {
        return {
          depart: recherche.depart.nom,
          arrivee: recherche.arrivee.nom,
          demain: jour === demain,
          departs: disponibles.map((d) => ({
            id: d.id,
            ligne: {
              heure: hhmmDouala(d.heureDepart),
              compagnie: d.compagnie.nom,
              vip: d.classe === "vip",
              prix: d.prix,
            },
          })),
        };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ réserver et payer */

  /**
   * Retient le plus petit siège libre du départ (15 minutes) pour le voyageur, ou pour son proche.
   * Si un autre voyageur prend le siège entre-temps, on essaie le suivant.
   */
  async reserver(
    voyageur: Utilisateur,
    departId: string,
    operateur: OperateurUssd,
    options: { proche: string | null; msisdn: string },
  ): Promise<ReservationUssd> {
    await this.exigerAucunPaiementEnCours(voyageur.id, departId);
    for (let essai = 0; essai < ESSAIS_SIEGE; essai++) {
      const dc = await this.departs.chargerDepart(departId);
      const siege = (await this.sieges.libres(dc))[0];
      if (siege === undefined) throw new DepartCompletUssd();
      let commande;
      try {
        commande = await this.commandes.creer(voyageur, {
          departId,
          sieges: [siege],
          pour: options.proche !== null ? "proche" : "moi",
          ...(options.proche !== null
            ? {
                passagers: [
                  { nom: `Proche ${options.proche.slice(-4)}`, telephone: options.proche },
                ],
              }
            : {}),
          codePromo: this.config.codeSansFrais,
        });
      } catch (e) {
        if (e instanceof Refus && e.code === "SIEGE_PRIS") continue;
        throw e;
      }
      const attendu = prixDuDepart(dc);
      if (commande.total !== attendu) {
        await this.commandes.annuler(commande.id, "prix_inattendu");
        throw new PrixInattenduUssd(attendu, commande.total);
      }
      await this.achats.ajouter({
        commandeId: commande.id,
        voyageurId: voyageur.id,
        operateur,
        etat: "reservee",
        destinataireChiffre: this.chiffrement.chiffrer(
          options.proche ?? options.msisdn,
          CONTEXTE_DESTINATAIRE(commande.id),
        ),
        creeA: this.horloge.maintenant(),
      });
      return { commandeId: commande.id, siege };
    }
    throw new DepartCompletUssd();
  }

  /**
   * Une nouvelle réservation remplace la précédente du même voyageur sur le même départ. Si un
   * paiement de cette précédente est en cours (le voyageur a validé sur son téléphone), l'annuler
   * ferait rembourser un voyageur qui allait avoir son billet : on lui demande d'attendre.
   */
  private async exigerAucunPaiementEnCours(voyageurId: string, departId: string): Promise<void> {
    for (const c of await this.commandesPort.duDepart(departId, "en_attente_paiement")) {
      if (c.voyageurId !== voyageurId) continue;
      const enCours = (await this.paiementsPort.duCommande(c.id)).some(
        (p) => p.statut === "en_attente",
      );
      if (enCours) {
        throw conflit("PAIEMENT_EN_COURS", "Un paiement est déjà en cours pour ce départ");
      }
    }
  }

  /**
   * Demande le paiement MoMo : l'opérateur qui nous appelle est celui du téléphone, c'est donc son
   * moyen (MTN MoMo ou Orange Money) qui est débité, sur le numéro qui a composé le code.
   */
  async payer(
    voyageur: Utilisateur,
    commandeId: string,
    operateur: OperateurUssd,
    msisdn: string,
  ): Promise<Paiement> {
    const paiement = await this.paiements.payerCommande(voyageur, commandeId, {
      moyen: operateur === "mtn" ? "mtn_momo" : "orange_money",
      telephone: msisdn,
    });
    await this.achats.transitionner(commandeId, ["reservee"], "paiement_demande");
    return paiement;
  }

  /**
   * Libère la place retenue : le voyageur renonce ou quitte avant de payer, ou la demande de
   * paiement a été refusée. Une commande déjà payée n'est pas touchée (`annuler` ne rend que les
   * commandes en attente de paiement).
   */
  async abandonner(commandeId: string): Promise<void> {
    await this.commandes.annuler(commandeId, "ussd_abandon");
    await this.achats.transitionner(commandeId, ["reservee", "paiement_demande"], "abandonnee");
  }

  /* ------------------------------------------------------------------ billets du voyageur */

  /** Les billets payés du voyageur dont le voyage n'est pas terminé, le plus proche d'abord. */
  async billetsAVenir(voyageurId: string): Promise<BilletAVenir[]> {
    const sortie: BilletAVenir[] = [];
    for (const billet of await this.billets.deLAcheteur(voyageurId)) {
      if (!["paye", "embarque", "voyage"].includes(billet.etat)) continue;
      const dc = await this.catalogue.depart(billet.departId);
      if (!dc || ["arrive", "annule", "fusionne"].includes(dc.depart.etat)) continue;
      sortie.push({ billet, dc });
    }
    return sortie.sort((a, b) => a.dc.depart.heureDepart.localeCompare(b.dc.depart.heureDepart));
  }

  private quand(heureDepart: string): string {
    const jour = jourDouala(heureDepart);
    if (jour === jourDouala(this.horloge.maintenant())) return hhmmDouala(heureDepart);
    return `${jour.slice(8, 10)}/${jour.slice(5, 7)} ${hhmmDouala(heureDepart)}`;
  }

  /** « 2 Mon billet » : le prochain billet. `null` s'il n'y en a pas. */
  async monBillet(voyageurId: string): Promise<BilletUssd | null> {
    const [premier, ...autres] = await this.billetsAVenir(voyageurId);
    if (!premier) return null;
    return {
      numero: premier.billet.numero,
      compagnie: premier.dc.compagnie.nom,
      quand: this.quand(premier.dc.depart.heureDepart),
      depart: premier.dc.origine.ville,
      arrivee: premier.dc.destination.ville,
      place: premier.billet.siege,
      code: premier.billet.codeBillet,
      autres: autres.length,
    };
  }

  /** « 4 Suivre bus » : l'écran du bus du prochain billet (ou pourquoi il n'y en a pas). */
  async suivreBus(voyageurId: string): Promise<string> {
    const premier = (await this.billetsAVenir(voyageurId))[0];
    if (!premier) return TEXTES.aucunBus;
    const position = await this.suiviBus.position({
      billetId: premier.billet.id,
      departId: premier.dc.depart.id,
      voyageurId,
    });
    if (!position) return TEXTES.busSansPosition;
    const bus: BusUssd = {
      compagnie: premier.dc.compagnie.nom,
      depart: premier.dc.origine.ville,
      arrivee: premier.dc.destination.ville,
      arriveeEstimee: position.arriveeEstimee ? hhmmDouala(position.arriveeEstimee) : null,
      retardMinutes: Math.max(0, Math.round(position.retardMinutes)),
      prochainArret: position.prochainArret,
    };
    return TEXTES.bus(bus);
  }
}
