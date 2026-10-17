import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { piecesDuDossier, sms } from "./contenu";
import { agenceDe, EcrituresSignees, PrevenirPatron, type AccuseSigne } from "./ecritures";
import {
  commandeInvalide,
  dossierInconnu,
  dossierNonRetirable,
  ErreurFinancement,
  partenaireIndisponible,
} from "./erreurs";
import type {
  ConditionsAvance,
  DossierStocke,
  DossierTransmis,
  NotificationPartenaire,
} from "./modele";
import {
  ConventionsFinancement,
  DonneesAgence,
  DossiersFinancement,
  OffresCredit,
  PartenaireFinancier,
  ReglagesFinancement,
  SalairesAgence,
} from "./ports";
import {
  JOURS_DE_VENTES_PLAFOND,
  MONTANT_MINIMUM,
  POURCENTAGE_REMBOURSEMENT,
  PRIX_BILLET_EXEMPLE,
  REPONSE_SOUS_HEURES,
  decouperEnDeuxFois,
  dureeEstimeeSemaines,
  estRetirable,
  montantPropose,
  numeroDossier,
  plafondAvance,
  raisonsNonEligible,
  RE_NUMERO_DOSSIER,
  totalARembourser,
} from "./regles";
import { ajouterHeures, anneeDouala, moisDouala, versIsoDouala } from "./temps";
import { lireDemandeAvance, lireRetrait } from "./validation";
import { vueDossier, type DossierVue, type OffreVue } from "./vues";

export type AvanceDemandeeVue = AccuseSigne & { dossier: DossierVue };
export type DemandeRetireeVue = AccuseSigne & { dossier: DossierVue };

/** Combien de fois une écriture concurrente est rejouée avant d'abandonner (409). */
const ESSAIS_CONCURRENCE = 5;

const NUMEROS_PAR_AN = 9999;

/**
 * Financement d'une agence : l'offre, la demande d'avance, son suivi et son retrait.
 *
 * AfriMove ne prête pas et ne touche jamais l'argent : il présente le dossier au partenaire financier, le
 * partenaire décide seul et verse sur le compte de l'agence, et AfriMove exécute le prélèvement convenu
 * (`PrelevementsService`) directement vers le partenaire. La demande est retirable tant qu'elle n'est pas
 * versée : le retrait n'est enregistré qu'une fois le partenaire d'accord (jamais l'inverse), pour qu'un
 * versement qui part en même temps ne soit pas perdu.
 */
@Injectable()
export class FinancementService {
  private readonly logger = new Logger("FinancementService");

  constructor(
    private readonly dossiers: DossiersFinancement,
    private readonly donnees: DonneesAgence,
    private readonly conventions: ConventionsFinancement,
    private readonly credits: OffresCredit,
    private readonly reglages: ReglagesFinancement,
    private readonly salaires: SalairesAgence,
    private readonly partenaire: PartenaireFinancier,
    private readonly ecritures: EcrituresSignees,
    private readonly prevenir: PrevenirPatron,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ offre */

  /** `OffreFinancement` : l'avance, le crédit matériel, la paie et le paiement en 2 fois. */
  async offre(utilisateur: Utilisateur): Promise<OffreVue> {
    const agenceId = agenceDe(utilisateur);
    const maintenant = versIsoDouala(this.horloge.maintenant());
    const [convention, ventes, releve, pieces, ouvert, credit, reglages, salaires, prix] =
      await Promise.all([
        this.conventions.pour(agenceId),
        this.donnees.ventes(agenceId, maintenant),
        this.donnees.releveMomo(agenceId, maintenant),
        this.donnees.pieces(agenceId),
        this.dossiers.ouvert(agenceId),
        this.credits.pour(agenceId),
        this.reglages.lire(agenceId),
        this.salaires.calculer(agenceId, moisDouala(maintenant)),
        this.donnees.prixBilletExemple(agenceId),
      ]);
    const conventionSignee = convention?.signeeA != null;
    const eligible = raisonsNonEligible({ conventionSignee, ventes, releve, pieces }).length === 0;

    const plafond = eligible ? plafondAvance(ventes) : 0;
    const propose = ouvert ? ouvert.montant : eligible ? montantPropose(plafond) : 0;
    const conditions: ConditionsAvance = ouvert
      ? ouvert.conditions
      : {
          remboursementPctVentesMomo: POURCENTAGE_REMBOURSEMENT,
          dureeEstimeeSemaines: dureeEstimeeSemaines(
            propose,
            POURCENTAGE_REMBOURSEMENT,
            ventes.ventesMomo,
          ),
          coutTotalPct: null,
        };

    const prixBillet = prix ?? PRIX_BILLET_EXEMPLE;
    const deuxFois = decouperEnDeuxFois(prixBillet) ?? { reservation: prixBillet, veille: 0 };
    return {
      partenaire: conventionSignee ? convention!.partenaire : null,
      conventionSignee,
      avance: {
        statut: ouvert ? "en_cours" : eligible ? "eligible" : "non_eligible",
        plafond,
        equivalentJoursDeVentes: JOURS_DE_VENTES_PLAFOND,
        montantPropose: propose,
        conditions: { ...conditions },
        versementSousHeures: REPONSE_SOUS_HEURES,
      },
      // Le contrat n'a pas de « pas d'offre » : sans offre du partenaire, des zéros (voir le README).
      creditMateriel: credit
        ? { ...credit }
        : { description: "", montantTotal: 0, mensualites: 1, montantMensualite: 0 },
      paie: { nbSalaires: salaires.length, jourDeVersement: reglages.jourDePaie },
      billetEnDeuxFois: {
        actif: reglages.billetEnDeuxFois,
        exemple: { prixBillet, reservation: deuxFois.reservation, veille: deuxFois.veille },
      },
    };
  }

  /* ------------------------------------------------------------------ dossier */

  async dossier(utilisateur: Utilisateur, dossierId: string): Promise<DossierVue> {
    const agenceId = agenceDe(utilisateur);
    if (!RE_NUMERO_DOSSIER.test(dossierId)) throw dossierInconnu();
    const dossier = await this.dossiers.trouver(agenceId, dossierId);
    if (!dossier) throw dossierInconnu();
    return vueDossier(dossier, this.horloge.maintenant());
  }

  /* ------------------------------------------------------------------ demander l'avance */

  /**
   * Crée le dossier automatiquement (ventes certifiées, relevés rapprochés, pièces de l'agence, mandat de
   * prélèvement signé par le PIN) et l'envoie au partenaire. Une seule demande à la fois par agence.
   */
  async demander(utilisateur: Utilisateur, corps: unknown): Promise<AvanceDemandeeVue> {
    const cmd = lireDemandeAvance(corps);
    const agenceId = agenceDe(utilisateur);
    return this.ecritures.executer(
      utilisateur,
      "financement.demander",
      { montant: cmd.montant },
      cmd.signature,
      async () => {
        const dossier = await this.creerDossier(utilisateur, agenceId, cmd.montant);
        const envoye = await this.transmettre(dossier);
        return {
          reponse: { dossier: vueDossier(envoye, this.horloge.maintenant()) },
          cible: { type: "dossier_financement", id: dossier.id },
          details: { dossierId: dossier.id, transmis: envoye.accuseA !== null },
        };
      },
    );
  }

  private async creerDossier(
    utilisateur: Utilisateur,
    agenceId: string,
    montant: number,
  ): Promise<DossierStocke> {
    const maintenant = versIsoDouala(this.horloge.maintenant());
    const convention = await this.conventions.pour(agenceId);
    if (convention?.signeeA == null) {
      throw new ErreurFinancement(
        409,
        "CONVENTION_NON_SIGNEE",
        "La convention avec le partenaire financier n'est pas signée",
      );
    }
    const [ventes, releve, pieces, compte] = await Promise.all([
      this.donnees.ventes(agenceId, maintenant),
      this.donnees.releveMomo(agenceId, maintenant),
      this.donnees.pieces(agenceId),
      this.donnees.compteMarchand(agenceId),
    ]);
    const raisons = raisonsNonEligible({ conventionSignee: true, ventes, releve, pieces });
    if (raisons.length > 0) {
      throw new ErreurFinancement(
        409,
        "NON_ELIGIBLE",
        "Le dossier n'est pas éligible pour le moment",
        { raisons },
      );
    }
    const plafond = plafondAvance(ventes);
    if (montant > plafond) {
      throw new ErreurFinancement(
        422,
        "AU_DESSUS_DU_PLAFOND",
        `Le montant dépasse le plafond d'éligibilité (${plafond} F)`,
      );
    }
    if (montant < MONTANT_MINIMUM) {
      throw new ErreurFinancement(
        422,
        "EN_DESSOUS_DU_MINIMUM",
        `Le montant est inférieur au minimum (${MONTANT_MINIMUM} F)`,
      );
    }
    if (!compte) {
      throw new ErreurFinancement(
        409,
        "COMPTE_MARCHAND_ABSENT",
        "Aucun compte marchand MoMo n'est enregistré : le mandat de prélèvement est impossible",
      );
    }
    // Avant le numéro : une demande refusée ne doit pas consommer un numéro de dossier.
    if (await this.dossiers.ouvert(agenceId)) throw demandeEnCours();

    const numero = await this.dossiers.prochainNumero(anneeDouala(maintenant));
    if (numero > NUMEROS_PAR_AN) throw new Error("Numéros de dossier épuisés pour l'année");
    const pourcentage = POURCENTAGE_REMBOURSEMENT;
    const dossier: DossierStocke = {
      id: numeroDossier(anneeDouala(maintenant), numero),
      version: 1,
      agenceId,
      demandePar: utilisateur.id,
      montant,
      statut: "envoye",
      partenaire: convention.partenaire,
      referencePartenaire: null,
      conditions: {
        remboursementPctVentesMomo: pourcentage,
        dureeEstimeeSemaines: dureeEstimeeSemaines(montant, pourcentage, ventes.ventesMomo),
        coutTotalPct: null,
      },
      envoyeA: maintenant,
      reponseAvant: ajouterHeures(maintenant, REPONSE_SOUS_HEURES),
      accuseA: null,
      decisionA: null,
      verseA: null,
      retireA: null,
      motifRefus: null,
      pieces: piecesDuDossier({ ventes, releve, pieces, pourcentage }),
      mandat: {
        pourcentage,
        signeA: maintenant,
        signePar: utilisateur.id,
        compteMarchandId: compte.id,
        operateur: compte.operateur,
        actif: true,
      },
      resteDu: null,
      rembourseA: null,
    };
    const resultat = await this.dossiers.ajouter(dossier);
    if (resultat === "demande_en_cours") throw demandeEnCours();
    if (resultat === "numero_pris") throw new Error(`Numéro de dossier déjà pris : ${dossier.id}`);
    return dossier;
  }

  /* ------------------------------------------------------------------ transmission au partenaire */

  /**
   * Envoie le dossier au partenaire et note l'accusé de réception. Sans réponse du partenaire, le dossier
   * reste « envoyé » et l'envoi est rejoué par `TachesFinancement` (idempotent par numéro de dossier).
   */
  async transmettre(dossier: DossierStocke): Promise<DossierStocke> {
    if (dossier.statut !== "envoye" || dossier.accuseA !== null) return dossier;
    let accuse: { reference: string; accuseA: string };
    try {
      accuse = await this.partenaire.transmettre(transmis(dossier));
    } catch (e) {
      this.logger.warn(`Dossier ${dossier.id} non transmis (${(e as Error).name}), à rejouer`);
      return dossier;
    }
    for (let essai = 0; essai < ESSAIS_CONCURRENCE; essai++) {
      const actuel = await this.dossiers.trouver(dossier.agenceId, dossier.id);
      if (!actuel) return dossier;
      if (actuel.statut === "retire") {
        // Retiré pendant l'envoi : le partenaire doit l'apprendre.
        await this.retirerChezLePartenaire(accuse.reference);
        return actuel;
      }
      if (actuel.accuseA !== null) return actuel;
      const suivant: DossierStocke = {
        ...actuel,
        referencePartenaire: accuse.reference,
        accuseA: accuse.accuseA,
        statut: actuel.statut === "envoye" ? "en_analyse" : actuel.statut,
      };
      if (await this.dossiers.remplacer(suivant, actuel.version)) {
        return { ...suivant, version: actuel.version + 1 };
      }
    }
    throw conflitConcurrent();
  }

  private async retirerChezLePartenaire(reference: string): Promise<void> {
    try {
      await this.partenaire.retirer(reference);
    } catch (e) {
      this.logger.error(
        `Retrait de ${reference} chez le partenaire en échec (${(e as Error).name})`,
      );
    }
  }

  /* ------------------------------------------------------------------ retirer la demande */

  /**
   * Retire la demande tant qu'elle n'est pas versée. Le partenaire est prévenu d'abord : s'il a déjà versé
   * ou refusé, le dossier prend cette issue et le retrait est refusé (409 `DOSSIER_NON_RETIRABLE`) ; s'il ne
   * répond pas, rien n'est changé (503) et le patron réessaie. Rejouer le retrait d'un dossier déjà retiré
   * répond la même chose.
   */
  async retirer(
    utilisateur: Utilisateur,
    dossierId: string,
    corps: unknown,
  ): Promise<DemandeRetireeVue> {
    const cmd = lireRetrait(corps);
    const agenceId = agenceDe(utilisateur);
    if (cmd.dossierId !== dossierId) {
      throw commandeInvalide("Le dossier du corps diffère de celui de l'URL");
    }
    return this.ecritures.executer(
      utilisateur,
      "financement.retirer",
      { dossierId },
      cmd.signature,
      async () => {
        const dossier = await this.retirerDossier(agenceId, dossierId);
        return {
          reponse: { dossier: vueDossier(dossier, this.horloge.maintenant()) },
          cible: { type: "dossier_financement", id: dossierId },
        };
      },
    );
  }

  private async retirerDossier(agenceId: string, dossierId: string): Promise<DossierStocke> {
    for (let essai = 0; essai < ESSAIS_CONCURRENCE; essai++) {
      const dossier = RE_NUMERO_DOSSIER.test(dossierId)
        ? await this.dossiers.trouver(agenceId, dossierId)
        : null;
      if (!dossier) throw dossierInconnu();
      if (dossier.statut === "retire") return dossier;
      if (!estRetirable(dossier.statut)) throw dossierNonRetirable();

      if (dossier.referencePartenaire !== null) {
        let issue;
        try {
          issue = await this.partenaire.retirer(dossier.referencePartenaire);
        } catch (e) {
          this.logger.warn(`Retrait de ${dossier.id} sans réponse (${(e as Error).name})`);
          throw partenaireIndisponible();
        }
        if (issue !== "retire") {
          // Le partenaire a tranché avant nous : on prend son issue, puis on refuse le retrait.
          await this.rattraper(dossier);
          throw dossierNonRetirable();
        }
      }
      const retire: DossierStocke = {
        ...dossier,
        statut: "retire",
        retireA: versIsoDouala(this.horloge.maintenant()),
      };
      if (await this.dossiers.remplacer(retire, dossier.version)) {
        return { ...retire, version: dossier.version + 1 };
      }
    }
    throw conflitConcurrent();
  }

  /* ------------------------------------------------------------------ réponses du partenaire */

  /**
   * Applique une notification du partenaire (accusé, versement, refus). Idempotente : une notification
   * rejouée ne change rien et n'envoie pas deux SMS ; une notification incohérente (versement d'un dossier
   * refusé, montant versé supérieur au montant demandé) est refusée (409) et tracée.
   */
  async appliquer(notification: NotificationPartenaire): Promise<DossierStocke> {
    for (let essai = 0; essai < ESSAIS_CONCURRENCE; essai++) {
      const dossier = await this.dossiers.parReference(notification.reference);
      if (!dossier) {
        throw new ErreurFinancement(
          404,
          "REFERENCE_INCONNUE",
          "Aucun dossier ne porte cette référence",
        );
      }
      let suivant: DossierStocke;
      try {
        suivant = this.transition(dossier, notification);
      } catch (e) {
        if (!(e instanceof Incoherence)) throw e;
        await this.audit.enregistrer({
          action: "financement.notification",
          resultat: "refus",
          cible: { type: "dossier_financement", id: dossier.id },
          details: { cause: e.cause, statut: dossier.statut },
        });
        throw new ErreurFinancement(
          409,
          "NOTIFICATION_INCOHERENTE",
          "Cette notification ne correspond pas à l'état du dossier",
        );
      }
      if (suivant === dossier) return dossier;
      if (!(await this.dossiers.remplacer(suivant, dossier.version))) continue;
      const ecrit = { ...suivant, version: dossier.version + 1 };
      if (notification.type === "verse") {
        await this.prevenir.envoyer(dossier.demandePar, sms.verse(ecrit));
      } else if (notification.type === "refuse") {
        await this.prevenir.envoyer(dossier.demandePar, sms.refuse(ecrit));
      }
      return ecrit;
    }
    throw conflitConcurrent();
  }

  /** Le dossier après la notification ; le même objet si elle ne change rien. */
  private transition(d: DossierStocke, n: NotificationPartenaire): DossierStocke {
    if (n.type === "accuse") {
      if (d.accuseA !== null) return d;
      return {
        ...d,
        accuseA: n.at,
        statut: d.statut === "envoye" ? "en_analyse" : d.statut,
      };
    }
    if (n.type === "refuse") {
      if (d.statut === "refuse" || d.statut === "retire") return d;
      if (d.statut === "verse") throw new Incoherence(n.type);
      return {
        ...d,
        statut: "refuse",
        accuseA: d.accuseA ?? n.at,
        decisionA: n.at,
        motifRefus: n.motif,
      };
    }
    // Versement.
    if (d.statut === "verse") return d;
    if (d.statut === "refuse" || d.statut === "retire") throw new Incoherence(n.type);
    const montant = n.montant ?? d.montant;
    if (montant > d.montant) throw new Incoherence("verse_au_dessus_du_montant");
    return {
      ...d,
      statut: "verse",
      accuseA: d.accuseA ?? n.at,
      decisionA: n.at,
      verseA: n.at,
      montant,
      conditions: { ...d.conditions, coutTotalPct: n.coutTotalPct },
      resteDu: totalARembourser(montant, n.coutTotalPct),
    };
  }

  /** Demande son état au partenaire et l'applique (notification perdue, retrait refusé). */
  async rattraper(dossier: DossierStocke): Promise<void> {
    if (dossier.referencePartenaire === null) return;
    try {
      const etat = await this.partenaire.etat(dossier.referencePartenaire);
      if (etat) await this.appliquer(etat);
    } catch (e) {
      this.logger.warn(`État de ${dossier.id} inconnu du partenaire (${(e as Error).name})`);
    }
  }
}

/** Notification qui contredit l'état du dossier. */
class Incoherence extends Error {
  constructor(readonly cause: string) {
    super(cause);
  }
}

function transmis(d: DossierStocke): DossierTransmis {
  return {
    dossierId: d.id,
    agenceId: d.agenceId,
    montant: d.montant,
    conditions: { ...d.conditions },
    pieces: d.pieces.map((p) => ({ ...p })),
    mandat: {
      pourcentage: d.mandat.pourcentage,
      signeA: d.mandat.signeA,
      compteMarchandId: d.mandat.compteMarchandId,
      operateur: d.mandat.operateur,
    },
  };
}

const demandeEnCours = (): ErreurFinancement =>
  new ErreurFinancement(
    409,
    "DEMANDE_EN_COURS",
    "Une demande d'avance est déjà en cours pour cette agence",
  );

const conflitConcurrent = (): ErreurFinancement =>
  new ErreurFinancement(409, "CONFLIT", "Le dossier vient d'être modifié, réessaie");
