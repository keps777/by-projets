import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Refus, conflit, inconnu, invalide } from "../billetterie/erreurs";
import { hhmmDouala } from "../billetterie/temps";
import { Verrous } from "../paiements/verrous";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import { DemandesService } from "./demandes.service";
import { LiberationService } from "./liberation.service";
import type { Reservation, Trajet } from "./modeles";
import {
  AnnuaireCovoiturage,
  NotifieurCovoiturage,
  RemboursementsCovoiturage,
  Reservations,
  Trajets,
} from "./ports";
import { ProfilsService } from "./profils.service";
import {
  FRAIS_PAR_PLACE,
  TEXTES,
  ajouterMin,
  decisionAnnulationPassager,
  liberationAuto,
  nomPublic,
  prenomDe,
  quandTexte,
} from "./regles";
import { ReputationService } from "./reputation.service";
import { VerificationService } from "./verification.service";
import { commandeVue, reservationVue, type CommandeVue, type ReservationVue } from "./vues";

export interface ResultatAnnulationReservation {
  reservationId: string;
  statut: "annulee";
  /** Part du prix rendue au passager (FCFA). */
  rembourse: number;
  /** Part du prix gardée par le conducteur (FCFA). */
  retenue: number;
  gratuite: boolean;
}

export interface ResultatAnnulationTrajet {
  trajetId: string;
  statut: "annule";
  /** Passagers qui avaient payé et que l'on rembourse. */
  passagersRembourses: number;
}

/**
 * Réservations d'un covoiturage. Réserver retient les places 15 minutes et rend la commande à payer
 * dans l'écran de paiement ; le paiement (module `paiements`) confirme la réservation ; l'argent reste
 * chez l'agrégateur jusqu'à l'arrivée (`LiberationService`). Le conducteur ou le passager peut annuler
 * avant le départ : remboursement du prix (et des frais si c'est le conducteur qui annule).
 */
@Injectable()
export class ReservationsService {
  private readonly journal = new Logger("ReservationsCovoiturage");

  constructor(
    private readonly trajets: Trajets,
    private readonly reservations: Reservations,
    private readonly verification: VerificationService,
    private readonly liberation: LiberationService,
    private readonly remboursements: RemboursementsCovoiturage,
    private readonly notifieur: NotifieurCovoiturage,
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly profils: ProfilsService,
    private readonly reputation: ReputationService,
    private readonly demandes: DemandesService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  /* ------------------------------------------------------------------ réserver */

  /**
   * Retient `places` places et rend la commande à payer. Rejouer la même demande rend la même commande
   * tant que la retenue dure. Lève 404 `OFFRE_INCONNUE`, 409 `TRAJET_PROPRE`, `RESERVATION_FERMEE`,
   * `TRAJET_INDISPONIBLE`, `PLUS_ASSEZ_DE_PLACES`, `DEJA_RESERVE`, 422 `PLACES_INVALIDES`.
   */
  async reserver(passager: Utilisateur, offreId: string, places: number): Promise<CommandeVue> {
    return this.verrous.executer(`trajet:${offreId}`, async () => {
      const maintenant = this.horloge.maintenant();
      const trajet = await this.trajets.trouver(offreId);
      if (!trajet || trajet.statut !== "publie") {
        throw inconnu("OFFRE_INCONNUE", "Ce trajet n'existe plus");
      }
      if (trajet.conducteurId === passager.id) {
        throw conflit("TRAJET_PROPRE", "Tu ne peux pas réserver ton propre trajet");
      }
      if (
        trajet.departA.getTime() - maintenant.getTime() <
        this.config.fermetureAvantDepartMin * 60_000
      ) {
        throw conflit("RESERVATION_FERMEE", "Les réservations de ce trajet sont closes");
      }
      if (!(await this.verification.estVerifie(trajet.conducteurId))) {
        throw conflit("TRAJET_INDISPONIBLE", "Ce trajet n'est plus disponible");
      }
      if (places > trajet.places) {
        throw invalide("PLACES_INVALIDES", `Ce trajet a ${trajet.places} place(s) au plus`);
      }

      // Une réservation en attente du même passager est rejouée ou remplacée, jamais doublée.
      const miennes = await this.reservations.duPassager(passager.id);
      for (const r of miennes) {
        if (r.trajetId !== trajet.id || r.statut !== "en_attente_paiement") continue;
        if (r.expireA.getTime() > maintenant.getTime() && r.places === places) {
          return commandeVue(r, maintenant);
        }
        await this.reservations.transitionner(r.id, ["en_attente_paiement"], {
          statut: "annulee",
          annuleeA: maintenant,
          annulePar: "systeme",
        });
      }

      const identite = await this.annuaire.identite(trajet.conducteurId);
      const reservation: Reservation = {
        id: randomUUID(),
        trajetId: trajet.id,
        conducteurId: trajet.conducteurId,
        passagerId: passager.id,
        places,
        prixParPlace: trajet.prixParPlace,
        fraisParPlace: FRAIS_PAR_PLACE,
        libelle: `Covoiturage ${prenomDe(identite?.nom ?? "")} · ${trajet.departVille} → ${trajet.arriveeVille} · ${hhmmDouala(trajet.departA)}`,
        statut: "en_attente_paiement",
        creeA: maintenant,
        expireA: ajouterMin(maintenant, this.config.retenueMinutes),
        payeeA: null,
        moyenPaiement: null,
        departA: trajet.departA,
        liberationAutoA: liberationAuto(trajet.departA, trajet.dureeMinutes, this.config),
        libereeA: null,
        motifLiberation: null,
        annuleeA: null,
        annulePar: null,
        remboursement: null,
        retenue: 0,
      };
      const res = await this.reservations.reserver(reservation, trajet.places, maintenant);
      if (!res.ok) {
        if (res.raison === "deja_reservee") {
          throw conflit("DEJA_RESERVE", "Tu as déjà réservé ce trajet");
        }
        const libres = Math.max(
          0,
          trajet.places - (await this.reservations.placesPrises(trajet.id, maintenant)),
        );
        throw conflit("PLUS_ASSEZ_DE_PLACES", "Il n'y a plus assez de places sur ce trajet", {
          placesLibres: libres,
        });
      }
      return commandeVue(reservation, maintenant);
    });
  }

  /* ------------------------------------------------------------------ paiement reçu */

  /**
   * Appelé par les paiements quand l'argent est reçu (`CommandesAPayer.confirmer`). Idempotent. Lève
   * 409 `COMMANDE_ANNULEE` (réservation ou trajet annulé) ou 409 `SIEGES_PERDUS` (places reprises, trajet
   * parti) : les paiements rembourseront alors le passager en entier.
   */
  async confirmerPaiement(reservationId: string, moyen: string): Promise<string[]> {
    return this.verrous.executer(`reservation:${reservationId}`, async () => {
      const maintenant = this.horloge.maintenant();
      const r = await this.reservations.trouver(reservationId);
      if (!r) throw new Refus(409, "COMMANDE_ANNULEE", "Réservation introuvable");
      const trajet = await this.trajets.trouver(r.trajetId);
      if (!trajet) throw new Refus(409, "COMMANDE_ANNULEE", "Trajet introuvable");
      if (r.statut === "payee" || r.statut === "terminee") return [];
      if (r.statut === "annulee" || trajet.statut === "annule") {
        throw new Refus(409, "COMMANDE_ANNULEE", "Cette réservation a été annulée");
      }
      if (trajet.departA.getTime() <= maintenant.getTime()) {
        throw new Refus(409, "SIEGES_PERDUS", "Le trajet est déjà parti");
      }
      const res = await this.reservations.payer(r.id, trajet.places, maintenant, {
        payeeA: maintenant,
        moyenPaiement: moyen,
      });
      if (!res.ok) {
        if (res.raison === "complet") {
          throw new Refus(409, "SIEGES_PERDUS", "Les places ont été reprises avant le paiement");
        }
        throw new Refus(409, "COMMANDE_ANNULEE", "Cette réservation a été annulée");
      }
      if (!res.dejaPayee) {
        await this.audit.enregistrer({
          action: "covoiturage.reservation_payee",
          resultat: "succes",
          cible: { type: "reservation", id: r.id },
          details: { trajetId: r.trajetId, places: r.places, moyen },
          at: maintenant,
        });
        await this.prevenirDuConducteur(res.reservation, trajet);
        await this.demandes.satisfaire(r.passagerId, r.trajetId).catch(() => undefined);
      }
      return [];
    });
  }

  private async prevenirDuConducteur(r: Reservation, t: Trajet): Promise<void> {
    const identite = await this.annuaire.identite(r.passagerId);
    await this.notifieur.notifier({
      personneId: r.conducteurId,
      texte: TEXTES.sms.reservation(
        nomPublic(identite?.nom ?? ""),
        r.places,
        `${t.departVille} - ${t.arriveeVille}`,
        quandTexte(t.departA),
      ),
      cle: `covoiturage:reservation:${r.id}`,
      reference: { type: "reservation", id: r.id },
    });
  }

  /* ------------------------------------------------------------------ arrivée */

  /**
   * Le passager confirme son arrivée : l'argent part vers le conducteur. Lève 409 `TRAJET_PAS_COMMENCE`
   * avant l'heure du départ, 409 `RESERVATION_NON_PAYEE` pour une réservation non payée ou annulée.
   */
  async confirmerArrivee(passager: Utilisateur, reservationId: string): Promise<ReservationVue> {
    const r = await this.reservations.trouver(reservationId);
    if (!r || r.passagerId !== passager.id) {
      throw inconnu("RESERVATION_INCONNUE", "Réservation introuvable");
    }
    if (r.statut === "payee" && r.departA.getTime() > this.horloge.maintenant().getTime()) {
      throw conflit("TRAJET_PAS_COMMENCE", "Le trajet n'a pas encore commencé");
    }
    await this.liberation.liberer(reservationId, "confirmation_passager");
    return this.reservation(passager, reservationId);
  }

  /* ------------------------------------------------------------------ annulations */

  /**
   * Annulation par le passager. Avant le paiement, rien n'est dû. Après : le prix est rendu en entier
   * jusqu'à `annulationGratuiteAvantMin` minutes du départ, puis une part est retenue pour le
   * conducteur ; les frais d'AfriMove ne sont pas rendus. Impossible une fois le trajet commencé.
   */
  async annulerReservation(
    passager: Utilisateur,
    reservationId: string,
  ): Promise<ResultatAnnulationReservation> {
    return this.verrous.executer(`reservation:${reservationId}`, async () => {
      const maintenant = this.horloge.maintenant();
      const r = await this.reservations.trouver(reservationId);
      if (!r || r.passagerId !== passager.id) {
        throw inconnu("RESERVATION_INCONNUE", "Réservation introuvable");
      }
      const resultat = (apres: Reservation, gratuite: boolean): ResultatAnnulationReservation => ({
        reservationId,
        statut: "annulee",
        rembourse: apres.remboursement?.prix ?? 0,
        retenue: apres.retenue,
        gratuite,
      });

      if (r.statut === "annulee") return resultat(r, r.retenue === 0);
      if (r.statut === "terminee") {
        throw conflit("RESERVATION_TERMINEE", "Ce trajet est terminé : tu ne peux plus annuler");
      }
      if (r.statut === "en_attente_paiement" || r.statut === "expiree") {
        const apres = await this.reservations.transitionner(
          r.id,
          ["en_attente_paiement", "expiree"],
          { statut: "annulee", annuleeA: maintenant, annulePar: "passager" },
        );
        if (!apres) throw conflit("RESERVATION_CHANGEE", "Cette réservation vient de changer");
        return resultat(apres, true);
      }

      const decision = decisionAnnulationPassager(r, maintenant, this.config);
      if (!decision.autorise) {
        throw conflit(
          "TRAJET_COMMENCE",
          "Le trajet a commencé : confirme ton arrivée au lieu d'annuler",
        );
      }
      const apres = await this.reservations.transitionner(r.id, ["payee"], {
        statut: "annulee",
        annuleeA: maintenant,
        annulePar: "passager",
        remboursement: { prix: decision.remboursement, frais: 0 },
        retenue: decision.retenue,
      });
      if (!apres) throw conflit("RESERVATION_CHANGEE", "Cette réservation vient de changer");
      await this.audit.enregistrer({
        acteur: { id: passager.id, role: passager.role, compagnieId: null },
        action: "covoiturage.reservation_annulee",
        resultat: "succes",
        cible: { type: "reservation", id: r.id },
        details: {
          par: "passager",
          gratuite: decision.gratuite,
          rembourse: decision.remboursement,
          retenue: decision.retenue,
        },
        at: maintenant,
      });
      if (decision.remboursement > 0) {
        await this.rembourser(apres, decision.remboursement, 0, "annulation_passager");
      }
      if (decision.retenue > 0) {
        await this.liberation.verserRetenue(apres, decision.retenue);
      }
      return resultat(apres, decision.gratuite);
    });
  }

  /**
   * Annulation d'un trajet par son conducteur, avant le départ : les réservations en attente sont
   * closes, les passagers qui ont payé sont remboursés en entier (prix et frais) et prévenus par SMS.
   * Rejouer l'annulation d'un trajet déjà annulé ne fait rien de plus.
   */
  async annulerTrajet(
    conducteur: Utilisateur,
    trajetId: string,
    options: { serie?: boolean } = {},
  ): Promise<ResultatAnnulationTrajet> {
    return this.verrous.executer(`trajet:${trajetId}`, async () => {
      const maintenant = this.horloge.maintenant();
      const t = await this.trajets.trouver(trajetId);
      if (!t || t.conducteurId !== conducteur.id) {
        throw inconnu("TRAJET_INCONNU", "Trajet introuvable");
      }
      if (
        t.statut === "termine" ||
        (t.statut === "publie" && t.departA.getTime() <= maintenant.getTime())
      ) {
        throw conflit("TRAJET_COMMENCE", "Le trajet a commencé : il ne peut plus être annulé");
      }
      if (t.statut === "publie") {
        await this.trajets.transitionner(t.id, ["publie"], {
          statut: "annule",
          annuleA: maintenant,
          regulier: options.serie === true ? false : t.regulier,
        });
        await this.audit.enregistrer({
          acteur: { id: conducteur.id, role: conducteur.role, compagnieId: null },
          action: "covoiturage.trajet_annule",
          resultat: "succes",
          cible: { type: "trajet", id: t.id },
          details: { serie: options.serie === true },
          at: maintenant,
        });
      } else if (options.serie === true && t.regulier) {
        await this.trajets.transitionner(t.id, ["annule"], { regulier: false });
      }

      let rembourses = 0;
      for (const r of await this.reservations.duTrajet(t.id)) {
        if (r.statut === "en_attente_paiement" || r.statut === "expiree") {
          await this.reservations.transitionner(r.id, ["en_attente_paiement", "expiree"], {
            statut: "annulee",
            annuleeA: maintenant,
            annulePar: "conducteur",
          });
          continue;
        }
        if (r.statut !== "payee") continue;
        const apres = await this.reservations.transitionner(r.id, ["payee"], {
          statut: "annulee",
          annuleeA: maintenant,
          annulePar: "conducteur",
          remboursement: { prix: r.prixParPlace * r.places, frais: r.fraisParPlace * r.places },
        });
        if (!apres) continue;
        rembourses += 1;
        await this.rembourser(
          apres,
          r.prixParPlace * r.places,
          r.fraisParPlace * r.places,
          "trajet_annule",
        );
        const identite = await this.annuaire.identite(t.conducteurId);
        await this.notifieur.notifier({
          personneId: r.passagerId,
          texte: TEXTES.sms.trajetAnnule(
            prenomDe(identite?.nom ?? ""),
            `${t.departVille} - ${t.arriveeVille}`,
            quandTexte(t.departA),
          ),
          cle: `covoiturage:trajet-annule:${r.id}`,
          reference: { type: "reservation", id: r.id },
        });
      }
      return { trajetId, statut: "annule", passagersRembourses: rembourses };
    });
  }

  /** Demande le remboursement ; un échec est journalisé et audité sans défaire l'annulation. */
  private async rembourser(
    r: Reservation,
    prix: number,
    frais: number,
    cause: "trajet_annule" | "annulation_passager",
  ): Promise<void> {
    try {
      const issue = await this.remboursements.rembourser({
        reservationId: r.id,
        prix,
        frais,
        cause,
        cle: `covoiturage:${r.id}:${cause}`,
      });
      if (issue === "hors_agregateur") {
        this.journal.warn(`Réservation ${r.id} : paiement hors agrégateur, à rembourser à la main`);
      }
    } catch (e) {
      const raison = e instanceof Error ? e.message : "erreur inconnue";
      this.journal.error(`Remboursement de la réservation ${r.id} impossible : ${raison}`);
      await this.audit
        .enregistrer({
          action: "covoiturage.remboursement_echec",
          resultat: "echec",
          cible: { type: "reservation", id: r.id },
          details: { raison, prix, frais, cause },
          at: this.horloge.maintenant(),
        })
        .catch(() => undefined);
    }
  }

  /* ------------------------------------------------------------------ lecture */

  async reservation(passager: Utilisateur, reservationId: string): Promise<ReservationVue> {
    const r = await this.reservations.trouver(reservationId);
    if (!r || r.passagerId !== passager.id) {
      throw inconnu("RESERVATION_INCONNUE", "Réservation introuvable");
    }
    return this.vue(r);
  }

  /** Mes réservations : les plus récentes d'abord, sans celles qui n'ont jamais abouti. */
  async mesReservations(passager: Utilisateur): Promise<ReservationVue[]> {
    const toutes = await this.reservations.duPassager(passager.id);
    const vues: ReservationVue[] = [];
    for (const r of toutes) {
      if (r.statut === "expiree") continue;
      if (r.statut === "annulee" && r.remboursement === null && r.retenue === 0) continue;
      vues.push(await this.vue(r));
    }
    return vues;
  }

  private async vue(r: Reservation): Promise<ReservationVue> {
    const t = await this.trajets.trouver(r.trajetId);
    if (!t) throw inconnu("TRAJET_INCONNU", "Trajet introuvable");
    const { vue } = await this.profils.conducteur(r.conducteurId);
    return reservationVue(r, t, vue, {
      maintenant: this.horloge.maintenant(),
      config: this.config,
      note: await this.reputation.aNote(r.id, "conducteur"),
    });
  }

  /* ------------------------------------------------------------------ balayage */

  /** Libère les places des réservations dont la retenue de 15 minutes est écoulée. */
  async expirer(limite = 200): Promise<number> {
    const aExpirer = await this.reservations.aExpirer(this.horloge.maintenant(), limite);
    let n = 0;
    for (const r of aExpirer) {
      if (
        await this.reservations.transitionner(r.id, ["en_attente_paiement"], { statut: "expiree" })
      ) {
        n += 1;
      }
    }
    return n;
  }

  /** Libère l'argent des réservations dont l'arrivée prévue est dépassée de 2 h sans confirmation. */
  async libererEchues(limite = 100): Promise<number> {
    const echues = await this.reservations.aLiberer(this.horloge.maintenant(), limite);
    let n = 0;
    for (const r of echues) {
      try {
        await this.liberation.liberer(r.id, "delai_depasse");
        n += 1;
      } catch (e) {
        this.journal.error(
          `Libération de la réservation ${r.id} impossible : ${e instanceof Error ? e.message : "?"}`,
        );
      }
    }
    return n;
  }
}
