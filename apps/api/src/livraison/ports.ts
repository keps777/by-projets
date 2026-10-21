import type { ColisStocke } from "../colis/modele";
import { ColisRepository } from "../colis/ports";
import type {
  DemandeLivreur,
  EtatMission,
  InvitationLivreur,
  LivreurStocke,
  MissionLivraison,
  PartageSuivi,
} from "./modele";

/**
 * Ports du module de livraison moto. La logique ne parle qu'à ces classes abstraites ; `memoire.ts`
 * en donne des versions en mémoire (tests, développement). Les tables PostgreSQL attendues par les
 * adaptateurs réels sont décrites dans le README ; l'intégration (Prisma, `AppModule`) est faite par
 * le coordinateur.
 *
 * Le portefeuille, les versements, l'attribution de rôles et les lieux sont ceux de `relais/ports.ts`.
 */

export interface Volatil {
  readonly durable: false;
}

export abstract class LivreursRepository {
  /** `false` si l'identifiant, le badge ou le compte existe déjà. */
  abstract ajouter(livreur: LivreurStocke): Promise<boolean>;
  abstract trouver(id: string): Promise<LivreurStocke | null>;
  abstract parPersonne(personneId: string): Promise<LivreurStocke | null>;
  abstract lister(filtre?: { actif?: boolean; disponible?: boolean }): Promise<LivreurStocke[]>;
  /** Remplace le livreur si sa version est encore `versionAttendue` (comparaison et écriture atomiques). */
  abstract remplacer(livreur: LivreurStocke, versionAttendue: number): Promise<boolean>;
}

export type ResultatAjoutDemandeLivreur = "ajoutee" | "dossier_pris" | "demande_en_cours";

export abstract class DemandesLivreurRepository {
  /**
   * Ajoute la demande (version 1). Refuse une seconde demande ouverte (`recue`) pour la même personne
   * et un dossier déjà pris : deux contraintes d'unicité.
   */
  abstract ajouter(demande: DemandeLivreur): Promise<ResultatAjoutDemandeLivreur>;
  abstract trouver(dossier: string): Promise<DemandeLivreur | null>;
  abstract derniereDe(personneId: string): Promise<DemandeLivreur | null>;
  abstract remplacer(demande: DemandeLivreur, versionAttendue: number): Promise<boolean>;
}

export type ResultatAjoutMission = "ajoutee" | "colis_deja_servi";

export abstract class MissionsRepository {
  /**
   * Ajoute la mission (version 1). Un colis n'a qu'une mission ouverte à la fois (`en_attente`,
   * `proposee`, `acceptee` ou `sans_livreur`) : contrainte d'unicité partielle.
   */
  abstract ajouter(mission: MissionLivraison): Promise<ResultatAjoutMission>;
  abstract trouver(id: string): Promise<MissionLivraison | null>;
  /** La mission la plus récente du colis, quel que soit son état. */
  abstract derniereDuColis(colisId: string): Promise<MissionLivraison | null>;
  abstract parEtats(etats: readonly EtatMission[]): Promise<MissionLivraison[]>;
  /** Les missions d'un livreur dans ces états. */
  abstract deLivreur(livreurId: string, etats: readonly EtatMission[]): Promise<MissionLivraison[]>;
  /** Livraisons terminées (livrées ou déposées en relais) de ce livreur depuis cet instant. */
  abstract terminees(livreurId: string, depuis: string): Promise<MissionLivraison[]>;
  /**
   * Remplace la mission si sa version est encore `versionAttendue` (comparaison et écriture atomiques :
   * `UPDATE … WHERE id AND version`). Renvoie `false` si quelqu'un l'a modifiée entre-temps.
   */
  abstract remplacer(mission: MissionLivraison, versionAttendue: number): Promise<boolean>;
}

export abstract class PartagesSuivi {
  abstract ajouter(partage: PartageSuivi): Promise<void>;
  abstract trouver(jetonHache: string): Promise<PartageSuivi | null>;
  abstract compter(colisId: string): Promise<number>;
}

export abstract class Invitations {
  abstract ajouter(invitation: InvitationLivreur): Promise<void>;
  abstract compterDepuis(livreurId: string, depuis: string): Promise<number>;
}

/**
 * Les colis à livrer, lus dans le module colis : ceux qui attendent un livreur (mode « moto », état
 * « disponible »). Cette version filtre en mémoire les colis disponibles ; un adaptateur PostgreSQL
 * peut faire `WHERE mode = 'moto' AND etat = 'disponible'`.
 */
export abstract class ColisALivrer {
  abstract disponibles(): Promise<ColisStocke[]>;
}

export class ColisALivrerParColis extends ColisALivrer {
  constructor(private readonly colis: ColisRepository) {
    super();
  }

  async disponibles(): Promise<ColisStocke[]> {
    const colis = await this.colis.lister({ etats: ["disponible"] });
    return colis.filter((c) => c.mode === "moto");
  }
}

/* ------------------------------------------------------------------ temps réel */

export type MessageMissions =
  | { type: "proposee"; mission: Record<string, unknown> }
  | { type: "expiree"; missionId: string };

export interface MessagePosition {
  colisId: string;
  minutesRestantes: number;
  arriveeEstimee: string;
}

/**
 * Diffusion en direct des missions proposées à un livreur (`/livreurs/moi/missions/direct`) et de la
 * position du livreur vue par le client (`/colis/:id/livraison/direct`). La passerelle WebSocket
 * s'y abonne : elle reste à écrire, comme celle du suivi des colis.
 */
export abstract class DiffusionLivraison {
  abstract publierMission(livreurId: string, message: MessageMissions): void;
  /** Renvoie la fonction de désabonnement. */
  abstract souscrireMissions(
    livreurId: string,
    ecouteur: (message: MessageMissions) => void,
  ): () => void;
  abstract publierPosition(message: MessagePosition): void;
  abstract souscrirePosition(
    colisId: string,
    ecouteur: (message: MessagePosition) => void,
  ): () => void;
}
