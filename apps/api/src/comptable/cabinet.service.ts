import { Inject, Injectable, Logger } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge } from "../socle/horloge";
import { ChargeurMois } from "./donnees.service";
import { genererFichier } from "./fichiers";
import type { Cloture, FichierGenere, ParametresComptables } from "./modele";
import { Clotures, EnvoisCabinet, MessagerieCabinet, ParametresRepository } from "./ports";
import { construireTousLesTableaux } from "./tableaux";
import { jourDouala, libelleMois, moisDe, moisPrecedent, versIsoDouala } from "./temps";

/** Si l'API était arrêtée le jour dit, l'envoi automatique se rattrape pendant ces jours. */
export const FENETRE_RATTRAPAGE_JOURS = 3;

function corpsDuMessage(nomAgence: string, mois: string, definitif: boolean): string {
  const agence = nomAgence ? ` de ${nomAgence}` : "";
  return [
    "Bonjour,",
    "",
    `Veuillez trouver en pièces jointes les exports comptables${agence} pour ${libelleMois(mois)} : journal des ventes, journal de caisse, annulations et remboursements, écritures SYSCOHADA et factures AfriMove.`,
    definitif
      ? "Le mois est clôturé : ces fichiers sont définitifs."
      : "Le mois n'est pas encore clôturé : ces fichiers sont provisoires, les fichiers définitifs suivront à la clôture.",
    "Chaque fichier porte l'empreinte AfriMove, qui permet de détecter toute retouche.",
    "",
    "Cordialement,",
    "AfriMove",
  ].join("\n");
}

/**
 * Envois au cabinet comptable : à la clôture (« tout envoyer ») et automatiquement le 2 du mois pour le mois
 * écoulé. Chaque envoi a une clé d'idempotence (un message par clé, même rejoué) ; un envoi qui échoue reste
 * « demandé » et la tâche de fond le reprend.
 */
@Injectable()
export class CabinetService {
  private readonly logger = new Logger("Cabinet");
  private readonly cle: Buffer;

  constructor(
    private readonly messagerie: MessagerieCabinet,
    private readonly envois: EnvoisCabinet,
    private readonly clotures: Clotures,
    private readonly parametres: ParametresRepository,
    private readonly chargeur: ChargeurMois,
    private readonly horloge: Horloge,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.cle = config.cleAudit;
  }

  /** Envoie les cinq fichiers figés d'un mois clôturé. Vrai si le message est parti. */
  async envoyerCloture(cloture: Cloture): Promise<boolean> {
    if (!cloture.destinataire) return false;
    const parametres = await this.chargeur.parametresDe(cloture.compagnieId);
    return this.envoyer({
      cle: `cloture:${cloture.compagnieId}:${cloture.mois}`,
      nature: "cloture",
      compagnieId: cloture.compagnieId,
      mois: cloture.mois,
      destinataire: cloture.destinataire,
      fichiers: cloture.fichiers,
      definitif: true,
      nomAgence: parametres.nomAgence,
    });
  }

  private async envoyer(e: {
    cle: string;
    nature: "cloture" | "automatique";
    compagnieId: string;
    mois: string;
    destinataire: string;
    fichiers: readonly FichierGenere[];
    definitif: boolean;
    nomAgence: string;
  }): Promise<boolean> {
    let recuA: string | null;
    try {
      ({ recuA } = await this.messagerie.envoyer({
        cle: e.cle,
        destinataire: e.destinataire,
        objet: `AfriMove · exports comptables · ${libelleMois(e.mois)}${e.definitif ? "" : " (provisoire)"}`,
        corps: corpsDuMessage(e.nomAgence, e.mois, e.definitif),
        pieces: e.fichiers.map((f) => ({
          nom: f.nomFichier,
          typeMime: f.typeMime,
          contenu: f.contenu,
        })),
      }));
    } catch (erreur) {
      this.logger.warn(`Envoi ${e.cle} à reprendre (${(erreur as Error).name})`);
      return false;
    }
    await this.envois.enregistrer({
      cle: e.cle,
      compagnieId: e.compagnieId,
      mois: e.mois,
      nature: e.nature,
      definitif: e.definitif,
      destinataire: e.destinataire,
      envoyeA: versIsoDouala(this.horloge.maintenant()),
      recuA,
    });
    if (recuA) {
      await this.envois.marquerRecu(e.cle, recuA);
      if (e.nature === "cloture") await this.clotures.marquerRecu(e.compagnieId, e.mois, recuA);
    }
    return true;
  }

  /** Reprend les envois de clôture demandés mais pas confirmés. */
  async reprendreClotures(limite = 20): Promise<number> {
    let partis = 0;
    for (const cloture of await this.clotures.envoisEnAttente(limite)) {
      if (await this.envoyerCloture(cloture)) partis++;
    }
    return partis;
  }

  /**
   * L'envoi automatique du mois écoulé : le jour d'envoi réglé (le 2) et les jours suivants de la fenêtre, une
   * seule fois par mois et par agence. Un mois déjà clôturé part avec ses fichiers définitifs ; sinon les
   * fichiers sont générés à l'instant et annoncés provisoires.
   */
  async envoyerAutomatiques(): Promise<number> {
    const maintenant = this.horloge.maintenant();
    const jour = Number(jourDouala(maintenant).slice(8, 10));
    const mois = moisPrecedent(moisDe(maintenant));
    let partis = 0;
    for (const p of await this.parametres.toutes()) {
      if (!this.estLeJour(p, jour)) continue;
      if (await this.envoyerAutomatique(p, mois)) partis++;
    }
    return partis;
  }

  private estLeJour(p: ParametresComptables, jour: number): boolean {
    return (
      p.envoiAutomatique &&
      p.emailCabinet !== null &&
      jour >= p.jourDEnvoi &&
      jour < p.jourDEnvoi + FENETRE_RATTRAPAGE_JOURS
    );
  }

  private async envoyerAutomatique(p: ParametresComptables, mois: string): Promise<boolean> {
    if (!p.emailCabinet) return false;
    const cle = `auto:${p.compagnieId}:${mois}`;
    if (await this.envois.trouver(cle)) return false;
    const cloture = await this.clotures.trouver(p.compagnieId, mois);
    // La clôture a déjà tout envoyé : rien à ajouter.
    if (cloture?.envoiDemande) return false;
    let fichiers: readonly FichierGenere[];
    if (cloture) {
      fichiers = cloture.fichiers;
    } else {
      const d = await this.chargeur.charger(p.compagnieId, mois);
      fichiers = construireTousLesTableaux(d).map((tableau) =>
        genererFichier({
          tableau,
          compagnieId: p.compagnieId,
          mois,
          genereA: d.maintenant,
          cle: this.cle,
        }),
      );
    }
    return this.envoyer({
      cle,
      nature: "automatique",
      compagnieId: p.compagnieId,
      mois,
      destinataire: p.emailCabinet,
      fichiers,
      definitif: cloture !== null,
      nomAgence: p.nomAgence,
    });
  }
}
