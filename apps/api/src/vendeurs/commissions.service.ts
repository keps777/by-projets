import { Injectable, Logger } from "@nestjs/common";
import { formaterFcfa } from "../colis/regles";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import { aammjjDouala, debutDeSemaine, versIsoDouala } from "../relais/temps";
import type { DebitCommission } from "./modele";
import {
  CommissionsVendeurs,
  MessagesVendeurs,
  VendeursRepository,
  VersementRefuse,
  VersementsMobile,
} from "./ports";
import { cleVersement, versementDu } from "./regles";

export type IssueVersementCommissions =
  /** L'opérateur a confirmé. */
  | "verse"
  /** Le montant est réservé, l'opérateur n'a pas répondu : la tâche de fond le rejouera. */
  | "en_attente"
  /** Rien à verser. */
  | "rien"
  /** Cette semaine a déjà été traitée pour ce vendeur. */
  | "deja"
  /** L'opérateur a refusé pour de bon : le solde est revenu. */
  | "refuse";

const LIBELLE = "AfriMove : vos commissions de la semaine (vendeur)";

/**
 * Verse aux vendeurs leurs commissions, chaque lundi à partir de 8 h (heure de Douala) : le solde
 * entier, par MoMo, sur le numéro de leur fiche. Le débit est réservé d'abord (atomique), l'opérateur
 * est appelé ensuite avec une clé qui porte la semaine, puis le débit est confirmé : une panne entre
 * les deux ne perd ni ne double l'argent. Ne passent ici que des commissions, jamais un prix de billet.
 */
@Injectable()
export class CommissionsService {
  private readonly logger = new Logger("CommissionsService");

  constructor(
    private readonly commissions: CommissionsVendeurs,
    private readonly operateur: VersementsMobile,
    private readonly vendeurs: VendeursRepository,
    private readonly messages: MessagesVendeurs,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /** Le lundi, verse à chaque vendeur ce qu'il a gagné. Relancer la tâche ne paie jamais deux fois. */
  async verserLaSemaine(): Promise<{ verses: number; enAttente: number; refuses: number }> {
    const maintenant = versIsoDouala(this.horloge.maintenant());
    const debut = debutDeSemaine(maintenant);
    const bilan = { verses: 0, enAttente: 0, refuses: 0 };
    if (!versementDu(maintenant, debut)) return bilan;
    for (const { vendeurId } of await this.commissions.soldesPositifs()) {
      const vendeur = await this.vendeurs.trouver(vendeurId);
      if (!vendeur) continue;
      const issue = await this.payer(vendeurId, cleVersement(vendeurId, aammjjDouala(debut)));
      if (issue === "verse") bilan.verses += 1;
      else if (issue === "en_attente") bilan.enAttente += 1;
      else if (issue === "refuse") bilan.refuses += 1;
    }
    return bilan;
  }

  async payer(vendeurId: string, cle: string): Promise<IssueVersementCommissions> {
    const vendeur = await this.vendeurs.trouver(vendeurId);
    if (!vendeur) return "rien";
    const solde = await this.commissions.solde(vendeurId);
    if (solde <= 0) return "rien";
    const reservation = await this.commissions.reserver({
      cle,
      vendeurId,
      montant: solde,
      at: versIsoDouala(this.horloge.maintenant()),
      operateur: vendeur.momo.operateur,
      telephone: vendeur.momo.telephone,
      libelle: LIBELLE,
    });
    if (reservation === "existe") return "deja";
    if (reservation === "solde_insuffisant") return "rien";
    return this.envoyer({
      cle,
      vendeurId,
      montant: solde,
      at: versIsoDouala(this.horloge.maintenant()),
      etat: "en_attente",
      operateur: vendeur.momo.operateur,
      telephone: vendeur.momo.telephone,
      libelle: LIBELLE,
      reference: null,
    });
  }

  private async envoyer(debit: DebitCommission): Promise<IssueVersementCommissions> {
    try {
      const { reference } = await this.operateur.verser({
        cle: debit.cle,
        operateur: debit.operateur,
        telephone: debit.telephone,
        montant: debit.montant,
        libelle: debit.libelle,
      });
      await this.commissions.confirmer(debit.cle, reference);
      await this.audit.enregistrer({
        action: "vendeur.versement",
        resultat: "succes",
        cible: { type: "vendeur", id: debit.vendeurId },
        details: { cle: debit.cle, montant: debit.montant },
      });
      const vendeur = await this.vendeurs.trouver(debit.vendeurId);
      if (vendeur) {
        await this.messages.prevenir(
          vendeur.telephone,
          `AfriMove : ${formaterFcfa(debit.montant)} de commissions viennent d'être versés sur votre compte mobile money.`,
        );
      }
      return "verse";
    } catch (e) {
      if (e instanceof VersementRefuse) {
        await this.commissions.annuler(debit.cle);
        await this.audit.enregistrer({
          action: "vendeur.versement",
          resultat: "echec",
          cible: { type: "vendeur", id: debit.vendeurId },
          details: { cle: debit.cle, montant: debit.montant, cause: "refuse" },
        });
        return "refuse";
      }
      // Résultat inconnu : on garde la réservation et on rejouera avec la même clé.
      this.logger.warn(`Versement ${debit.cle} en attente (${(e as Error).name})`);
      return "en_attente";
    }
  }

  /** Rejoue les versements dont l'opérateur n'avait pas répondu ; renvoie le nombre confirmés. */
  async reprendre(): Promise<number> {
    let confirmes = 0;
    for (const debit of await this.commissions.debitsEnAttente()) {
      if ((await this.envoyer(debit)) === "verse") confirmes += 1;
    }
    return confirmes;
  }
}
