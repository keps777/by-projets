import { Injectable } from "@nestjs/common";
import { enMs } from "../relais/temps";
import type {
  DemandeLivreur,
  EtatMission,
  InvitationLivreur,
  LivreurStocke,
  MissionLivraison,
  PartageSuivi,
} from "./modele";
import { ETATS_MISSION_OUVERTS } from "./modele";
import {
  DemandesLivreurRepository,
  DiffusionLivraison,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
  type MessageMissions,
  type MessagePosition,
  type ResultatAjoutDemandeLivreur,
  type ResultatAjoutMission,
  type Volatil,
} from "./ports";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `LivraisonModule` refuse de démarrer en production avec elles (`durable = false`).
 * Les lignes sont copiées à l'entrée et à la sortie, comme une base.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

@Injectable()
export class LivreursMemoire extends LivreursRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, LivreurStocke>();

  async ajouter(livreur: LivreurStocke) {
    if (this.lignes.has(livreur.id)) return false;
    for (const l of this.lignes.values()) {
      if (l.badge === livreur.badge || l.personneId === livreur.personneId) return false;
    }
    this.lignes.set(livreur.id, copie({ ...livreur, version: 1 }));
    return true;
  }

  async trouver(id: string) {
    const l = this.lignes.get(id);
    return l ? copie(l) : null;
  }

  async parPersonne(personneId: string) {
    for (const l of this.lignes.values()) if (l.personneId === personneId) return copie(l);
    return null;
  }

  async lister(filtre: { actif?: boolean; disponible?: boolean } = {}) {
    return [...this.lignes.values()]
      .filter((l) => filtre.actif === undefined || l.actif === filtre.actif)
      .filter((l) => filtre.disponible === undefined || l.disponible === filtre.disponible)
      .sort((a, b) => a.badge.localeCompare(b.badge))
      .map(copie);
  }

  async remplacer(livreur: LivreurStocke, versionAttendue: number) {
    const actuel = this.lignes.get(livreur.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    this.lignes.set(
      livreur.id,
      copie({
        ...livreur,
        badge: actuel.badge,
        numero: actuel.numero,
        personneId: actuel.personneId,
        version: versionAttendue + 1,
      }),
    );
    return true;
  }
}

@Injectable()
export class DemandesLivreurMemoire extends DemandesLivreurRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, DemandeLivreur>();

  async ajouter(demande: DemandeLivreur): Promise<ResultatAjoutDemandeLivreur> {
    if (this.lignes.has(demande.dossier)) return "dossier_pris";
    for (const d of this.lignes.values()) {
      if (d.personneId === demande.personneId && d.etat === "recue") return "demande_en_cours";
    }
    this.lignes.set(demande.dossier, copie({ ...demande, version: 1 }));
    return "ajoutee";
  }

  async trouver(dossier: string) {
    const d = this.lignes.get(dossier);
    return d ? copie(d) : null;
  }

  async derniereDe(personneId: string) {
    const siennes = [...this.lignes.values()]
      .filter((d) => d.personneId === personneId)
      .sort((a, b) => enMs(b.deposeeA) - enMs(a.deposeeA) || b.dossier.localeCompare(a.dossier));
    return siennes[0] ? copie(siennes[0]) : null;
  }

  async remplacer(demande: DemandeLivreur, versionAttendue: number) {
    const actuelle = this.lignes.get(demande.dossier);
    if (!actuelle || actuelle.version !== versionAttendue) return false;
    this.lignes.set(demande.dossier, copie({ ...demande, version: versionAttendue + 1 }));
    return true;
  }
}

@Injectable()
export class MissionsMemoire extends MissionsRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, MissionLivraison>();
  /** Test : nombre d'écritures refusées parce que la mission avait changé (concurrence). */
  conflits = 0;

  async ajouter(mission: MissionLivraison): Promise<ResultatAjoutMission> {
    for (const m of this.lignes.values()) {
      if (m.colisId === mission.colisId && ETATS_MISSION_OUVERTS.includes(m.etat)) {
        return "colis_deja_servi";
      }
    }
    this.lignes.set(mission.id, copie({ ...mission, version: 1 }));
    return "ajoutee";
  }

  async trouver(id: string) {
    const m = this.lignes.get(id);
    return m ? copie(m) : null;
  }

  async derniereDuColis(colisId: string) {
    const siennes = [...this.lignes.values()]
      .filter((m) => m.colisId === colisId)
      .sort((a, b) => enMs(b.creeA) - enMs(a.creeA));
    return siennes[0] ? copie(siennes[0]) : null;
  }

  async parEtats(etats: readonly EtatMission[]) {
    return [...this.lignes.values()]
      .filter((m) => etats.includes(m.etat))
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA))
      .map(copie);
  }

  async deLivreur(livreurId: string, etats: readonly EtatMission[]) {
    return [...this.lignes.values()]
      .filter((m) => m.livreurId === livreurId && etats.includes(m.etat))
      .map(copie);
  }

  async terminees(livreurId: string, depuis: string) {
    return [...this.lignes.values()]
      .filter((m) => m.livreurId === livreurId && (m.etat === "livree" || m.etat === "repli"))
      .filter((m) => enMs(m.livreeA ?? m.repliA ?? m.creeA) >= enMs(depuis))
      .map(copie);
  }

  async remplacer(mission: MissionLivraison, versionAttendue: number) {
    const actuelle = this.lignes.get(mission.id);
    if (!actuelle || actuelle.version !== versionAttendue) {
      this.conflits += 1;
      return false;
    }
    this.lignes.set(
      mission.id,
      copie({
        ...mission,
        colisId: actuelle.colisId,
        colisNumero: actuelle.colisNumero,
        creeA: actuelle.creeA,
        version: versionAttendue + 1,
      }),
    );
    return true;
  }
}

@Injectable()
export class PartagesSuiviMemoire extends PartagesSuivi implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, PartageSuivi>();

  async ajouter(partage: PartageSuivi) {
    this.lignes.set(partage.jetonHache, copie(partage));
  }

  async trouver(jetonHache: string) {
    const p = this.lignes.get(jetonHache);
    return p ? copie(p) : null;
  }

  async compter(colisId: string) {
    return [...this.lignes.values()].filter((p) => p.colisId === colisId).length;
  }
}

@Injectable()
export class InvitationsMemoire extends Invitations implements Volatil {
  readonly durable = false as const;
  readonly lignes: InvitationLivreur[] = [];

  async ajouter(invitation: InvitationLivreur) {
    this.lignes.push(copie(invitation));
  }

  async compterDepuis(livreurId: string, depuis: string) {
    return this.lignes.filter((i) => i.livreurId === livreurId && enMs(i.at) >= enMs(depuis))
      .length;
  }
}

@Injectable()
export class DiffusionLivraisonMemoire extends DiffusionLivraison implements Volatil {
  readonly durable = false as const;
  private readonly ecouteursMissions = new Map<string, Set<(m: MessageMissions) => void>>();
  private readonly ecouteursPositions = new Map<string, Set<(m: MessagePosition) => void>>();
  readonly missionsPubliees: { livreurId: string; message: MessageMissions }[] = [];
  readonly positionsPubliees: MessagePosition[] = [];

  publierMission(livreurId: string, message: MessageMissions) {
    this.missionsPubliees.push({ livreurId, message: copie(message) });
    for (const e of this.ecouteursMissions.get(livreurId) ?? []) e(copie(message));
  }

  souscrireMissions(livreurId: string, ecouteur: (message: MessageMissions) => void) {
    const ensemble = this.ecouteursMissions.get(livreurId) ?? new Set();
    ensemble.add(ecouteur);
    this.ecouteursMissions.set(livreurId, ensemble);
    return () => {
      ensemble.delete(ecouteur);
    };
  }

  publierPosition(message: MessagePosition) {
    this.positionsPubliees.push({ ...message });
    for (const e of this.ecouteursPositions.get(message.colisId) ?? []) e({ ...message });
  }

  souscrirePosition(colisId: string, ecouteur: (message: MessagePosition) => void) {
    const ensemble = this.ecouteursPositions.get(colisId) ?? new Set();
    ensemble.add(ecouteur);
    this.ecouteursPositions.set(colisId, ensemble);
    return () => {
      ensemble.delete(ecouteur);
    };
  }
}
