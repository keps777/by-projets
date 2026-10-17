import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { versIsoDouala } from "../sync/temps";
import { PlageChevauchante, PlageInvalide } from "./erreurs";
import { PlagesAttribuees, type AttributionPlage, type Titulaire } from "./ports";
import { FIN_PLAGES_APPAREILS, plageDuPlan, plageValide, type Plage } from "./regles";

export interface DemandeAttribution {
  appareilId: string;
  genre: "guichet" | "convoyeur";
  /** Rang du guichet (1 à 3) ou du convoyeur dans sa gare. */
  rang?: number | null;
  /** Nombre de convoyeurs qui se partagent 3001–3999 (genre convoyeur). */
  nbConvoyeurs?: number | null;
  /** Plage explicite (renfort, plage épuisée) ; sinon celle du plan de numérotation. */
  plage?: Plage | null;
  gareId: string | null;
  compagnieId: string | null;
  titulaire?: Titulaire | null;
}

/**
 * Attribution des plages de numéros aux guichets et aux convoyeurs.
 *
 * Deux appareils d'une même gare ne reçoivent jamais des numéros qui se recouvrent, et aucun
 * appareil ne reçoit un numéro du serveur (4001–9999) : c'est la première moitié de « un numéro ne
 * peut jamais être attribué deux fois » (la seconde est le registre, voir `NumerotationService`).
 */
@Injectable()
export class PlagesService {
  constructor(
    private readonly plages: PlagesAttribuees,
    private readonly horloge: Horloge,
  ) {}

  /**
   * Pose la plage d'un appareil. Rejouer la même demande rend la même attribution ; une demande
   * différente pour le même appareil remplace la plage (téléphone de secours, plage épuisée).
   * @throws PlageInvalide, PlageChevauchante
   */
  async attribuer(
    demande: DemandeAttribution,
    par: string | null = null,
  ): Promise<AttributionPlage> {
    if (!demande.appareilId.trim()) throw new PlageInvalide("Appareil non précisé");
    const rang = demande.rang ?? null;
    const nbConvoyeurs = demande.genre === "convoyeur" ? (demande.nbConvoyeurs ?? null) : null;
    const plage = this.calculerPlage(demande, rang, nbConvoyeurs);

    const maintenant = versIsoDouala(this.horloge.maintenant());
    const resultat = await this.plages.attribuer({
      appareilId: demande.appareilId,
      genre: demande.genre,
      rang,
      nbConvoyeurs,
      plage,
      gareId: demande.gareId,
      compagnieId: demande.compagnieId,
      titulaire: demande.titulaire ?? null,
      attribueeA: maintenant,
      attribueePar: par,
      libereeA: null,
    });
    if (!resultat.ok) throw new PlageChevauchante(plage, resultat.enConflitAvec);
    return resultat.attribution;
  }

  /** L'appareil est remplacé : sa plage redevient disponible (les numéros déjà émis restent pris). */
  async liberer(appareilId: string): Promise<AttributionPlage | null> {
    return this.plages.liberer(appareilId, versIsoDouala(this.horloge.maintenant()));
  }

  de(appareilId: string): Promise<AttributionPlage | null> {
    return this.plages.trouver(appareilId);
  }

  lister(filtre: { gareId?: string | null; compagnieId?: string | null } = {}) {
    return this.plages.lister(filtre);
  }

  private calculerPlage(
    demande: DemandeAttribution,
    rang: number | null,
    nbConvoyeurs: number | null,
  ): Plage {
    let plage: Plage;
    if (demande.plage) {
      plage = { debut: demande.plage.debut, fin: demande.plage.fin };
    } else {
      if (rang === null) throw new PlageInvalide("Rang ou plage explicite requis");
      try {
        plage = plageDuPlan(demande.genre, rang, nbConvoyeurs);
      } catch (e) {
        throw new PlageInvalide(e instanceof Error ? e.message : "Plage hors plan de numérotation");
      }
    }
    if (!plageValide(plage)) {
      throw new PlageInvalide(`Plage invalide : ${plage.debut}–${plage.fin} (1 à 9999)`);
    }
    if (plage.fin > FIN_PLAGES_APPAREILS) {
      throw new PlageInvalide(
        `Les numéros à partir de ${FIN_PLAGES_APPAREILS + 1} sont réservés au serveur (ventes en ligne)`,
      );
    }
    return plage;
  }
}
