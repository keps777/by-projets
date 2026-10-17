import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import type { MomoPartenaire } from "./modele";
import {
  Portefeuille,
  VersementRefuse,
  VersementsMobile,
  type Debit,
  type TypePartenaire,
} from "./ports";
import { versIsoDouala } from "./temps";

export type IssueVersement =
  /** L'opérateur a confirmé. */
  | "verse"
  /** Le montant est réservé, l'opérateur n'a pas répondu : la tâche de fond le rejouera. */
  | "en_attente"
  /** Rien à verser (solde nul ou sous le minimum). */
  | "rien"
  /** Cette clé a déjà été traitée (même semaine, même soir, même retrait). */
  | "deja"
  /** L'opérateur a refusé pour de bon : le solde est revenu. */
  | "refuse";

export interface DemandePaiementPartenaire {
  type: TypePartenaire;
  partenaireId: string;
  cle: string;
  motif: Debit["motif"];
  /** Absent : tout le solde. */
  montant?: number;
  /** Le solde doit atteindre ce seuil (retrait dès 5 000 F). */
  soldeMinimum?: number;
  momo: MomoPartenaire;
  libelle: string;
}

/**
 * Verse aux relais et aux livreurs ce qu'ils ont gagné. Le débit est réservé d'abord (atomique),
 * l'opérateur est appelé ensuite avec une clé d'idempotence, puis le débit est confirmé : une panne
 * entre les deux ne perd ni ne double l'argent.
 */
@Injectable()
export class VersementsService {
  private readonly logger = new Logger("VersementsService");

  constructor(
    private readonly portefeuille: Portefeuille,
    private readonly operateur: VersementsMobile,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  async payer(
    demande: DemandePaiementPartenaire,
  ): Promise<{ issue: IssueVersement; montant: number }> {
    const at = versIsoDouala(this.horloge.maintenant());
    const solde = await this.portefeuille.solde(demande.type, demande.partenaireId);
    const montant = demande.montant ?? solde;
    if (montant <= 0) return { issue: "rien", montant: 0 };
    const reservation = await this.portefeuille.reserver({
      cle: demande.cle,
      type: demande.type,
      partenaireId: demande.partenaireId,
      montant,
      motif: demande.motif,
      at,
      soldeMinimum: demande.soldeMinimum ?? 0,
      operateur: demande.momo.operateur,
      telephone: demande.momo.telephone,
      libelle: demande.libelle,
    });
    if (reservation === "existe") return { issue: "deja", montant };
    if (reservation === "solde_insuffisant") return { issue: "rien", montant };
    return {
      issue: await this.envoyer(demande.cle, demande.type, demande.partenaireId, {
        cle: demande.cle,
        operateur: demande.momo.operateur,
        telephone: demande.momo.telephone,
        montant,
        libelle: demande.libelle,
      }),
      montant,
    };
  }

  private async envoyer(
    cle: string,
    type: TypePartenaire,
    partenaireId: string,
    versement: Parameters<VersementsMobile["verser"]>[0],
  ): Promise<IssueVersement> {
    try {
      const { reference } = await this.operateur.verser(versement);
      await this.portefeuille.confirmer(cle, reference);
      await this.audit.enregistrer({
        action: `${type}.versement`,
        resultat: "succes",
        cible: { type, id: partenaireId },
        details: { cle, montant: versement.montant },
      });
      return "verse";
    } catch (e) {
      if (e instanceof VersementRefuse) {
        await this.portefeuille.annuler(cle);
        await this.audit.enregistrer({
          action: `${type}.versement`,
          resultat: "echec",
          cible: { type, id: partenaireId },
          details: { cle, montant: versement.montant, cause: "refuse" },
        });
        return "refuse";
      }
      // Résultat inconnu : on garde la réservation et on rejouera avec la même clé.
      this.logger.warn(`Versement ${cle} en attente (${(e as Error).name})`);
      return "en_attente";
    }
  }

  /** Rejoue les versements dont l'opérateur n'avait pas répondu ; renvoie le nombre confirmés. */
  async reprendre(): Promise<number> {
    let confirmes = 0;
    for (const debit of await this.portefeuille.debitsEnAttente()) {
      const issue = await this.envoyer(debit.cle, debit.type, debit.partenaireId, {
        cle: debit.cle,
        operateur: debit.operateur,
        telephone: debit.telephone,
        montant: debit.montant,
        libelle: debit.libelle,
      });
      if (issue === "verse") confirmes += 1;
    }
    return confirmes;
  }
}
