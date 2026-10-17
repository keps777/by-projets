import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { conflit, inconnu } from "../billetterie/erreurs";
import { Verrous } from "../paiements/verrous";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import type { MotifVersement, Reservation, Versement } from "./modeles";
import {
  NotifieurCovoiturage,
  PasserelleVersements,
  Reservations,
  Trajets,
  Versements,
} from "./ports";
import { TEXTES, attenteVersementMs } from "./regles";
import { VerificationService } from "./verification.service";

/** Un code court : le texte d'une erreur d'un prestataire n'entre jamais dans la base ni dans le journal. */
const codeDe = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "ERREUR_VERSEMENT";
};

/**
 * Libération de l'argent au conducteur. Il n'est libéré qu'à l'arrivée : quand le passager la
 * confirme, ou 2 h après l'heure d'arrivée prévue (balayage). Une réservation n'a jamais plus d'un
 * versement (`Versements.creer`), et `PasserelleVersements.verser` dédoublonne par clé : un envoi
 * rejoué ne paie pas deux fois.
 *
 * Un versement qui n'a pas pu partir (opérateur en panne, numéro absent) reste « à faire » et est repris
 * par le balayage avec la même clé ; après `versementEssaisMax` essais il passe « échoué » et
 * apparaît dans `GET /covoiturage/versements?statut=echoue` pour AfriMove.
 */
@Injectable()
export class LiberationService {
  private readonly journal = new Logger("LiberationCovoiturage");

  constructor(
    private readonly reservations: Reservations,
    private readonly trajets: Trajets,
    private readonly versements: Versements,
    private readonly passerelle: PasserelleVersements,
    private readonly verification: VerificationService,
    private readonly notifieur: NotifieurCovoiturage,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  /**
   * Libère l'argent d'une réservation payée. Idempotent : une réservation déjà terminée rend son
   * versement. Lève 409 `RESERVATION_NON_PAYEE` si elle n'a pas été payée (ou a été annulée).
   */
  async liberer(
    reservationId: string,
    motif: Extract<MotifVersement, "confirmation_passager" | "delai_depasse">,
  ): Promise<Versement> {
    return this.verrous.executer(`reservation:${reservationId}`, async () => {
      const r = await this.reservations.trouver(reservationId);
      if (!r) throw inconnu("RESERVATION_INCONNUE", "Réservation introuvable");
      if (r.statut === "terminee") {
        const deja = await this.versements.deLaReservation(r.id);
        if (deja) return deja;
      } else if (r.statut !== "payee") {
        throw conflit("RESERVATION_NON_PAYEE", "Cette réservation n'est pas payée");
      }
      const maintenant = this.horloge.maintenant();
      const terminee =
        r.statut === "payee"
          ? await this.reservations.transitionner(r.id, ["payee"], {
              statut: "terminee",
              libereeA: maintenant,
              motifLiberation: motif,
            })
          : r;
      if (!terminee) {
        // une annulation est passée entre-temps
        throw conflit("RESERVATION_NON_PAYEE", "Cette réservation n'est plus payée");
      }
      await this.audit.enregistrer({
        action: "covoiturage.argent_libere",
        resultat: "succes",
        cible: { type: "reservation", id: r.id },
        details: { motif, montant: r.prixParPlace * r.places },
        at: maintenant,
      });
      return this.creerEtVerser(terminee, r.prixParPlace * r.places - r.retenue, motif);
    });
  }

  /** Le passager a annulé trop tard : la part retenue part vers le conducteur tout de suite. */
  async verserRetenue(r: Reservation, montant: number): Promise<Versement | null> {
    if (montant <= 0) return null;
    return this.creerEtVerser(r, montant, "annulation_tardive");
  }

  private async creerEtVerser(
    r: Reservation,
    montant: number,
    motif: MotifVersement,
  ): Promise<Versement> {
    const maintenant = this.horloge.maintenant();
    const versement: Versement = {
      id: randomUUID(),
      reservationId: r.id,
      conducteurId: r.conducteurId,
      montant,
      motif,
      statut: "a_faire",
      reference: null,
      tentatives: 0,
      prochainEssaiA: maintenant,
      derniereErreur: null,
      creeA: maintenant,
      faitA: null,
    };
    if (!(await this.versements.creer(versement))) {
      const existant = await this.versements.deLaReservation(r.id);
      if (existant) return this.essayer(existant);
    }
    return this.essayer(versement);
  }

  /**
   * Un essai de versement. Ne lève jamais : l'échec est consigné et repris au prochain balayage.
   */
  async essayer(v: Versement): Promise<Versement> {
    if (v.statut !== "a_faire") return v;
    const maintenant = this.horloge.maintenant();
    const tentatives = v.tentatives + 1;
    try {
      const telephone = await this.verification.numeroVersement(v.conducteurId);
      if (telephone === null) {
        throw Object.assign(new Error("numéro absent"), { code: "NUMERO_VERSEMENT_ABSENT" });
      }
      const { reference } = await this.passerelle.verser({
        cle: `covoiturage:${v.reservationId}`,
        montant: v.montant,
        telephone,
        reservationId: v.reservationId,
      });
      const fait = await this.versements.transitionner(v.id, ["a_faire"], {
        statut: "fait",
        reference,
        tentatives,
        derniereErreur: null,
        prochainEssaiA: null,
        faitA: maintenant,
      });
      if (fait) {
        await this.audit.enregistrer({
          action: "covoiturage.versement",
          resultat: "succes",
          cible: { type: "reservation", id: v.reservationId },
          details: { montant: v.montant, motif: v.motif },
          at: maintenant,
        });
        await this.prevenirConducteur(fait);
      }
      return fait ?? (await this.versements.deLaReservation(v.reservationId)) ?? v;
    } catch (e) {
      const code = codeDe(e);
      const definitif = tentatives >= this.config.versementEssaisMax;
      const apres = await this.versements.transitionner(v.id, ["a_faire"], {
        statut: definitif ? "echoue" : "a_faire",
        tentatives,
        derniereErreur: code,
        prochainEssaiA: definitif
          ? null
          : new Date(
              maintenant.getTime() +
                attenteVersementMs(tentatives, this.config.versementReprisePremiereMs),
            ),
      });
      this.journal.error(
        `Versement ${v.id} (réservation ${v.reservationId}) : essai ${tentatives} échoué (${code})`,
      );
      if (definitif) {
        await this.audit
          .enregistrer({
            action: "covoiturage.versement",
            resultat: "echec",
            cible: { type: "reservation", id: v.reservationId },
            details: { montant: v.montant, cause: code, essais: tentatives },
            at: maintenant,
          })
          .catch(() => undefined);
      }
      return apres ?? v;
    }
  }

  /** Reprend les versements dont l'essai est échu. */
  async reprendre(limite = 50): Promise<number> {
    const aReprendre = await this.versements.aReprendre(this.horloge.maintenant(), limite);
    let repris = 0;
    for (const v of aReprendre) {
      const apres = await this.essayer(v);
      if (apres.statut === "fait") repris += 1;
    }
    return repris;
  }

  private async prevenirConducteur(v: Versement): Promise<void> {
    const r = await this.reservations.trouver(v.reservationId);
    const t = r ? await this.trajets.trouver(r.trajetId) : null;
    if (!r || !t) return;
    await this.notifieur.notifier({
      personneId: v.conducteurId,
      texte: TEXTES.sms.versement(v.montant, `${t.departVille} - ${t.arriveeVille}`),
      cle: `covoiturage:versement:${v.reservationId}`,
      reference: { type: "reservation", id: v.reservationId },
    });
  }
}
