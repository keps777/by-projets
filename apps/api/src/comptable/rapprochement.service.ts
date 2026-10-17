import { HttpException, Injectable, Logger } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { AuditService, type EntreeAudit } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { ChargeurMois, ChoixDuMois, exigerCompagnie } from "./donnees.service";
import type { DecisionRapprochement, TransactionRapprochee } from "./modele";
import { ActionRefusee, ActionsRapprochement, Clotures, DecisionsRapprochement } from "./ports";
import { versIsoDouala } from "./temps";
import {
  erreurApi,
  lireRapprochement,
  lireSignature,
  type CommandeRapprochement,
} from "./validation";
import { figerLignes, lignesOuvertes } from "./vues";

export const ACTION_RAPPROCHEMENT = "comptable.rapprochement.appliquer";

/** `RapprochementApplique` des contrats patron. */
export interface RapprochementAppliqueVue {
  journalId: string;
  signeA: string;
  signePar: string;
  mois: string;
  remboursements: number;
  rattachements: number;
  reclamations: number;
  lignesOuvertes: number;
}

export type IssueExecution = "faite" | "en_attente" | "refusee";

/**
 * Applique les décisions du patron sur les transactions MoMo sans correspondance : rembourser (MoMo vers le
 * même numéro), rattacher (la référence est écrite sur le colis ou le billet), demander (réclamation auprès
 * de l'opérateur). Signé par le PIN, tracé au journal d'audit.
 *
 * Règles : une décision est **définitive** (un remboursement ne se reprend pas) ; la rejouer à l'identique ne
 * fait rien de plus ; un mois clôturé refuse toute décision ; une décision n'est « appliquée » qu'une fois son
 * effet parti, sinon la ligne reste ouverte et la tâche de fond la rejoue avec la même clé d'idempotence.
 */
@Injectable()
export class RapprochementService {
  private readonly logger = new Logger("Rapprochement");

  constructor(
    private readonly chargeur: ChargeurMois,
    private readonly choix: ChoixDuMois,
    private readonly clotures: Clotures,
    private readonly decisions: DecisionsRapprochement,
    private readonly actions: ActionsRapprochement,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly personnes: PersonnesRepository,
    private readonly horloge: Horloge,
  ) {}

  async appliquer(utilisateur: Utilisateur, corps: unknown): Promise<RapprochementAppliqueVue> {
    const compagnieId = exigerCompagnie(utilisateur);
    const signature = lireSignature(corps);
    const commande = lireRapprochement(corps, signature);
    this.choix.verifier(commande.mois);
    try {
      await this.signature.verifier(utilisateur, signature);
    } catch (e) {
      await this.tracerRefus(utilisateur, commande, e);
      throw e;
    }
    try {
      return await this.appliquerSigne(utilisateur, compagnieId, commande);
    } catch (e) {
      if (e instanceof HttpException) await this.tracerRefus(utilisateur, commande, e);
      throw e;
    }
  }

  private async appliquerSigne(
    utilisateur: Utilisateur,
    compagnieId: string,
    commande: CommandeRapprochement,
  ): Promise<RapprochementAppliqueVue> {
    const { mois } = commande;
    if (await this.clotures.trouver(compagnieId, mois)) throw this.moisClos();

    const d = await this.chargeur.charger(compagnieId, mois);
    const lignes = new Map<string, TransactionRapprochee>(
      d.rapprochement.sansCorrespondance.map((t) => [t.reference, t]),
    );
    const prises = new Map(d.decisions.map((x) => [x.reference, x]));

    // Tout est contrôlé avant le premier effet : un lot invalide ne rembourse rien.
    for (const demande of commande.decisions) {
      const ligne = lignes.get(demande.reference);
      if (!ligne) {
        throw erreurApi(404, "TRANSACTION_INCONNUE", `Transaction inconnue : ${demande.reference}`);
      }
      const prise = prises.get(demande.reference);
      if (prise && prise.action !== demande.action) {
        throw erreurApi(
          409,
          "DECISION_DEJA_PRISE",
          `La transaction ${demande.reference} a déjà reçu la décision « ${prise.action} »`,
        );
      }
      if (demande.action === "rattacher" && ligne.cibleSuggeree === null) {
        throw erreurApi(
          422,
          "CIBLE_INTROUVABLE",
          `Aucun colis ni billet à rattacher à ${demande.reference}`,
        );
      }
    }

    const parNom = (await this.personnes.trouverParId(utilisateur.id))?.nom ?? utilisateur.id;
    const journal = await this.audit.enregistrer({
      ...this.entreeAudit(utilisateur, commande, "succes"),
      details: {
        ...this.detailsAudit(commande),
        decisions: commande.decisions.map((x) => ({ reference: x.reference, action: x.action })),
      },
    });
    const maintenant = versIsoDouala(this.horloge.maintenant());

    const refusees: string[] = [];
    for (const demande of commande.decisions) {
      const ligne = lignes.get(demande.reference)!;
      const nouvelle: DecisionRapprochement = {
        compagnieId,
        mois,
        reference: ligne.reference,
        action: demande.action,
        cible: demande.action === "rattacher" ? ligne.cibleSuggeree : null,
        montant: ligne.montant,
        operateur: ligne.operateur,
        telephoneMasque: ligne.telephoneMasque,
        cause: ligne.cause,
        explication: ligne.explication,
        decideA: maintenant,
        parId: utilisateur.id,
        parNom,
        journalId: journal.id,
        methode: commande.signature.methode,
        execution: "en_attente",
        referenceExecution: null,
      };
      const ecrite = await this.decisions.enregistrer(nouvelle);
      if (ecrite.resultat === "mois_verrouille") throw this.moisClos();
      const courante = ecrite.resultat === "existe" ? ecrite.existante : nouvelle;
      if (courante.execution === "faite") continue;
      if ((await this.executer(courante)) === "refusee") refusees.push(courante.reference);
    }

    if (refusees.length > 0) {
      throw erreurApi(
        422,
        "ACTION_REFUSEE",
        `L'opérateur a refusé : ${refusees.join(", ")}. Choisissez une autre action pour ces lignes.`,
      );
    }

    const finales = await this.decisions.lister(compagnieId, mois);
    const apres = figerLignes(d.rapprochement.sansCorrespondance, finales);
    const compter = (action: DecisionRapprochement["action"]): number =>
      finales.filter((x) => x.action === action).length;
    return {
      journalId: journal.id,
      signeA: maintenant,
      signePar: utilisateur.id,
      mois,
      remboursements: compter("rembourser"),
      rattachements: compter("rattacher"),
      reclamations: compter("demander"),
      lignesOuvertes: lignesOuvertes(apres),
    };
  }

  /**
   * Fait partir l'effet d'une décision enregistrée. Idempotent : la clé est la même à chaque essai, donc un
   * remboursement rejoué ne paie pas deux fois. Refus définitif : la décision est retirée (la ligne redevient
   * ouverte) et le refus est tracé. Résultat inconnu (réseau) : la décision reste en attente.
   */
  async executer(decision: DecisionRapprochement): Promise<IssueExecution> {
    const cle = `rapprochement:${decision.compagnieId}:${decision.reference}:${decision.action}`;
    try {
      const resultat =
        decision.action === "rembourser"
          ? await this.actions.rembourser({
              cle,
              reference: decision.reference,
              operateur: decision.operateur,
              montant: decision.montant,
            })
          : decision.action === "rattacher"
            ? await this.actions.rattacher({
                cle,
                reference: decision.reference,
                cible: decision.cible ?? "",
              })
            : await this.actions.reclamer({
                cle,
                reference: decision.reference,
                operateur: decision.operateur,
                montant: decision.montant,
              });
      await this.decisions.confirmer(
        decision.compagnieId,
        decision.mois,
        decision.reference,
        resultat.reference,
      );
      return "faite";
    } catch (e) {
      if (e instanceof ActionRefusee) {
        await this.decisions.retirer(decision.compagnieId, decision.mois, decision.reference);
        await this.audit.enregistrer({
          acteur: { id: decision.parId, role: "patron", compagnieId: decision.compagnieId },
          action: `${ACTION_RAPPROCHEMENT}.refusee`,
          resultat: "echec",
          cible: { type: "transaction", id: decision.reference },
          details: { mois: decision.mois, action: decision.action, journalId: decision.journalId },
        });
        return "refusee";
      }
      this.logger.warn(
        `Décision ${decision.action} de ${decision.reference} en attente (${(e as Error).name})`,
      );
      return "en_attente";
    }
  }

  /** Rejoue les décisions restées en attente (tâche de fond). Renvoie combien sont parties. */
  async reprendre(limite = 50): Promise<number> {
    let parties = 0;
    for (const decision of await this.decisions.enAttente(limite)) {
      if ((await this.executer(decision)) === "faite") parties++;
    }
    return parties;
  }

  private moisClos(): HttpException {
    return erreurApi(409, "MOIS_DEJA_CLOTURE", "Le mois est clôturé : plus aucune décision");
  }

  private entreeAudit(
    utilisateur: Utilisateur,
    commande: CommandeRapprochement,
    resultat: EntreeAudit["resultat"],
  ): Pick<EntreeAudit, "acteur" | "action" | "resultat" | "cible"> {
    return {
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: ACTION_RAPPROCHEMENT,
      resultat,
      cible: { type: "rapprochement", id: commande.mois },
    };
  }

  /** Le PIN n'y figure jamais : seulement la façon de signer et l'heure déclarée par l'appareil. */
  private detailsAudit(commande: CommandeRapprochement): Record<string, unknown> {
    return {
      mois: commande.mois,
      nombre: commande.decisions.length,
      signature: commande.signature.methode,
      signeAAppareil: commande.signature.signeA,
    };
  }

  private async tracerRefus(
    utilisateur: Utilisateur,
    commande: CommandeRapprochement,
    erreur: unknown,
  ): Promise<void> {
    const reponse = erreur instanceof HttpException ? erreur.getResponse() : null;
    const cause =
      typeof reponse === "object" && reponse !== null && "code" in reponse
        ? String((reponse as { code: unknown }).code)
        : "erreur";
    await this.audit.enregistrer({
      ...this.entreeAudit(utilisateur, commande, "refus"),
      details: { ...this.detailsAudit(commande), cause },
    });
  }
}
