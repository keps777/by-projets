import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AvisBillets, Billets, type AvisBilletterie } from "../billetterie/ports";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { Paiements, CommandesAPayer } from "./ports";
import { RemboursementsService } from "./remboursements.service";
import { fraisParBillet } from "./regles";

/**
 * Écoute des avis de la billetterie : un billet annulé (par le voyageur, par l'agence ou parce que
 * le départ est annulé) est remboursé sur le moyen d'origine.
 *
 *  - le prix remboursé (`remboursement`, calculé par la billetterie après la retenue éventuelle)
 *    revient de la compagnie ;
 *  - si c'est le départ qui est annulé, les frais de service de ce billet reviennent d'AfriMove ;
 *    ils restent acquis pour une annulation voulue par le voyageur (à confirmer, voir le README) ;
 *  - un billet vendu au guichet, ou payé à la gare en mode dégradé, n'est pas remboursé ici : c'est
 *    l'agence qui rend l'argent ;
 *  - `publier` ne lève jamais : un remboursement qui n'a pas pu être enregistré est journalisé et
 *    audité, l'annulation du billet, elle, n'échoue pas. Le remboursement est mis en file (« demandé »)
 *    et part au prochain balayage, pour ne pas ralentir l'annulation.
 */
@Injectable()
export class AvisPaiements extends AvisBillets {
  private readonly journal = new Logger("AvisPaiements");

  constructor(
    private readonly billets: Billets,
    private readonly paiements: Paiements,
    private readonly commandes: CommandesAPayer,
    private readonly remboursements: RemboursementsService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async publier(avis: AvisBilletterie): Promise<void> {
    if (avis.type !== "billet.annule") return;
    try {
      await this.rembourserBillet(avis);
    } catch (e) {
      const raison = e instanceof Error ? e.message : "erreur inconnue";
      this.journal.error(`Remboursement du billet ${avis.billetId} impossible : ${raison}`);
      await this.audit
        .enregistrer({
          action: "paiement.remboursement_billet_echec",
          resultat: "echec",
          cible: { type: "billet", id: avis.billetId },
          details: { raison, remboursement: avis.remboursement },
          at: this.horloge.maintenant(),
        })
        .catch(() => undefined);
    }
  }

  private async rembourserBillet(
    avis: Extract<AvisBilletterie, { type: "billet.annule" }>,
  ): Promise<void> {
    const billet = await this.billets.trouver(avis.billetId);
    if (!billet?.commandeId) return;
    const paiement = (await this.paiements.duCommande(billet.commandeId)).find(
      (p) => p.statut === "reussi" && p.confirmation === "faite",
    );
    if (!paiement || paiement.fournisseur === null) return;

    const commande = await this.commandes.trouver(billet.commandeId);
    const frais =
      avis.raison === "depart_annule"
        ? fraisParBillet(paiement.repartition, commande?.nombreSieges ?? 1)
        : 0;
    const lignes = [
      { beneficiaire: "compagnie" as const, montant: avis.remboursement },
      { beneficiaire: "afrimove" as const, montant: frais },
    ].filter((l) => l.montant > 0);
    if (lignes.length === 0) return;
    await this.remboursements.demander(paiement.id, {
      lignes,
      cause: avis.raison === "depart_annule" ? "depart_annule" : "billet_annule",
      cle: `billet-annule:${avis.billetId}`,
      billetId: avis.billetId,
      differe: true,
    });
  }
}

/** Compose plusieurs écouteurs d'avis : chacun reçoit l'avis, l'échec de l'un n'empêche pas les autres. */
export function composerAvis(...ecouteurs: AvisBillets[]): AvisBillets {
  return {
    async publier(avis: AvisBilletterie): Promise<void> {
      for (const e of ecouteurs) {
        try {
          await e.publier(avis);
        } catch {
          /* l'écouteur journalise lui-même */
        }
      }
    },
  };
}

const MARQUE = Symbol.for("afrimove.paiements.avis-abonnes");

/**
 * Branche `AvisPaiements` sur les avis de la billetterie sans toucher à son module : au démarrage,
 * l'instance partagée de `AvisBillets` est enveloppée une seule fois (l'écouteur existant, SMS ou
 * mémoire, est appelé d'abord). Désactivable avec `PAIEMENTS_ABONNER_AVIS=false` si l'intégration
 * préfère composer les écouteurs elle-même (`composerAvis`).
 */
@Injectable()
export class AbonnementAvisBilletterie implements OnModuleInit {
  constructor(
    private readonly avisBillets: AvisBillets,
    private readonly avisPaiements: AvisPaiements,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  onModuleInit(): void {
    if (!this.config.abonnerAvis) return;
    const cible = this.avisBillets as AvisBillets & { [MARQUE]?: AvisPaiements };
    if (cible[MARQUE] === this.avisPaiements) return;
    const original = cible.publier.bind(cible);
    cible[MARQUE] = this.avisPaiements;
    cible.publier = async (avis: AvisBilletterie): Promise<void> => {
      await original(avis);
      await this.avisPaiements.publier(avis);
    };
  }
}
