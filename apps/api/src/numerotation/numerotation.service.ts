import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import type { AnomalieNumero, EntreeNumero } from "../sync/ports";
import { aammjjDouala, versIsoDouala } from "../sync/temps";
import { AppareilSansPlage, NumerosEnLigneEpuises } from "./erreurs";
import {
  PlagesAttribuees,
  RegistreNumeros,
  type AttributionPlage,
  type EntreeRegistre,
  type Titulaire,
} from "./ports";
import {
  APPAREIL_SERVEUR,
  GENRES_NUMERO,
  PLAGE_EN_LIGNE,
  analyserNumeros,
  dansLaPlage,
  porteeDe,
  type GenreNumero,
  type Plage,
} from "./regles";

/** Le compteur d'un appareil pour un jour et un genre (billets ou colis). */
export interface CompteurJour {
  genre: GenreNumero;
  plage: Plage;
  /** Numéros distincts reçus dans la plage (les billets annulés comptent : ils gardent leur numéro). */
  emis: number;
  premier: number | null;
  dernier: number | null;
  /** Prochain numéro que l'appareil doit prendre ; `null` quand la plage est épuisée. */
  prochain: number | null;
  restants: number;
  /** Numéros manquants entre le début de la plage et le plus grand numéro reçu. */
  trous: number[];
  /** Numéros reçus de cet appareil en dehors de sa plage. */
  horsPlage: number[];
}

export interface ResumeAppareil {
  appareilId: string;
  genre: "guichet" | "convoyeur";
  titulaire: Titulaire | null;
  gareId: string | null;
  jour: string;
  plage: Plage;
  billets: CompteurJour;
  colis: CompteurJour;
  /** Le numéro est dans la plage de l'appareil, sans trou (billets et colis). */
  plageSansTrou: boolean;
}

export interface ResumeGare {
  gareId: string | null;
  jour: string;
  appareils: ResumeAppareil[];
  totaux: { billets: number; colis: number };
  /** Numéros pris par le serveur dans 4001–9999 (ventes en ligne). */
  enLigne: { billets: number; colis: number };
}

export interface NumeroEnLigne {
  numero: number;
  jour: string;
  /** `false` quand la même référence avait déjà reçu ce numéro. */
  nouveau: boolean;
}

/**
 * Contrôle des numéros reçus et numérotation par le serveur.
 *
 * - `enregistrer` : chaque numéro reçu d'un appareil entre dans le registre ; un numéro déjà pris
 *   (par un autre événement, de n'importe quel appareil de la gare) est un doublon, un numéro
 *   hors de la plage de l'appareil est signalé. Une vente déjà imprimée n'est jamais refusée.
 * - `trous`, `compteur`, `resume` : ce qui manque dans une plage, le compteur du jour.
 * - `prendreEnLigne` : numéros 4001–9999 des ventes en ligne, pris dans l'ordre et sans trou.
 */
@Injectable()
export class NumerotationService {
  constructor(
    private readonly plages: PlagesAttribuees,
    private readonly registre: RegistreNumeros,
    private readonly horloge: Horloge,
  ) {}

  async enregistrer(entree: EntreeNumero): Promise<AnomalieNumero[]> {
    const attribution = await this.plages.trouver(entree.appareilId);
    const plage = entree.plage ?? attribution?.plage ?? null;
    const anomalies: AnomalieNumero[] = [];

    if (
      !Number.isInteger(entree.numeroPlage) ||
      entree.numeroPlage < 1 ||
      entree.numeroPlage > 9999
    ) {
      // Pas de numéro imprimable : rien à mettre au registre, mais l'anomalie est signalée.
      return [{ type: "numero_hors_plage", numeroPlage: entree.numeroPlage }];
    }

    const reservation = await this.registre.reserver({
      ...this.contexte(entree.appareilId, attribution),
      jour: entree.jour,
      genre: entree.genre,
      numero: entree.numeroPlage,
      evenementId: entree.evenementId,
      recuA: versIsoDouala(this.horloge.maintenant()),
    });
    if (reservation.statut === "doublon") {
      anomalies.push({
        type: "numero_en_double",
        numeroPlage: entree.numeroPlage,
        evenementIdExistant: reservation.evenementIdExistant,
      });
    }
    if (plage && !dansLaPlage(entree.numeroPlage, plage)) {
      anomalies.push({ type: "numero_hors_plage", numeroPlage: entree.numeroPlage });
    }
    return anomalies;
  }

  /** Numéros manquants entre le début de la plage et le plus grand numéro reçu, pour un appareil. */
  async trous(
    appareilId: string,
    jour: string,
    genre: GenreNumero,
    plage: Plage,
  ): Promise<number[]> {
    const attribution = await this.plages.trouver(appareilId);
    const { portee } = this.contexte(appareilId, attribution);
    const entrees = await this.registre.entrees(portee, jour, genre);
    return analyserNumeros(
      entrees.map((e) => e.numero),
      plage,
    ).trous;
  }

  /** Le compteur d'un appareil attribué pour un jour et un genre. */
  async compteur(
    attribution: AttributionPlage,
    jour: string,
    genre: GenreNumero,
  ): Promise<CompteurJour> {
    const { portee } = this.contexte(attribution.appareilId, attribution);
    const entrees = await this.registre.entrees(portee, jour, genre);
    return this.calculerCompteur(attribution, genre, entrees);
  }

  /** Plage, compteurs du jour et trous d'un appareil. @throws AppareilSansPlage */
  async resume(appareilId: string, jour: string): Promise<ResumeAppareil> {
    const attribution = await this.plages.trouver(appareilId);
    if (!attribution) throw new AppareilSansPlage(appareilId);
    return this.resumeDe(attribution, jour);
  }

  /** Les compteurs de tous les appareils d'une gare (ou d'une compagnie) pour un jour. */
  async resumeGare(
    perimetre: { gareId?: string | null; compagnieId?: string | null },
    jour: string,
  ): Promise<ResumeGare> {
    const attributions = await this.plages.lister(perimetre);
    const entrees = await this.registre.duJour(jour);
    const appareils: ResumeAppareil[] = [];
    for (const a of attributions) appareils.push(this.resumeDepuis(a, jour, entrees));
    const enLigne = { billet: 0, colis: 0 };
    for (const e of entrees) {
      const dansPerimetre =
        (perimetre.gareId === undefined || e.gareId === perimetre.gareId) &&
        (perimetre.compagnieId === undefined || e.compagnieId === perimetre.compagnieId);
      if (e.appareilId === APPAREIL_SERVEUR && dansPerimetre) enLigne[e.genre] += 1;
    }
    return {
      gareId: perimetre.gareId ?? null,
      jour,
      appareils,
      totaux: {
        billets: appareils.reduce((s, a) => s + a.billets.emis, 0),
        colis: appareils.reduce((s, a) => s + a.colis.emis, 0),
      },
      enLigne: { billets: enLigne.billet, colis: enLigne.colis },
    };
  }

  /**
   * Numéro suivant des ventes en ligne et des colis de l'app, pris par le serveur dans 4001–9999.
   *
   * `reference` (l'identifiant du billet ou du colis) rend l'appel idempotent : réessayer après une
   * erreur réseau redonne le même numéro, jamais un second. Pour qu'une vente annulée ne laisse pas
   * de trou, l'appelant doit écrire le billet dans la même transaction que ce numéro (voir README).
   * @throws NumerosEnLigneEpuises
   */
  async prendreEnLigne(demande: {
    gareId: string;
    compagnieId: string | null;
    genre: GenreNumero;
    /** Instant de la vente (le jour est celui de Douala). */
    at: Date | number | string;
    reference: string;
  }): Promise<NumeroEnLigne> {
    const jour = aammjjDouala(demande.at);
    const pris = await this.registre.prendreSuivant({
      ...this.contexte(APPAREIL_SERVEUR, {
        gareId: demande.gareId,
        compagnieId: demande.compagnieId,
      }),
      jour,
      genre: demande.genre,
      evenementId: demande.reference,
      recuA: versIsoDouala(this.horloge.maintenant()),
      plage: PLAGE_EN_LIGNE,
    });
    if (!pris) throw new NumerosEnLigneEpuises(demande.gareId, jour);
    return { numero: pris.numero, jour, nouveau: pris.nouveau };
  }

  /* ------------------------------------------------------------------ interne */

  private contexte(
    appareilId: string,
    attribution: { gareId: string | null; compagnieId: string | null } | null,
  ): Pick<EntreeRegistre, "portee" | "gareId" | "compagnieId" | "appareilId"> {
    const gareId = attribution?.gareId ?? null;
    const compagnieId = attribution?.compagnieId ?? null;
    return {
      portee: porteeDe({ appareilId, gareId, compagnieId }),
      gareId,
      compagnieId,
      appareilId,
    };
  }

  private async resumeDe(attribution: AttributionPlage, jour: string): Promise<ResumeAppareil> {
    return this.resumeDepuis(attribution, jour, await this.registre.duJour(jour));
  }

  private resumeDepuis(
    attribution: AttributionPlage,
    jour: string,
    duJour: EntreeRegistre[],
  ): ResumeAppareil {
    const { portee } = this.contexte(attribution.appareilId, attribution);
    const pour = (genre: GenreNumero) =>
      this.calculerCompteur(
        attribution,
        genre,
        duJour.filter((e) => e.portee === portee && e.genre === genre),
      );
    const [billets, colis] = GENRES_NUMERO.map(pour) as [CompteurJour, CompteurJour];
    return {
      appareilId: attribution.appareilId,
      genre: attribution.genre,
      titulaire: attribution.titulaire,
      gareId: attribution.gareId,
      jour,
      plage: { ...attribution.plage },
      billets,
      colis,
      plageSansTrou:
        billets.trous.length === 0 &&
        colis.trous.length === 0 &&
        billets.horsPlage.length === 0 &&
        colis.horsPlage.length === 0,
    };
  }

  private calculerCompteur(
    attribution: AttributionPlage,
    genre: GenreNumero,
    entrees: EntreeRegistre[],
  ): CompteurJour {
    const { plage } = attribution;
    const analyse = analyserNumeros(
      entrees.map((e) => e.numero),
      plage,
    );
    const prochain = analyse.dernier === null ? plage.debut : analyse.dernier + 1;
    return {
      genre,
      plage: { ...plage },
      emis: analyse.emis,
      premier: analyse.premier,
      dernier: analyse.dernier,
      prochain: prochain > plage.fin ? null : prochain,
      restants: plage.fin - (analyse.dernier ?? plage.debut - 1),
      trous: analyse.trous,
      horsPlage: entrees
        .filter((e) => e.appareilId === attribution.appareilId && !dansLaPlage(e.numero, plage))
        .map((e) => e.numero)
        .sort((a, b) => a - b),
    };
  }
}
