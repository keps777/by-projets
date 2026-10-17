import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { conflit, inconnu } from "./erreurs";
import type { MissionSuivie, Position } from "./modeles";
import { DiffusionGps, MissionsSuivies, Positions, canalLivraison, sujetLivraison } from "./ports";
import { estimerLivraison, trierLot, type EntreePosition } from "./regles";
import type { ResultatPositions } from "./suivi.service";
import { MS_PAR_MINUTE, enMs, versIsoDouala } from "./temps";

/** Message du canal d'une livraison : la forme de `colis.SchemaPositionLivreur`. */
export interface MessagePositionLivreur {
  colisId: string;
  minutesRestantes: number;
  arriveeEstimee: string;
}

/**
 * Suivi des livreurs moto : le téléphone du livreur envoie sa position pendant la mission ;
 * l'expéditeur et le destinataire voient le temps restant et l'heure d'arrivée (jamais la position
 * exacte du livreur ni le code de retrait).
 */
@Injectable()
export class SuiviLivraisonService {
  constructor(
    private readonly missions: MissionsSuivies,
    private readonly positions: Positions,
    private readonly diffusion: DiffusionGps,
    private readonly horloge: Horloge,
  ) {}

  /** Reçoit un lot de positions du livreur de la mission. */
  async enregistrerPositions(
    u: Utilisateur,
    colisId: string,
    entrees: readonly EntreePosition[],
  ): Promise<ResultatPositions> {
    const mission = await this.missions.mission(colisId);
    // Un autre livreur apprend seulement que la mission n'existe pas pour lui.
    if (!mission || mission.livreurId !== u.id) {
      throw inconnu("MISSION_INCONNUE", "Mission introuvable");
    }
    if (!mission.active) throw conflit("MISSION_TERMINEE", "Cette livraison n'est pas en cours");

    const maintenant = this.horloge.maintenant();
    const maintenantMs = maintenant.getTime();
    const sujet = sujetLivraison(colisId);
    const { retenues, rejetees } = trierLot(entrees, maintenantMs);

    let acceptees = 0;
    let doublons = 0;
    for (const e of retenues) {
      const nouvelle = await this.positions.ajouter({
        sujet,
        auteurId: u.id,
        instant: e.instant,
        latitude: e.latitude,
        longitude: e.longitude,
        precisionM: e.precisionM ?? null,
        vitesseKmh: e.vitesseKmh ?? null,
        recuA: versIsoDouala(maintenant),
      });
      if (nouvelle) acceptees += 1;
      else doublons += 1;
    }

    // Un lot ne diffuse que la position la plus récente connue (pas celles d'un rattrapage).
    if (acceptees > 0) {
      const message = await this.message(mission, maintenantMs);
      if (message) this.diffusion.publier(canalLivraison(colisId), message);
    }
    return { acceptees, doublons, rejetees, serveurA: versIsoDouala(maintenant) };
  }

  /**
   * Ouvre le canal : seuls l'expéditeur et le destinataire de la livraison en cours y accèdent.
   * Rend le dernier message connu, envoyé à la connexion.
   */
  async ouvrirFlux(u: Utilisateur, colisId: string) {
    const mission = await this.missions.mission(colisId);
    if (!mission || (mission.expediteurId !== u.id && mission.destinataireId !== u.id)) {
      throw inconnu("COLIS_INCONNU", "Colis introuvable");
    }
    if (!mission.active) throw conflit("LIVRAISON_TERMINEE", "Ce colis n'est pas en livraison");
    return { initial: await this.message(mission, this.horloge.maintenant().getTime()) };
  }

  /**
   * Temps restant et heure d'arrivée à partir de la dernière position. `minutesRestantes` est
   * relatif à `maintenantMs` (une position vieille de trois minutes retire trois minutes).
   */
  async message(
    mission: MissionSuivie,
    maintenantMs: number,
  ): Promise<MessagePositionLivreur | null> {
    const sujet = sujetLivraison(mission.colisId);
    const recentes: Position[] = await this.positions.recentes(sujet, 6);
    const derniere = recentes[recentes.length - 1];
    if (!derniere) return null;
    const vitesses = recentes.flatMap((p) => (p.vitesseKmh === null ? [] : [p.vitesseKmh]));
    const e = estimerLivraison(mission, derniere, enMs(derniere.instant), vitesses);
    return {
      colisId: mission.colisId,
      minutesRestantes: Math.max(0, Math.ceil((e.arriveeMs - maintenantMs) / MS_PAR_MINUTE)),
      arriveeEstimee: versIsoDouala(e.arriveeMs),
    };
  }
}
