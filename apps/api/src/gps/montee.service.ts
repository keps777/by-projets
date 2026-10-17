import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { distanceM } from "./geo";
import { inconnu } from "./erreurs";
import type { PointArret, TrajetBus } from "./modeles";
import { EtatsSuivi, OffresDeMontee, ReseauTransport } from "./ports";
import { REGLES_GPS, passageAArret } from "./regles";
import { MS_PAR_MINUTE, versIsoDouala } from "./temps";

export interface DemandeMontee {
  arretId?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Monter en route : les bus qui vont passer à l'arrêt du voyageur, avec l'heure de passage estimée
 * d'après leur position. Les places libres et le prix au prorata viennent de la billetterie
 * (`OffresDeMontee`) ; le bus dont les places sont toutes prises n'est pas proposé.
 */
@Injectable()
export class MonteeService {
  constructor(
    private readonly reseau: ReseauTransport,
    private readonly etats: EtatsSuivi,
    private readonly offres: OffresDeMontee,
    private readonly horloge: Horloge,
  ) {}

  async offresMontee(demande: DemandeMontee) {
    const maintenantMs = this.horloge.maintenant().getTime();
    const gps = demande.arretId === undefined;
    const arret = await this.arretDemande(demande);

    const candidats = await this.reseau.trajetsPres(arret, REGLES_GPS.rayonCorrespondanceArretM);
    const bus = [];
    for (const t of candidats) {
      const rang = arretDu(t, arret);
      const arretDuBus = t.arrets[rang];
      // On ne monte pas à un arrêt où le bus ne prend personne. La destination n'est jamais une
      // montée : `passageAArret` ne la connaît pas (c'est l'arrivée, pas une étape).
      if (!arretDuBus || !arretDuBus.montee) continue;
      const passage = passageAArret(t, await this.etats.lire(t.departId), rang, maintenantMs);
      if (!passage) continue;
      const dans = Math.ceil((passage.passeAMs - maintenantMs) / MS_PAR_MINUTE);
      if (dans > REGLES_GPS.fenetreMonteeMinutes) continue;
      const offre = await this.offres.offre(t.departId, arretDuBus.id);
      if (!offre || offre.placesLibres <= 0) continue;
      bus.push({
        passeAMs: passage.passeAMs,
        vue: {
          departId: t.departId,
          compagnie: { id: t.compagnie.id, nom: t.compagnie.nom },
          classe: t.classe,
          passeA: versIsoDouala(passage.passeAMs),
          passeDansMinutes: Math.max(0, dans),
          placesLibres: offre.placesLibres,
          ...(t.partiA ? { partiA: t.partiA } : {}),
          arriveeDestination: versIsoDouala(passage.arriveeDestinationMs),
          prix: offre.prix,
          prorata: offre.prorata,
        },
      });
    }
    bus.sort((a, b) => a.passeAMs - b.passeAMs);

    return {
      maintenant: versIsoDouala(maintenantMs),
      arret: { id: arret.id, nom: arret.nom, gps },
      ligne: {
        libelle: arret.ligne.libelle,
        sens: arret.ligne.sens,
        arrets: [...arret.ligne.arrets],
        arretCourant: arret.nom,
        pointDeMontee: arret.pointDeMontee,
      },
      bus: bus.map((b) => b.vue),
    };
  }

  private async arretDemande(demande: DemandeMontee): Promise<PointArret> {
    if (demande.arretId !== undefined) {
      const a = await this.reseau.arret(demande.arretId);
      if (!a) throw inconnu("ARRET_INCONNU", "Arrêt introuvable");
      return a;
    }
    const a = await this.reseau.arretLePlusProche(
      demande.latitude as number,
      demande.longitude as number,
      REGLES_GPS.rayonRechercheArretM,
    );
    if (!a) throw inconnu("ARRET_INCONNU", "Aucun arrêt près de votre position");
    return a;
  }
}

/** Rang, dans la ligne du bus, de l'arrêt le plus proche du point demandé (-1 si trop loin). */
function arretDu(t: TrajetBus, point: PointArret): number {
  let meilleur = -1;
  let distance: number = REGLES_GPS.rayonCorrespondanceArretM;
  t.arrets.forEach((a, i) => {
    const d = distanceM(a, point);
    if (d <= distance) {
      meilleur = i;
      distance = d;
    }
  });
  return meilleur;
}
