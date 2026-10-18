import { Injectable } from "@nestjs/common";
import { Billets } from "../billetterie/ports";
import { SessionsCaisse } from "../caisse/ports";
import { interdit, introuvable } from "../caisse/erreurs";
import { IdempotenceService } from "../caisse/journal/idempotence.service";
import { versIsoDouala } from "../caisse/temps";
import { ColisRepository } from "../colis/ports";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { lireImpression, type DonneesImpression } from "./evenements";
import { ImpressionsAgence } from "./ports";

/**
 * `POST /agence/impressions` (événement `impression.demandee`) : l'appareil a imprimé, ou demande d'imprimer, un
 * billet, une étiquette de colis ou un ticket de caisse. Le serveur en garde la trace (une réimpression est un
 * événement aussi : le journal sait combien de copies d'un document existent) ; il n'a pas d'imprimante, c'est
 * l'appareil qui imprime et qui connaît l'état de la sienne.
 *
 * L'identifiant d'événement (UUID créé sur l'appareil) est la clé d'idempotence : rejouer la demande répond
 * `deja_recu` sans ajouter de copie. Un document qui appartient à une autre compagnie est refusé (404, comme s'il
 * n'existait pas) ; un document encore inconnu du serveur est accepté, car un appareil hors ligne peut envoyer
 * l'impression avant que la vente ou le colis qu'elle concerne ne soit arrivé.
 */
@Injectable()
export class ImpressionsService {
  constructor(
    private readonly impressions: ImpressionsAgence,
    private readonly idem: IdempotenceService,
    private readonly billets: Billets,
    private readonly colis: ColisRepository,
    private readonly sessions: SessionsCaisse,
    private readonly horloge: Horloge,
  ) {}

  async demander(corps: unknown, u: Utilisateur) {
    const e = lireImpression(corps);
    if (e.auteurId !== u.id) {
      throw interdit("AUTEUR_INCOHERENT", "L'auteur de l'événement n'est pas le compte connecté");
    }
    return this.idem.executer(e.id, async () => {
      await this.exigerDocumentDeLaCompagnie(e.donnees, u);
      const d = e.donnees;
      await this.impressions.ajouter({
        evenementId: e.id,
        document: d.document,
        documentId: d.documentId,
        copies: d.copies,
        reimpression: d.reimpression,
        auteurId: u.id,
        appareilId: e.appareilId,
        compagnieId: u.compagnieId,
        imprimeeA: versIsoDouala(e.at),
        recuA: versIsoDouala(this.horloge.maintenant()),
      });
      // Le serveur n'a pas d'imprimante : tout ce qu'il peut dire est que la demande est enregistrée.
      return { statut: "imprime" as const };
    });
  }

  /** `GET /agence/impression` : l'état de l'imprimante est connu de l'appareil, pas du serveur. */
  etat() {
    return { imprimante: { etat: "ok" as const, nom: null } };
  }

  private async exigerDocumentDeLaCompagnie(d: DonneesImpression, u: Utilisateur): Promise<void> {
    let compagnieId: string | null | undefined;
    if (d.document === "billet")
      compagnieId = (await this.billets.trouver(d.documentId))?.compagnieId;
    else if (d.document === "etiquette_colis") {
      compagnieId = (await this.colis.trouver(d.documentId))?.compagnieId;
    } else compagnieId = (await this.sessions.trouver(d.documentId))?.compagnieId;
    if (compagnieId !== undefined && compagnieId !== u.compagnieId) {
      throw introuvable("DOCUMENT_INCONNU", "Document introuvable");
    }
  }
}
