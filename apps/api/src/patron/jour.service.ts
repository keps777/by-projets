import { Injectable } from "@nestjs/common";
import {
  estUneVente,
  ventesDuJour,
  analyserRemplissage,
  type AnalyseRemplissage,
} from "../rapport/calcul";
import type { BilletVendu, CaisseDuJour, ColisEnregistre, DepartDuJour } from "../rapport/modele";
import { ActiviteColis, CaissesDuJour, DepartsDuJour, VentesBillets } from "../rapport/ports";
import { variationPct } from "../rapport/regles";
import { decalerJour, estDansLeJour, MS_PAR_JOUR } from "../rapport/temps";
import { jourDeSemaine, type VenteDatee } from "./calculs";

/** Les faits d'un jour de Douala pour une compagnie : ce que le rapport du soir additionne, vu en direct. */
export interface FaitsDuJour {
  jour: string;
  /** Billets vendus (ni annulés, ni seulement réservés, ni remplaçants d'un report). */
  billets: BilletVendu[];
  colis: ColisEnregistre[];
  /** Recette = billets + colis, en FCFA entiers. */
  recette: number;
  litiges: number;
  caisses: CaisseDuJour[];
  departs: DepartDuJour[];
  remplissage: AnalyseRemplissage;
  /** La recette du même jour de la semaine d'avant, jusqu'à la même heure : la base de la variation. */
  recetteReference: number;
  variationPct: number;
  /** « mardi dernier » */
  comparaison: string;
}

const somme = (valeurs: readonly number[]): number => valeurs.reduce((a, b) => a + b, 0);

/** Les ventes (billets et colis) d'un jour, datées : la matière des ventes par heure. */
export function ventesDatees(
  billets: readonly BilletVendu[],
  colis: readonly ColisEnregistre[],
): VenteDatee[] {
  return [
    ...billets.map((b) => ({ at: b.venduA, montant: b.montant })),
    ...colis.map((c) => ({ at: c.creeA, montant: c.montant })),
  ];
}

/**
 * Lit, par les ports du rapport du soir (billetterie, colis, caisse, départs), les faits du jour. Les
 * chiffres du patron en direct et ceux du rapport de 21 h sont ainsi calculés avec les mêmes définitions
 * (`estUneVente`, `analyserRemplissage`) : à 21 h, le tableau du jour et le rapport disent la même chose.
 */
@Injectable()
export class FaitsDuJourService {
  constructor(
    private readonly ventes: VentesBillets,
    private readonly colis: ActiviteColis,
    private readonly caisses: CaissesDuJour,
    private readonly departs: DepartsDuJour,
  ) {}

  async lire(
    compagnie: { id: string; nom: string },
    jour: string,
    maintenant: Date,
  ): Promise<FaitsDuJour> {
    const [tous, colis, litiges, caisses, departs, reference] = await Promise.all([
      this.ventes.duJour(compagnie.id, jour),
      this.colis.enregistresLe(compagnie.id, jour),
      this.colis.litigesOuvertsLe(compagnie.id, jour),
      this.caisses.duJour(compagnie.id, jour),
      this.departs.duJour(compagnie.id, jour),
      this.reference(compagnie.id, jour, maintenant),
    ]);
    const billets = ventesDuJour(tous, jour);
    const colisDuJour = colis.filter((c) => estDansLeJour(c.creeA, jour));
    const recette = somme(billets.map((b) => b.montant)) + somme(colisDuJour.map((c) => c.montant));
    return {
      jour,
      billets,
      colis: colisDuJour,
      recette,
      litiges,
      caisses,
      departs,
      remplissage: analyserRemplissage(departs, compagnie.nom),
      recetteReference: reference,
      variationPct: variationPct(recette, reference),
      comparaison: `${jourDeSemaine(jour)} dernier`,
    };
  }

  /** La recette du même jour de la semaine précédente jusqu'à la même heure (vente par vente). */
  private async reference(compagnieId: string, jour: string, maintenant: Date): Promise<number> {
    const jourRef = decalerJour(jour, -7);
    const limite = maintenant.getTime() - 7 * MS_PAR_JOUR;
    const [billets, colis] = await Promise.all([
      this.ventes.duJour(compagnieId, jourRef),
      this.colis.enregistresLe(compagnieId, jourRef),
    ]);
    return (
      somme(
        billets
          .filter((b) => estUneVente(b) && estDansLeJour(b.venduA, jourRef))
          .filter((b) => Date.parse(b.venduA) <= limite)
          .map((b) => b.montant),
      ) +
      somme(
        colis
          .filter((c) => estDansLeJour(c.creeA, jourRef) && Date.parse(c.creeA) <= limite)
          .map((c) => c.montant),
      )
    );
  }

  /** Les ventes datées des `n` mêmes jours de la semaine d'avant (pour prévoir la fin de la journée). */
  async memesJoursPrecedents(
    compagnieId: string,
    jour: string,
    n: number,
  ): Promise<VenteDatee[][]> {
    const sortie: VenteDatee[][] = [];
    for (let i = 1; i <= n; i++) {
      const j = decalerJour(jour, -7 * i);
      const [billets, colis] = await Promise.all([
        this.ventes.duJour(compagnieId, j),
        this.colis.enregistresLe(compagnieId, j),
      ]);
      sortie.push(
        ventesDatees(
          ventesDuJour(billets, j),
          colis.filter((c) => estDansLeJour(c.creeA, j)),
        ),
      );
    }
    return sortie;
  }
}
