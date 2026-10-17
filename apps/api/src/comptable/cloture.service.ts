import { HttpException, Inject, Injectable } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { AuditService, type EntreeAudit } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { CabinetService } from "./cabinet.service";
import { ChargeurMois, ChoixDuMois, exigerCompagnie } from "./donnees.service";
import { figer, genererFichier } from "./fichiers";
import { IDS_EXPORT, type Cloture, type ExportFige } from "./modele";
import { Clotures } from "./ports";
import { Exclusion } from "./verrouillage.service";
import { construireTousLesTableaux, descriptionExport, NOM_EXPORT } from "./tableaux";
import { libelleMois } from "./temps";
import { erreurApi, lireCloture, lireSignature, type CommandeCloture } from "./validation";
import {
  apercuDuJournal,
  encaisseOuvert,
  figerLignes,
  lignesOuvertes,
  resumeRapprochement,
  vueClotureFermee,
  type ClotureVue,
} from "./vues";

export const ACTION_CLOTURER = "comptable.cloturer";

/** `MoisCloture` des contrats patron. */
export interface MoisClotureVue {
  journalId: string;
  signeA: string;
  signePar: string;
  cloture: ClotureVue;
}

/**
 * Clôture d'un mois : signée par le PIN, irréversible. Elle exige que toutes les lignes du rapprochement
 * soient traitées, fige les cinq exports (octets et tableaux) avec leur empreinte, verrouille le mois, puis,
 * si le patron l'a demandé, envoie tout au cabinet. Un mois clôturé refuse toute écriture.
 */
@Injectable()
export class ClotureService {
  private readonly exclusion = new Exclusion();
  private readonly cle: Buffer;

  constructor(
    private readonly chargeur: ChargeurMois,
    private readonly choix: ChoixDuMois,
    private readonly clotures: Clotures,
    private readonly cabinet: CabinetService,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly personnes: PersonnesRepository,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.cle = config.cleAudit;
  }

  async cloturer(utilisateur: Utilisateur, corps: unknown): Promise<MoisClotureVue> {
    const compagnieId = exigerCompagnie(utilisateur);
    const signature = lireSignature(corps);
    const commande = lireCloture(corps, signature);
    this.choix.verifier(commande.mois);
    try {
      await this.signature.verifier(utilisateur, signature);
    } catch (e) {
      await this.tracerRefus(utilisateur, commande, e);
      throw e;
    }
    // Un double clic ou deux onglets : la seconde demande attend la première puis voit le mois clos.
    return this.exclusion.executer(`${compagnieId}:${commande.mois}`, async () => {
      try {
        return await this.cloturerSigne(utilisateur, compagnieId, commande);
      } catch (e) {
        if (e instanceof HttpException) await this.tracerRefus(utilisateur, commande, e);
        throw e;
      }
    });
  }

  private async cloturerSigne(
    utilisateur: Utilisateur,
    compagnieId: string,
    commande: CommandeCloture,
  ): Promise<MoisClotureVue> {
    const { mois } = commande;
    if (mois >= this.chargeur.moisCourant()) {
      throw erreurApi(
        409,
        "MOIS_EN_COURS",
        `${libelleMois(mois)} n'est pas terminé : on ne clôture qu'un mois écoulé`,
      );
    }
    if (await this.clotures.trouver(compagnieId, mois)) {
      throw erreurApi(409, "MOIS_DEJA_CLOTURE", `${libelleMois(mois)} est déjà clôturé`);
    }

    const d = await this.chargeur.charger(compagnieId, mois);
    const lignes = figerLignes(d.rapprochement.sansCorrespondance, d.decisions);
    const ouvertes = lignesOuvertes(lignes);
    if (ouvertes > 0) {
      throw erreurApi(
        409,
        "RAPPROCHEMENT_OUVERT",
        `Rien n'est clôturé tant qu'une ligne du rapprochement reste ouverte (${ouvertes} à traiter)`,
      );
    }
    if (commande.envoyerAuCabinet && !d.parametres.emailCabinet) {
      throw erreurApi(
        422,
        "CABINET_NON_RENSEIGNE",
        "Aucune adresse de cabinet n'est renseignée : impossible d'envoyer les fichiers",
      );
    }

    // Les cinq exports sont générés à l'instant de la clôture et figés avec leur tableau.
    const fichiers = construireTousLesTableaux(d).map((tableau) =>
      figer(
        genererFichier({
          tableau,
          compagnieId,
          mois,
          genereA: d.maintenant,
          cle: this.cle,
        }),
        tableau,
      ),
    );
    const exports: ExportFige[] = IDS_EXPORT.map((id) => {
      const fichier = fichiers.find((f) => f.id === id)!;
      const { description, statut, lignes: n } = descriptionExport(id, d);
      return {
        id,
        nom: NOM_EXPORT[id],
        description,
        lignes: n,
        statut,
        format: fichier.format,
        tailleOctets: fichier.contenu.length,
        pages: fichier.pages,
      };
    });

    const parNom = (await this.personnes.trouverParId(utilisateur.id))?.nom ?? utilisateur.id;
    const journal = await this.audit.enregistrer({
      ...this.entreeAudit(utilisateur, commande, "succes"),
      details: {
        ...this.detailsAudit(commande),
        encaisse: encaisseOuvert(d, lignes).total,
        lignesRapprochement: lignes.length,
        empreintes: Object.fromEntries(fichiers.map((f) => [f.id, f.empreinte])),
      },
    });

    const cloture: Cloture = {
      compagnieId,
      mois,
      clotureA: d.maintenant,
      parId: utilisateur.id,
      parNom,
      journalId: journal.id,
      encaisse: encaisseOuvert(d, lignes),
      rapprochement: resumeRapprochement(d.rapprochement),
      lignes,
      exports,
      apercuJournal: apercuDuJournal(d),
      destinataire: d.parametres.emailCabinet,
      envoiDemande: commande.envoyerAuCabinet,
      envoiRecuA: null,
      fichiers,
    };
    if (!(await this.clotures.verrouiller(cloture))) {
      throw erreurApi(409, "MOIS_DEJA_CLOTURE", `${libelleMois(mois)} est déjà clôturé`);
    }

    if (commande.envoyerAuCabinet) await this.cabinet.envoyerCloture(cloture);
    const finale = (await this.clotures.trouver(compagnieId, mois)) ?? cloture;
    return {
      journalId: journal.id,
      signeA: d.maintenant,
      signePar: utilisateur.id,
      cloture: vueClotureFermee(finale),
    };
  }

  private entreeAudit(
    utilisateur: Utilisateur,
    commande: CommandeCloture,
    resultat: EntreeAudit["resultat"],
  ): Pick<EntreeAudit, "acteur" | "action" | "resultat" | "cible"> {
    return {
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: ACTION_CLOTURER,
      resultat,
      cible: { type: "mois", id: commande.mois },
    };
  }

  /** Le PIN n'y figure jamais : seulement la façon de signer et l'heure déclarée par l'appareil. */
  private detailsAudit(commande: CommandeCloture): Record<string, unknown> {
    return {
      mois: commande.mois,
      envoyerAuCabinet: commande.envoyerAuCabinet,
      signature: commande.signature.methode,
      signeAAppareil: commande.signature.signeA,
    };
  }

  private async tracerRefus(
    utilisateur: Utilisateur,
    commande: CommandeCloture,
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
