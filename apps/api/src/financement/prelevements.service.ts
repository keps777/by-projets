import { Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { sms } from "./contenu";
import { PrevenirPatron } from "./ecritures";
import type { DossierStocke, Prelevement } from "./modele";
import { DossiersFinancement, PartenaireFinancier, PrelevementRefuse, Prelevements } from "./ports";
import { partDeLaVente } from "./regles";
import { enMs, versIsoDouala } from "./temps";

/** Une vente encaissée en mobile money, telle que la billetterie la signale. */
export interface VenteMomo {
  agenceId: string;
  /** Identifiant stable de la vente : un même identifiant n'est jamais prélevé deux fois. */
  venteId: string;
  /** Montant encaissé en FCFA. */
  montant: number;
  /** Instant de l'encaissement. */
  at: string;
}

export type IssuePrelevement =
  | { resultat: "preleve"; montant: number }
  | { resultat: "en_attente"; montant: number }
  | { resultat: "refuse"; montant: number }
  | {
      resultat: "aucun_mandat" | "avant_versement" | "deja_compte" | "solde_nul" | "montant_nul";
    };

/**
 * Prélèvement d'un pourcentage des ventes MoMo pour rembourser l'avance. Il part du compte marchand de
 * l'agence **directement vers le partenaire** (AfriMove donne l'ordre et ne touche rien). Il démarre au
 * premier billet MoMo qui suit le versement, ne dépasse jamais ce qui reste dû, ne compte jamais deux fois
 * la même vente, et s'arrête quand la dette est soldée (le mandat est alors révoqué).
 */
@Injectable()
export class PrelevementsService {
  private readonly logger = new Logger("PrelevementsService");

  constructor(
    private readonly dossiers: DossiersFinancement,
    private readonly prelevements: Prelevements,
    private readonly partenaire: PartenaireFinancier,
    private readonly prevenir: PrevenirPatron,
    private readonly horloge: Horloge,
  ) {}

  async enregistrerVenteMomo(vente: VenteMomo): Promise<IssuePrelevement> {
    if (!Number.isSafeInteger(vente.montant) || vente.montant <= 0) {
      return { resultat: "montant_nul" };
    }
    const dossier = await this.dossiers.aPrelever(vente.agenceId);
    if (!dossier || dossier.resteDu === null || dossier.verseA === null) {
      return { resultat: "aucun_mandat" };
    }
    // « Le 8 % démarre au 1er billet MoMo suivant » : rien avant le versement.
    if (enMs(vente.at) <= enMs(dossier.verseA)) return { resultat: "avant_versement" };
    const souhaite = partDeLaVente(vente.montant, dossier.mandat.pourcentage);
    if (souhaite <= 0) return { resultat: "montant_nul" };

    const reservation = await this.prelevements.reserver({
      cle: `prelevement:${vente.venteId}`,
      dossierId: dossier.id,
      agenceId: vente.agenceId,
      venteId: vente.venteId,
      montantVente: vente.montant,
      souhaite,
      totalDu: dossier.resteDu,
      at: vente.at,
    });
    if (reservation.resultat === "existe") return { resultat: "deja_compte" };
    if (reservation.resultat === "solde_nul") {
      await this.solderSiPaye(dossier);
      return { resultat: "solde_nul" };
    }
    return this.executer(reservation.prelevement, dossier);
  }

  /** Envoie l'ordre au partenaire ; en cas de doute (réseau), le prélèvement reste en attente et sera rejoué. */
  async executer(prelevement: Prelevement, dossier: DossierStocke): Promise<IssuePrelevement> {
    if (dossier.referencePartenaire === null) {
      this.logger.error(`Dossier ${dossier.id} versé sans référence du partenaire`);
      return { resultat: "en_attente", montant: prelevement.montant };
    }
    try {
      const { reference } = await this.partenaire.prelever({
        cle: prelevement.cle,
        reference: dossier.referencePartenaire,
        montant: prelevement.montant,
        venteId: prelevement.venteId,
      });
      await this.prelevements.confirmer(prelevement.cle, reference);
    } catch (e) {
      if (e instanceof PrelevementRefuse) {
        // Refus définitif : la réservation disparaît, l'agence garde cette vente.
        await this.prelevements.annuler(prelevement.cle);
        this.logger.warn(`Prélèvement ${prelevement.cle} refusé par le partenaire`);
        return { resultat: "refuse", montant: prelevement.montant };
      }
      this.logger.warn(
        `Prélèvement ${prelevement.cle} sans réponse (${(e as Error).name}), à rejouer`,
      );
      return { resultat: "en_attente", montant: prelevement.montant };
    }
    await this.solderSiPaye(dossier);
    return { resultat: "preleve", montant: prelevement.montant };
  }

  /** Rejoue les prélèvements restés sans réponse (tâche de fond). */
  async rejouerEnAttente(): Promise<number> {
    let rejoues = 0;
    for (const prelevement of await this.prelevements.enAttente()) {
      const dossier = await this.dossiers.trouver(prelevement.agenceId, prelevement.dossierId);
      if (!dossier) continue;
      const issue = await this.executer(prelevement, dossier);
      if (issue.resultat === "preleve") rejoues += 1;
    }
    return rejoues;
  }

  /** Une fois tout ce qui est dû prélevé et confirmé, le mandat est révoqué. */
  private async solderSiPaye(dossier: DossierStocke): Promise<void> {
    if (dossier.resteDu === null) return;
    if ((await this.prelevements.totalExecute(dossier.id)) < dossier.resteDu) return;
    for (let essai = 0; essai < 5; essai++) {
      const actuel = await this.dossiers.trouver(dossier.agenceId, dossier.id);
      if (!actuel || !actuel.mandat.actif) return;
      const solde: DossierStocke = {
        ...actuel,
        mandat: { ...actuel.mandat, actif: false },
        rembourseA: versIsoDouala(this.horloge.maintenant()),
      };
      if (await this.dossiers.remplacer(solde, actuel.version)) {
        await this.prevenir.envoyer(actuel.demandePar, sms.soldee(solde));
        return;
      }
    }
  }
}
