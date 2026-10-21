import { Inject, Injectable } from "@nestjs/common";
import { debutDuJourDoualaMs, hhmmDouala, versIsoDouala } from "../billetterie/temps";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import type { Trajet } from "./modeles";
import { ReferentielCovoiturage, Reservations, Trajets } from "./ports";
import { ProfilsService } from "./profils.service";
import { TEXTES, ajouterMin, normaliser } from "./regles";
import { offreCovoitVue, type OffreCovoitVue } from "./vues";
import { TrajetRegulierService, type TrajetRegulierVue } from "./trajet-regulier.service";
import type { FiltreCovoit } from "./requetes";

export interface RechercheInterurbaine {
  depart: string;
  arrivee: string;
  apartirDe?: string | undefined;
  filtres?: FiltreCovoit[] | undefined;
  prixMax?: number | undefined;
}

export interface ResultatRechercheCovoitVue {
  maintenant: string;
  ville: string;
  depart: string;
  arrivee: string;
  offres: OffreCovoitVue[];
  note: string;
}

export type QuandVille = "maintenant" | "dans_1h" | "chaque_matin";

export interface RechercheEnVille {
  ville: string;
  depart?: string | undefined;
  arrivee?: string | undefined;
  quand?: QuandVille | undefined;
  types?: string[] | undefined;
}

export interface OffreVilleVue {
  id: string;
  type: "covoiturage";
  departA: string;
  departDansMinutes: number;
  qui: string;
  verifie: boolean;
  note?: number;
  detail: string;
  dureeMinutes?: number;
  placesLibres?: number;
  prix: number;
}

export interface ResultatRechercheVilleVue {
  maintenant: string;
  ville: { nom: string; detectee: boolean };
  itineraire: {
    depart: string;
    arrivee: string;
    departSurMaPosition: boolean;
    distanceKm: number;
  };
  quand: QuandVille;
  offres: OffreVilleVue[];
  trajetDuMatin?: TrajetRegulierVue;
}

export interface CovoitDansListeVue {
  id: string;
  heureDepart: string;
  conducteur: string;
  verifie: boolean;
  lieuDepart: string;
  placesLibres: number;
  vehicule: string;
  prixParPlace: number;
}

const LIMITE = 100;

/**
 * Recherche des covoiturages : entre deux villes (écran « Covoit »), dans une ville (« Covoit en
 * ville ») et, pour l'accueil, un résumé que la billetterie peut ajouter à ses départs. N'apparaissent
 * que les trajets publiés par un conducteur encore vérifié, avec au moins une place libre, que la
 * réservation peut encore atteindre.
 */
@Injectable()
export class RechercheService {
  constructor(
    private readonly trajets: Trajets,
    private readonly reservations: Reservations,
    private readonly referentiel: ReferentielCovoiturage,
    private readonly profils: ProfilsService,
    private readonly regulier: TrajetRegulierService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  private async nomDeVille(brut: string): Promise<string> {
    return (await this.referentiel.ville(brut)) ?? brut.trim().replace(/\s+/g, " ");
  }

  private async placesLibres(t: Trajet, maintenant: Date): Promise<number> {
    return Math.max(0, t.places - (await this.reservations.placesPrises(t.id, maintenant)));
  }

  /** Trajets réservables : conducteur vérifié, place libre, pas celui de `voyageurId`. */
  private async reservables(
    candidats: Trajet[],
    voyageurId: string,
    maintenant: Date,
  ): Promise<{ trajet: Trajet; libres: number }[]> {
    const sortie: { trajet: Trajet; libres: number }[] = [];
    const verifies = new Map<string, boolean>();
    for (const t of candidats) {
      if (t.conducteurId === voyageurId) continue;
      let verifie = verifies.get(t.conducteurId);
      if (verifie === undefined) {
        verifie = (await this.profils.conducteur(t.conducteurId)).vue.verifie;
        verifies.set(t.conducteurId, verifie);
      }
      if (!verifie) continue;
      const libres = await this.placesLibres(t, maintenant);
      if (libres > 0) sortie.push({ trajet: t, libres });
    }
    return sortie;
  }

  /* ------------------------------------------------------------------ entre villes */

  async rechercher(
    voyageur: Utilisateur,
    q: RechercheInterurbaine,
  ): Promise<ResultatRechercheCovoitVue> {
    const maintenant = this.horloge.maintenant();
    const [depart, arrivee] = await Promise.all([
      this.nomDeVille(q.depart),
      this.nomDeVille(q.arrivee),
    ]);
    const ouverture = ajouterMin(maintenant, this.config.fermetureAvantDepartMin);
    const du = q.apartirDe && new Date(q.apartirDe) > ouverture ? new Date(q.apartirDe) : ouverture;
    const candidats = await this.trajets.rechercher({
      type: "entre_villes",
      departVille: normaliser(depart),
      arriveeVille: normaliser(arrivee),
      du,
      limite: LIMITE,
    });
    const filtres = new Set(q.filtres ?? []);
    const retenus = (await this.reservables(candidats, voyageur.id, maintenant)).filter(
      ({ trajet: t }) =>
        (!filtres.has("clim") || t.options.includes("clim")) &&
        (!filtres.has("femmes") || t.options.includes("femmes")) &&
        (!filtres.has("grand_bagage") || t.grandBagage) &&
        (q.prixMax === undefined || t.prixParPlace <= q.prixMax),
    );
    const offres: OffreCovoitVue[] = [];
    for (const { trajet, libres } of retenus) {
      const { vue, nomComplet } = await this.profils.conducteur(trajet.conducteurId);
      offres.push(offreCovoitVue(trajet, libres, vue, nomComplet));
    }
    await this.trajets.enregistrerVues(
      retenus.map((r) => r.trajet.id),
      voyageur.id,
    );
    return {
      maintenant: versIsoDouala(maintenant),
      ville: depart,
      depart,
      arrivee,
      offres,
      note: TEXTES.noteRecherche,
    };
  }

  /**
   * Covoiturages d'un jour pour la liste des départs de l'accueil (`covoits` de
   * `GET /voyageur/departs`). À brancher par la billetterie à l'intégration.
   */
  async pourListe(
    voyageurId: string,
    q: { depart: string; arrivee: string; jour: string },
  ): Promise<CovoitDansListeVue[]> {
    const maintenant = this.horloge.maintenant();
    const [depart, arrivee] = await Promise.all([
      this.nomDeVille(q.depart),
      this.nomDeVille(q.arrivee),
    ]);
    const debut = new Date(debutDuJourDoualaMs(q.jour));
    const ouverture = ajouterMin(maintenant, this.config.fermetureAvantDepartMin);
    const candidats = await this.trajets.rechercher({
      type: "entre_villes",
      departVille: normaliser(depart),
      arriveeVille: normaliser(arrivee),
      du: debut > ouverture ? debut : ouverture,
      jusqua: new Date(debut.getTime() + 86_400_000),
      limite: LIMITE,
    });
    const sortie: CovoitDansListeVue[] = [];
    for (const { trajet, libres } of await this.reservables(candidats, voyageurId, maintenant)) {
      const { vue } = await this.profils.conducteur(trajet.conducteurId);
      sortie.push({
        id: trajet.id,
        heureDepart: versIsoDouala(trajet.departA),
        conducteur: vue.nom,
        verifie: vue.verifie,
        lieuDepart: trajet.departPoint,
        placesLibres: libres,
        vehicule: trajet.vehicule,
        prixParPlace: trajet.prixParPlace,
      });
    }
    return sortie;
  }

  /* ------------------------------------------------------------------ dans la même ville */

  /**
   * Covoiturages d'une ville (`GET /voyageur/ville/offres`). Les autres types d'offre en ville (moto-taxi,
   * bus de ville) ne sont pas de ce module : l'intégration peut composer ce résultat avec les leurs.
   */
  async enVille(voyageur: Utilisateur, q: RechercheEnVille): Promise<ResultatRechercheVilleVue> {
    const maintenant = this.horloge.maintenant();
    const quand: QuandVille = q.quand ?? "maintenant";
    const ville = await this.nomDeVille(q.ville);
    const trajetDuMatin = await this.regulier.pour(voyageur.id);
    const vide = (offres: OffreVilleVue[]): ResultatRechercheVilleVue => ({
      maintenant: versIsoDouala(maintenant),
      ville: { nom: ville, detectee: false },
      itineraire: {
        depart: q.depart ?? "",
        arrivee: q.arrivee ?? "",
        departSurMaPosition: false,
        // Pas de service de cartographie dans ce module : la distance n'est pas calculée.
        distanceKm: 0,
      },
      quand,
      offres,
      ...(trajetDuMatin ? { trajetDuMatin } : {}),
    });
    if (q.types && !q.types.includes("covoiturage")) return vide([]);

    const fenetre = fenetreVille(quand, maintenant);
    const ouverture = ajouterMin(maintenant, this.config.fermetureAvantDepartMin);
    const candidats = await this.trajets.rechercher({
      type: "ville",
      ville: normaliser(ville),
      du: fenetre.du > ouverture ? fenetre.du : ouverture,
      ...(fenetre.jusqua ? { jusqua: fenetre.jusqua } : {}),
      limite: LIMITE,
    });
    const reservables = (await this.reservables(candidats, voyageur.id, maintenant)).filter(
      ({ trajet: t }) => quand !== "chaque_matin" || (t.regulier && matinDe(t)),
    );
    const motsDepart = mots(q.depart);
    const motsArrivee = mots(q.arrivee);
    const classes = reservables
      .map((r) => ({
        ...r,
        // Les trajets qui passent par les lieux demandés d'abord, les autres ensuite.
        score: score(r.trajet.departPoint, motsDepart) + score(r.trajet.arriveePoint, motsArrivee),
      }))
      .sort((a, b) => b.score - a.score || a.trajet.departA.getTime() - b.trajet.departA.getTime());

    const offres: OffreVilleVue[] = [];
    for (const { trajet: t, libres } of classes) {
      const { vue } = await this.profils.conducteur(t.conducteurId);
      offres.push({
        id: t.id,
        type: "covoiturage",
        departA: versIsoDouala(t.departA),
        departDansMinutes: Math.max(
          0,
          Math.round((t.departA.getTime() - maintenant.getTime()) / 60_000),
        ),
        qui: vue.nom,
        verifie: vue.verifie,
        ...(vue.note !== undefined ? { note: vue.note } : {}),
        detail: `${t.vehicule} · ${libres} place(s) · ${t.departPoint} → ${t.arriveePoint}`,
        dureeMinutes: t.dureeMinutes,
        placesLibres: libres,
        prix: t.prixParPlace,
      });
    }
    return vide(offres);
  }
}

/* ------------------------------------------------------------------ outils de la recherche en ville */

function fenetreVille(quand: QuandVille, maintenant: Date): { du: Date; jusqua?: Date } {
  const MIN = 60_000;
  if (quand === "maintenant")
    return {
      du: new Date(maintenant.getTime() - 5 * MIN),
      jusqua: new Date(maintenant.getTime() + 60 * MIN),
    };
  if (quand === "dans_1h") {
    return {
      du: new Date(maintenant.getTime() + 60 * MIN),
      jusqua: new Date(maintenant.getTime() + 120 * MIN),
    };
  }
  // chaque matin : les départs des prochaines 24 h, filtrés ensuite sur l'heure et la répétition
  return { du: maintenant, jusqua: new Date(maintenant.getTime() + 24 * 60 * MIN) };
}

const matinDe = (t: Trajet): boolean => {
  const h = Number(hhmmDouala(t.departA).slice(0, 2));
  return h >= 5 && h < 10;
};

const mots = (texte: string | undefined): string[] =>
  normaliser(texte ?? "")
    .split(" ")
    .filter((m) => m.length >= 3);

const score = (lieu: string, recherches: string[]): number => {
  const n = normaliser(lieu);
  return recherches.filter((m) => n.includes(m)).length;
};
