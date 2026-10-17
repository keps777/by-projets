import { Inject, Injectable } from "@nestjs/common";
import { Refus, conflit } from "../billetterie/erreurs";
import { CommandesService } from "../billetterie/commandes.service";
import { DepartsService } from "../billetterie/departs.service";
import { Billets, Catalogue, Commandes } from "../billetterie/ports";
import { emplacementSiege } from "../billetterie/regles";
import { SiegesService } from "../billetterie/sieges.service";
import { MS_PAR_JOUR, heureDouala, hhmmDouala, jourDouala } from "../billetterie/temps";
import { prixDuDepart } from "../billetterie/vues";
import { ModeDegradeService } from "../paiements/mode-degrade.service";
import type { Paiement, OperateurMobile } from "../paiements/modeles";
import { PaiementsService } from "../paiements/paiements.service";
import { Paiements } from "../paiements/ports";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { dansLaPeriode, type JourDemande, type Periode } from "./comprehension";
import { CONFIG_ACHAT_WHATSAPP, type ConfigAchatWhatsApp } from "./config";
import type { Langue } from "./langues";
import { normaliser } from "./langues";
import type { ChoixDepart } from "./modeles";
import { AchatsWhatsApp } from "./ports";
import { compagnieCourte, type LigneDepart, type SiegeLibre } from "./textes";

/** Plus aucun siège libre sur le départ choisi. */
export class DepartCompletAchat extends Error {
  constructor() {
    super("Départ complet");
    this.name = "DepartCompletAchat";
  }
}

/** Le siège demandé n'est pas libre. */
export class SiegeIndisponibleAchat extends Error {
  constructor(
    /**
     * La commande précédente du voyageur a déjà été remplacée (le siège a été pris pendant la
     * réservation) : il faut en retenir une autre. Sinon, elle tient toujours.
     */
    readonly ancienneLiberee: boolean,
  ) {
    super("Siège indisponible");
    this.name = "SiegeIndisponibleAchat";
  }
}

/** Le total de la commande n'est pas le prix affiché (le code « sans frais » ne fait pas son effet). */
export class PrixInattenduAchat extends Error {
  constructor(
    readonly attendu: number,
    readonly obtenu: number,
  ) {
    super(`Prix inattendu : ${obtenu} F au lieu de ${attendu} F`);
    this.name = "PrixInattenduAchat";
  }
}

export interface DepartPropose {
  ligne: LigneDepart;
  choix: ChoixDepart;
}

export interface ListeDeparts {
  jour: JourDemande;
  departs: DepartPropose[];
}

export interface Trajet {
  depart: string;
  arrivee: string;
}

export interface CriteresDeparts {
  jour: JourDemande | null;
  periode: Periode | null;
  /** Minutes depuis minuit : départs à partir de cette heure. */
  apres: number | null;
}

export interface ReservationAchat {
  commandeId: string;
  departId: string;
  siege: number;
  emplacement: string;
  compagnie: string;
  vip: boolean;
  heure: string;
  prix: number;
}

export const CONTEXTE_DESTINATAIRE = (commandeId: string): string =>
  `whatsapp-achat.achat:${commandeId}`;

/** Essais de sièges avant de dire que le départ est complet (un autre voyageur peut nous devancer). */
const ESSAIS_SIEGE = 3;

const DECALAGE_JOUR: Readonly<Record<JourDemande, number>> = {
  aujourdhui: 0,
  demain: 1,
  apres_demain: 2,
};

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * L'achat par WhatsApp, de la liste des départs au paiement : tout passe par la billetterie et les
 * paiements, avec leurs règles (prix du tarif, siège retenu 15 minutes, filtres du voyageur, un
 * seul paiement par commande, mode dégradé). Rien n'est recalculé ici.
 *
 * Deux choix du produit : un siège est proposé d'emblée (la fenêtre libre la plus proche de
 * l'avant), le voyageur peut en changer ; et la commande porte le code « sans frais » pour que le
 * prix payé soit le prix affiché (« 4 000 F par MoMo »).
 */
@Injectable()
export class AchatWhatsAppService {
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
    private readonly achats: AchatsWhatsApp,
    private readonly chiffrement: ChiffrementService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_ACHAT_WHATSAPP) private readonly config: ConfigAchatWhatsApp,
  ) {}

  /* ------------------------------------------------------------------ départs */

  /** Le paiement en ligne est-il disponible ? Sinon on ne retient aucune place. */
  async paiementDisponible(): Promise<boolean> {
    return !(await this.mode.etat()).degrade;
  }

  /**
   * Le trajet habituel du voyageur : celui de son dernier billet, sinon le trajet par défaut. Il
   * complète ce que le message ne dit pas (« billet demain », « je veux aller à Yaoundé »).
   */
  async trajetHabituel(voyageurId: string): Promise<Trajet> {
    const billets = await this.billets.deLAcheteur(voyageurId);
    const dernier = [...billets].sort((a, b) => b.creeA.localeCompare(a.creeA))[0];
    if (dernier) {
      const dc = await this.catalogue.depart(dernier.departId);
      if (dc) return { depart: dc.origine.code, arrivee: dc.destination.code };
    }
    return this.config.trajetDefaut;
  }

  /**
   * Les prochains départs du trajet : le jour demandé, ou aujourd'hui puis demain si le voyageur
   * n'en a pas dit. Mêmes filtres et même ordre que l'application. `null` s'il n'y en a aucun.
   */
  async proposerDeparts(
    voyageurId: string,
    trajet: Trajet,
    criteres: CriteresDeparts,
  ): Promise<ListeDeparts | null> {
    const jours: JourDemande[] =
      criteres.jour !== null ? [criteres.jour] : ["aujourdhui", "demain"];
    for (const jour of jours) {
      const date = jourDouala(
        new Date(this.horloge.maintenant().getTime() + DECALAGE_JOUR[jour] * MS_PAR_JOUR),
      );
      let recherche;
      try {
        recherche = await this.departs.rechercher(voyageurId, { ...trajet, jour: date });
      } catch (e) {
        if (e instanceof Refus && e.code === "VILLE_INCONNUE") return null;
        throw e;
      }
      const retenus = recherche.departs
        .filter((d) => d.placesLibres > 0)
        .filter((d) =>
          criteres.periode !== null
            ? dansLaPeriode(criteres.periode, heureDouala(d.heureDepart))
            : true,
        )
        .filter((d) =>
          criteres.apres !== null ? minutes(hhmmDouala(d.heureDepart)) >= criteres.apres : true,
        )
        .slice(0, this.config.nombreDeparts);
      if (retenus.length > 0) {
        return {
          jour,
          departs: retenus.map((d) => ({
            ligne: {
              heure: hhmmDouala(d.heureDepart),
              compagnie: d.compagnie.nom,
              vip: d.classe === "vip",
              prix: d.prix,
            },
            choix: {
              id: d.id,
              heure: hhmmDouala(d.heureDepart),
              nom: normaliser(compagnieCourte(d.compagnie.nom)),
            },
          })),
        };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ sièges */

  /** Le siège proposé d'emblée : la fenêtre libre la plus proche de l'avant, sinon le premier libre. */
  private siegeParDefaut(libres: readonly number[]): number | undefined {
    return libres.find((s) => emplacementSiege(s).startsWith("fenêtre")) ?? libres[0];
  }

  /** Les premiers sièges libres du départ, avec leur emplacement. */
  async siegesLibres(departId: string): Promise<SiegeLibre[]> {
    const dc = await this.departs.chargerDepart(departId);
    return (await this.sieges.libres(dc))
      .slice(0, this.config.siegesProposes)
      .map((numero) => ({ numero, emplacement: emplacementSiege(numero) }));
  }

  /* ------------------------------------------------------------------ réserver et payer */

  /**
   * Retient un siège du départ (15 minutes) : celui que le voyageur demande, sinon le siège par
   * défaut. Si un autre voyageur prend le siège par défaut entre-temps, on essaie le suivant ;
   * pour un siège demandé, on le dit (`SiegeIndisponibleAchat`). La commande précédente du même
   * voyageur sur ce départ est remplacée par la billetterie.
   */
  async reserver(
    voyageur: Utilisateur,
    departId: string,
    options: { siege: number | null; msisdn: string; langue: Langue },
  ): Promise<ReservationAchat> {
    await this.exigerAucunPaiementEnCours(voyageur.id, departId);
    for (let essai = 0; essai < ESSAIS_SIEGE; essai++) {
      const dc = await this.departs.chargerDepart(departId);
      const libres = await this.sieges.libres(dc);
      const siege = options.siege ?? this.siegeParDefaut(libres);
      if (siege === undefined) throw new DepartCompletAchat();
      if (options.siege !== null && !libres.includes(siege)) {
        throw new SiegeIndisponibleAchat(false);
      }
      let commande;
      try {
        commande = await this.commandes.creer(voyageur, {
          departId,
          sieges: [siege],
          pour: "moi",
          codePromo: this.config.codeSansFrais,
        });
      } catch (e) {
        if (e instanceof Refus && e.code === "SIEGE_PRIS") {
          // `creer` a déjà remplacé l'ancienne commande avant de buter sur le siège.
          if (options.siege !== null) throw new SiegeIndisponibleAchat(true);
          continue;
        }
        throw e;
      }
      const attendu = prixDuDepart(dc);
      if (commande.total !== attendu) {
        await this.commandes.annuler(commande.id, "prix_inattendu");
        throw new PrixInattenduAchat(attendu, commande.total);
      }
      await this.achats.ajouter({
        commandeId: commande.id,
        voyageurId: voyageur.id,
        etat: "reservee",
        langue: options.langue,
        destinataireChiffre: this.chiffrement.chiffrer(
          options.msisdn,
          CONTEXTE_DESTINATAIRE(commande.id),
        ),
        creeA: this.horloge.maintenant(),
      });
      return {
        commandeId: commande.id,
        departId,
        siege,
        emplacement: emplacementSiege(siege),
        compagnie: dc.compagnie.nom,
        vip: dc.depart.classe === "vip",
        heure: hhmmDouala(dc.depart.heureDepart),
        prix: commande.total,
      };
    }
    throw new DepartCompletAchat();
  }

  /** Les détails d'une place déjà retenue (le voyageur garde son siège). */
  async reservationDe(
    commandeId: string,
    departId: string,
    siege: number,
  ): Promise<ReservationAchat> {
    const dc = await this.departs.chargerDepart(departId);
    const commande = await this.commandesPort.trouver(commandeId);
    return {
      commandeId,
      departId,
      siege,
      emplacement: emplacementSiege(siege),
      compagnie: dc.compagnie.nom,
      vip: dc.depart.classe === "vip",
      heure: hhmmDouala(dc.depart.heureDepart),
      prix: commande?.total ?? prixDuDepart(dc),
    };
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
   * Demande le paiement MoMo sur le numéro donné : le moyen (MTN MoMo ou Orange Money) est celui de
   * l'opérateur du numéro. Le paiement est asynchrone : le voyageur valide sur son téléphone.
   */
  async payer(
    voyageur: Utilisateur,
    commandeId: string,
    operateur: OperateurMobile,
    telephone: string,
  ): Promise<Paiement> {
    const paiement = await this.paiements.payerCommande(voyageur, commandeId, {
      moyen: operateur === "mtn" ? "mtn_momo" : "orange_money",
      telephone,
    });
    if (paiement.statut !== "echoue") {
      await this.achats.transitionner(commandeId, ["reservee"], "paiement_demande");
    }
    return paiement;
  }

  /**
   * Libère la place retenue : le voyageur renonce avant de payer, ou la demande de paiement a été
   * refusée. Une commande déjà payée n'est pas touchée (`annuler` ne rend que les commandes en
   * attente de paiement).
   */
  async abandonner(commandeId: string): Promise<void> {
    await this.commandes.annuler(commandeId, "whatsapp_abandon");
    await this.achats.transitionner(commandeId, ["reservee", "paiement_demande"], "abandonnee");
  }
}
