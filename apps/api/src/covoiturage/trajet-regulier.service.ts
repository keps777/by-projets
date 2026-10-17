import { Injectable } from "@nestjs/common";
import { inconnu, invalide } from "../billetterie/erreurs";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import type { TrajetRegulierPassager } from "./modeles";
import {
  AnnuaireCovoiturage,
  ReferentielCovoiturage,
  Reservations,
  Trajets,
  TrajetsReguliersPassagers,
} from "./ports";
import { TEXTES, prenomDe, rappelAvant } from "./regles";

export interface TrajetRegulierVue {
  libelle: string;
  departA: string;
  actif: boolean;
  explication: string;
}

export interface CreationTrajetRegulier {
  ville: string;
  depart: string;
  arrivee: string;
  departA: string;
}

/** Depuis combien de trajets avec le même conducteur on le nomme dans l'explication. */
const HABITUE_A_PARTIR_DE = 2;

/**
 * Trajet régulier d'un passager en ville (« Mon trajet du matin ») : chaque jour ouvré, l'app lui
 * propose, 20 minutes avant son heure habituelle, les voitures qui partent. Un seul trajet régulier
 * par voyageur ; il s'active et se désactive d'un geste.
 */
@Injectable()
export class TrajetRegulierService {
  constructor(
    private readonly reguliers: TrajetsReguliersPassagers,
    private readonly reservations: Reservations,
    private readonly trajets: Trajets,
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly referentiel: ReferentielCovoiturage,
    private readonly horloge: Horloge,
  ) {}

  /** Le trajet régulier du voyageur, `null` s'il n'en a pas. */
  async pour(voyageurId: string): Promise<TrajetRegulierVue | null> {
    const t = await this.reguliers.trouver(voyageurId);
    return t ? this.vue(t) : null;
  }

  async obtenir(voyageur: Utilisateur): Promise<TrajetRegulierVue> {
    const vue = await this.pour(voyageur.id);
    if (!vue) throw inconnu("TRAJET_REGULIER_INCONNU", "Tu n'as pas encore de trajet régulier");
    return vue;
  }

  /** Crée ou remplace le trajet régulier du voyageur (actif). */
  async creer(voyageur: Utilisateur, c: CreationTrajetRegulier): Promise<TrajetRegulierVue> {
    if (c.depart.trim().toLowerCase() === c.arrivee.trim().toLowerCase()) {
      throw invalide("LIEUX_IDENTIQUES", "Le départ et l'arrivée doivent être différents");
    }
    const ville = (await this.referentiel.ville(c.ville)) ?? c.ville.trim();
    const t: TrajetRegulierPassager = {
      voyageurId: voyageur.id,
      ville,
      departPoint: c.depart.trim(),
      arriveePoint: c.arrivee.trim(),
      departA: c.departA,
      actif: true,
      modifieA: this.horloge.maintenant(),
    };
    await this.reguliers.enregistrer(t);
    return this.vue(t);
  }

  async definir(voyageur: Utilisateur, actif: boolean): Promise<TrajetRegulierVue> {
    const t = await this.reguliers.trouver(voyageur.id);
    if (!t) throw inconnu("TRAJET_REGULIER_INCONNU", "Tu n'as pas encore de trajet régulier");
    const apres = { ...t, actif, modifieA: this.horloge.maintenant() };
    await this.reguliers.enregistrer(apres);
    return this.vue(apres);
  }

  private async vue(t: TrajetRegulierPassager): Promise<TrajetRegulierVue> {
    const matin = Number(t.departA.slice(0, 2)) < 12;
    const habitue = await this.habitue(t.voyageurId);
    return {
      libelle: `${matin ? "Mon trajet du matin" : "Mon trajet régulier"} · ${t.departPoint} → ${t.arriveePoint} · ${t.departA}`,
      departA: t.departA,
      actif: t.actif,
      explication: [
        TEXTES.explicationTrajetRegulier(rappelAvant(t.departA)),
        habitue ? TEXTES.explicationHabitue(habitue.prenom, habitue.fois) : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  /** Le conducteur qui a le plus souvent pris ce passager en ville, s'il l'a fait au moins deux fois. */
  private async habitue(voyageurId: string): Promise<{ prenom: string; fois: number } | null> {
    const terminees = (await this.reservations.duPassager(voyageurId)).filter(
      (r) => r.statut === "terminee",
    );
    const parConducteur = new Map<string, number>();
    for (const r of terminees) {
      const trajet = await this.trajets.trouver(r.trajetId);
      if (trajet?.type !== "ville") continue;
      parConducteur.set(r.conducteurId, (parConducteur.get(r.conducteurId) ?? 0) + 1);
    }
    const [meilleur] = [...parConducteur.entries()].sort((a, b) => b[1] - a[1]);
    if (!meilleur || meilleur[1] < HABITUE_A_PARTIR_DE) return null;
    const identite = await this.annuaire.identite(meilleur[0]);
    return identite ? { prenom: prenomDe(identite.nom), fois: meilleur[1] } : null;
  }
}
