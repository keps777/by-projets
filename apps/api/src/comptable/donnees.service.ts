import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import {
  JOUR_CLOTURE_PAR_DEFAUT,
  JOUR_ENVOI_PAR_DEFAUT,
  type DonneesMois,
  type ParametresComptables,
} from "./modele";
import {
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  FacturesPayees,
  FaitsRapprochement,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
} from "./ports";
import { calculerRapprochement } from "./rapprochement";
import { dimanchesDuMois, lundiDeLaPremiereFacture } from "./regles";
import {
  debutDuJour,
  debutDuMois,
  debutDuMoisSuivant,
  enMs,
  jourDouala,
  moisDe,
  moisPrecedent,
  versIsoDouala,
} from "./temps";
import { erreurApi } from "./validation";

/** Le premier mois que le module sait lire : avant, AfriMove n'existait pas. */
export const PREMIER_MOIS = "2020-01";

export function exigerCompagnie(utilisateur: Utilisateur): string {
  if (!utilisateur.compagnieId) {
    throw erreurApi(403, "AGENCE_REQUISE", "Ce compte n'est rattaché à aucune agence");
  }
  return utilisateur.compagnieId;
}

/** Réglages par défaut d'une agence qui n'a rien réglé : pas de cabinet, pas d'envoi automatique. */
export function parametresParDefaut(compagnieId: string): ParametresComptables {
  return {
    compagnieId,
    nomAgence: "",
    emailCabinet: null,
    envoiAutomatique: false,
    jourDEnvoi: JOUR_ENVOI_PAR_DEFAUT,
    jourDeCloture: JOUR_CLOTURE_PAR_DEFAUT,
  };
}

/** « cabinet@compta.cm » devient « cabinet@… » : le domaine du cabinet ne sort pas de l'API. */
export function masquerAdresse(adresse: string | null): string {
  if (!adresse) return "";
  const arobase = adresse.indexOf("@");
  return arobase < 0 ? "" : `${adresse.slice(0, arobase)}@…`;
}

/**
 * Charge d'un seul coup tout ce qu'un mois demande aux autres modules, puis en tire le rapprochement.
 * Les ventes sont vues « à la fin du mois » : une annulation décidée après le dernier jour ne change pas
 * le mois (elle s'écrit dans le mois suivant).
 */
@Injectable()
export class ChargeurMois {
  constructor(
    private readonly ventes: VentesComptables,
    private readonly sessions: SessionsComptables,
    private readonly annulations: AnnulationsComptables,
    private readonly releves: RelevesOperateur,
    private readonly faits: FaitsRapprochement,
    private readonly facturesPayees: FacturesPayees,
    private readonly parametres: ParametresRepository,
    private readonly decisions: DecisionsRapprochement,
    private readonly horloge: Horloge,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  moisCourant(): string {
    return moisDe(this.horloge.maintenant());
  }

  async parametresDe(compagnieId: string): Promise<ParametresComptables> {
    return (await this.parametres.lire(compagnieId)) ?? parametresParDefaut(compagnieId);
  }

  async charger(compagnieId: string, mois: string): Promise<DonneesMois> {
    const du = debutDuMois(mois);
    const avant = debutDuMoisSuivant(mois);

    const brutes = await this.ventes.ventes(compagnieId, du, avant);
    const ventes = brutes.map((v) =>
      v.annuleeA !== null && enMs(v.annuleeA) >= enMs(avant) ? { ...v, annuleeA: null } : v,
    );

    // La première facture hebdomadaire peut commencer avant le mois.
    const lundi = lundiDeLaPremiereFacture(mois);
    const ventesAvant =
      lundi !== null && lundi < jourDouala(du)
        ? await this.ventes.ventes(compagnieId, debutDuJour(lundi), du)
        : [];

    const releve = await this.releves.lignes(compagnieId, du, avant);
    const connues = await this.ventes.referencesConnues(
      compagnieId,
      releve.map((l) => l.reference),
    );
    const rapprochement = await calculerRapprochement({
      compagnieId,
      releve,
      ventes,
      referencesConnues: connues,
      faits: this.faits,
    });

    return {
      compagnieId,
      mois,
      du,
      avant,
      ventes,
      ventesAvant,
      sessions: await this.sessions.sessions(compagnieId, du, avant),
      annulations: await this.annulations.decidees(compagnieId, du, avant),
      rapprochement,
      decisions: await this.decisions.lister(compagnieId, mois),
      parametres: await this.parametresDe(compagnieId),
      facturesPayees: await this.facturesPayees.payees(compagnieId, dimanchesDuMois(mois)),
      maintenant: this.maintenant(),
    };
  }
}

/** Les règles de choix du mois : le mois demandé doit exister, le mois par défaut est celui qu'on clôture. */
@Injectable()
export class ChoixDuMois {
  constructor(
    private readonly clotures: Clotures,
    private readonly horloge: Horloge,
  ) {}

  /**
   * Le mois demandé, après contrôle : ni avant 2020, ni dans le futur (404 `MOIS_INDISPONIBLE`). Sans mois,
   * le mois précédent tant qu'il n'est pas clôturé, sinon le mois en cours.
   */
  async resoudre(compagnieId: string, demande: string | undefined): Promise<string> {
    const courant = moisDe(this.horloge.maintenant());
    if (demande === undefined) {
      const precedent = moisPrecedent(courant);
      return (await this.clotures.trouver(compagnieId, precedent)) ? courant : precedent;
    }
    this.verifier(demande);
    return demande;
  }

  /** Contrôle un mois fourni par le client. */
  verifier(mois: string): void {
    const courant = moisDe(this.horloge.maintenant());
    if (mois < PREMIER_MOIS || mois > courant) {
      throw erreurApi(404, "MOIS_INDISPONIBLE", `Mois comptable indisponible : ${mois}`);
    }
  }
}
