import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { conflit, invalide } from "../billetterie/erreurs";
import { jourDouala, versIsoDouala } from "../billetterie/temps";
import { Verrous } from "../paiements/verrous";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import { CODES_OPTIONS, TYPES_PIECES, type CodeOption, type Trajet } from "./modeles";
import { AnnuaireCovoiturage, ReferentielCovoiturage, Trajets } from "./ports";
import { ReputationService } from "./reputation.service";
import {
  CONSEIL_VILLE_DEFAUT,
  DUREE_INTERURBAIN_DEFAUT_MIN,
  DUREE_VILLE_DEFAUT_MIN,
  FRAIS_PAR_PLACE,
  LIBELLES_PIECES,
  TEXTES,
  ajouterMin,
  descriptionVehicule,
  jourSemaineCourt,
  normaliser,
  prixAutorise,
  seChevauchent,
  type ConseilPrix,
} from "./regles";
import { VerificationService } from "./verification.service";
import { conducteurVue, trajetPublieVue, type ConducteurVue, type TrajetPublieVue } from "./vues";

export interface PublicationTrajet {
  depart: { ville: string; point: string };
  arrivee: { ville: string; point: string };
  departA: string;
  places: number;
  prixParPlace: number;
  options: string[];
  regulier?: boolean | undefined;
}

export interface FormulairePublicationVue {
  conducteur: ConducteurVue;
  vehicule: string;
  immatriculation: string;
  depart: { ville: string; point: string };
  arrivee: { ville: string; point: string };
  departA: string;
  places: { choix: number[]; choisi: number };
  prixParPlace: number;
  prixConseille: { min: number; max: number };
  fraisParPlace: number;
  options: { code: string; libelle: string; actif: boolean }[];
  reputation: { trajets: number; note: number; piecesVerifiees: string[] };
}

const UN_JOUR_MS = 86_400_000;

/**
 * Publication des trajets : réservée aux conducteurs vérifiés, au prix du partage de frais, sans
 * chevauchement avec un autre trajet du même conducteur. Un trajet régulier est republié chaque
 * semaine par le balayage.
 */
@Injectable()
export class TrajetsService {
  constructor(
    private readonly trajets: Trajets,
    private readonly verification: VerificationService,
    private readonly reputation: ReputationService,
    private readonly referentiel: ReferentielCovoiturage,
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  /** Nom d'une ville d'après le référentiel, sinon tel que le conducteur l'a écrit. */
  async nomDeVille(brut: string): Promise<string> {
    return (await this.referentiel.ville(brut)) ?? brut.trim().replace(/\s+/g, " ");
  }

  /** Conseil de prix et durée d'un trajet, avec les valeurs par défaut du module. */
  async conseil(
    departVille: string,
    arriveeVille: string,
  ): Promise<{ prix: ConseilPrix | null; dureeMinutes: number; connu: boolean }> {
    if (normaliser(departVille) === normaliser(arriveeVille)) {
      return { prix: CONSEIL_VILLE_DEFAUT, dureeMinutes: DUREE_VILLE_DEFAUT_MIN, connu: false };
    }
    const c = await this.referentiel.conseil(departVille, arriveeVille);
    return c
      ? { prix: c.prix, dureeMinutes: c.dureeMinutes, connu: true }
      : { prix: null, dureeMinutes: DUREE_INTERURBAIN_DEFAUT_MIN, connu: false };
  }

  /* ------------------------------------------------------------------ publier */

  async publier(conducteur: Utilisateur, p: PublicationTrajet): Promise<TrajetPublieVue> {
    const dossier = await this.verification.exigerVerifie(conducteur.id);
    const vehicule = dossier.vehicule;
    if (vehicule === null) {
      // `exigerVerifie` garantit un véhicule ; garde pour le typage
      throw conflit("VEHICULE_ABSENT", "Aucun véhicule déclaré");
    }
    const maintenant = this.horloge.maintenant();
    const departA = new Date(p.departA);
    const ouverture = ajouterMin(maintenant, this.config.fermetureAvantDepartMin);
    if (departA.getTime() < ouverture.getTime()) {
      throw invalide(
        "DEPART_TROP_PROCHE",
        `Le départ doit être dans plus de ${this.config.fermetureAvantDepartMin} minutes`,
      );
    }
    if (departA.getTime() > maintenant.getTime() + this.config.horizonJours * UN_JOUR_MS) {
      throw invalide(
        "DEPART_TROP_LOIN",
        `On publie au plus ${this.config.horizonJours} jours à l'avance`,
      );
    }
    if (p.places > vehicule.places) {
      throw invalide(
        "PLACES_AU_DELA_DU_VEHICULE",
        `Ta voiture a ${vehicule.places} place(s) pour les passagers`,
        { placesVehicule: vehicule.places },
      );
    }
    const options = this.lireOptions(p.options);

    const departVille = await this.nomDeVille(p.depart.ville);
    const arriveeVille = await this.nomDeVille(p.arrivee.ville);
    const type = normaliser(departVille) === normaliser(arriveeVille) ? "ville" : "entre_villes";
    const conseil = await this.conseil(departVille, arriveeVille);
    const prix = prixAutorise(p.prixParPlace, conseil.prix, this.config);
    if (!prix.ok) {
      throw invalide(
        "PRIX_INVALIDE",
        `Le prix d'une place doit rester un partage de frais : de 100 F à ${prix.max} F`,
        { max: prix.max },
      );
    }

    const regulier = p.regulier === true || options.includes("regulier");
    const trajet: Trajet = {
      id: randomUUID(),
      conducteurId: conducteur.id,
      type,
      departVille,
      departPoint: p.depart.point.trim(),
      arriveeVille,
      arriveePoint: p.arrivee.point.trim(),
      departA,
      dureeMinutes: conseil.dureeMinutes,
      places: p.places,
      prixParPlace: p.prixParPlace,
      options: regulier && !options.includes("regulier") ? [...options, "regulier"] : options,
      vehicule: descriptionVehicule(vehicule),
      immatriculation: vehicule.immatriculation,
      grandBagage: vehicule.grandBagage,
      regulier,
      suivantCreeA: null,
      statut: "publie",
      creeA: maintenant,
      annuleA: null,
    };

    await this.verrous.executer(`conducteur:${conducteur.id}`, async () => {
      const autres = await this.trajets.duConducteur(conducteur.id, {
        statuts: ["publie"],
        depuis: new Date(maintenant.getTime() - UN_JOUR_MS),
      });
      if (autres.some((a) => seChevauchent(a, trajet))) {
        throw conflit("TRAJET_CHEVAUCHANT", "Tu as déjà un trajet publié à ce moment-là");
      }
      await this.trajets.creer(trajet);
    });
    await this.audit.enregistrer({
      acteur: { id: conducteur.id, role: conducteur.role, compagnieId: null },
      action: "covoiturage.trajet_publie",
      resultat: "succes",
      cible: { type: "trajet", id: trajet.id },
      details: { type, places: trajet.places, prixParPlace: trajet.prixParPlace, regulier },
      at: maintenant,
    });
    return trajetPublieVue(trajet, []);
  }

  private lireOptions(codes: readonly string[]): CodeOption[] {
    const inconnues = codes.filter((c) => !(CODES_OPTIONS as readonly string[]).includes(c));
    if (inconnues.length > 0) {
      throw invalide("OPTION_INCONNUE", `Option inconnue : ${inconnues.join(", ")}`);
    }
    return [...new Set(codes)] as CodeOption[];
  }

  /* ------------------------------------------------------------------ formulaire pré-rempli */

  /**
   * Valeurs par défaut de l'écran « Proposer mon trajet » : le dernier trajet du conducteur, une
   * semaine plus tard, ou un formulaire vide si c'est son premier.
   */
  async formulaire(conducteur: Utilisateur): Promise<FormulairePublicationVue> {
    const maintenant = this.horloge.maintenant();
    const [dossier, identite, reputation, anciens] = await Promise.all([
      this.verification.dossierDe(conducteur.id),
      this.annuaire.identite(conducteur.id),
      this.reputation.conducteur(conducteur.id),
      this.trajets.duConducteur(conducteur.id),
    ]);
    const dernier = [...anciens].sort((a, b) => b.creeA.getTime() - a.creeA.getTime())[0] ?? null;
    const verifie = dossier ? await this.verification.estVerifie(conducteur.id) : false;
    const vehicule = dossier?.vehicule ?? null;

    const depart = dernier
      ? { ville: dernier.departVille, point: dernier.departPoint }
      : { ville: "", point: "" };
    const arrivee = dernier
      ? { ville: dernier.arriveeVille, point: dernier.arriveePoint }
      : { ville: "", point: "" };

    const ouverture = ajouterMin(maintenant, this.config.fermetureAvantDepartMin).getTime();
    let departA: Date;
    if (dernier) {
      departA = new Date(dernier.departA);
      while (departA.getTime() <= ouverture) departA = new Date(departA.getTime() + 7 * UN_JOUR_MS);
    } else {
      // demain, 08:00 à Douala
      const demain =
        new Date(`${jourDouala(maintenant)}T08:00:00.000+01:00`).getTime() + UN_JOUR_MS;
      departA = new Date(demain);
    }

    const placesMax = Math.min(vehicule?.places ?? 3, 8);
    const choix = Array.from({ length: placesMax }, (_, i) => i + 1);
    const choisi = Math.min(dernier?.places ?? 2, placesMax);

    const conseil =
      depart.ville !== "" && arrivee.ville !== ""
        ? await this.conseil(depart.ville, arrivee.ville)
        : { prix: null, dureeMinutes: 0, connu: false };
    const prixConseille = conseil.prix ?? { min: 0, max: this.config.prixMaxInconnuFcfa };
    const prixParPlace =
      dernier?.prixParPlace ??
      (conseil.prix ? Math.round((conseil.prix.min + conseil.prix.max) / 2 / 100) * 100 : 0);

    const actives = new Set<CodeOption>(dernier?.options ?? []);
    const options = [
      { code: "clim", libelle: TEXTES.options.clim, actif: actives.has("clim") },
      {
        code: "bagage_moyen",
        libelle: TEXTES.options.bagage_moyen,
        actif: actives.has("bagage_moyen"),
      },
      { code: "femmes", libelle: TEXTES.options.femmes, actif: actives.has("femmes") },
      {
        code: "regulier",
        libelle: TEXTES.options.regulier(jourSemaineCourt(departA)),
        actif: actives.has("regulier"),
      },
    ];

    const piecesVerifiees = dossier
      ? TYPES_PIECES.filter((t) => dossier.pieces[t]?.statut === "validee").map(
          (t) => LIBELLES_PIECES[t],
        )
      : [];

    return {
      conducteur: conducteurVue(conducteur.id, identite?.nom ?? "", verifie, reputation),
      vehicule: vehicule ? descriptionVehicule(vehicule) : "",
      immatriculation: vehicule?.immatriculation ?? "",
      depart,
      arrivee,
      departA: versIsoDouala(departA),
      places: { choix, choisi },
      prixParPlace,
      prixConseille,
      fraisParPlace: FRAIS_PAR_PLACE,
      options,
      reputation: { trajets: reputation.trajets, note: reputation.note ?? 0, piecesVerifiees },
    };
  }

  /* ------------------------------------------------------------------ balayage */

  /** Ferme les trajets dont l'arrivée prévue est passée. */
  async terminer(limite = 100): Promise<number> {
    const aTerminer = await this.trajets.aTerminer(this.horloge.maintenant(), limite);
    let n = 0;
    for (const t of aTerminer) {
      if (await this.trajets.transitionner(t.id, ["publie"], { statut: "termine" })) n += 1;
    }
    return n;
  }

  /**
   * Publie l'occurrence suivante des trajets réguliers dont le départ est passé : même heure, une
   * semaine plus tard (ou la première semaine à venir si le balayage a manqué plusieurs semaines). Rien
   * n'est publié si le conducteur n'est plus vérifié ; la série s'arrête alors.
   */
  async renouveler(limite = 100): Promise<number> {
    const maintenant = this.horloge.maintenant();
    const aRenouveler = await this.trajets.aRenouveler(maintenant, limite);
    let n = 0;
    for (const t of aRenouveler) {
      // Marqueur posé d'abord : une seconde instance qui balaie en même temps ne republie pas.
      if (!(await this.trajets.marquerSuivant(t.id, maintenant))) continue;
      if (!(await this.verification.estVerifie(t.conducteurId))) continue;
      let departA = new Date(t.departA.getTime() + 7 * UN_JOUR_MS);
      while (
        departA.getTime() <= ajouterMin(maintenant, this.config.fermetureAvantDepartMin).getTime()
      ) {
        departA = new Date(departA.getTime() + 7 * UN_JOUR_MS);
      }
      const suivant: Trajet = {
        ...t,
        id: randomUUID(),
        departA,
        statut: "publie",
        suivantCreeA: null,
        creeA: maintenant,
        annuleA: null,
      };
      const autres = await this.trajets.duConducteur(t.conducteurId, {
        statuts: ["publie"],
        depuis: new Date(maintenant.getTime() - UN_JOUR_MS),
      });
      if (autres.some((a) => seChevauchent(a, suivant))) continue;
      await this.trajets.creer(suivant);
      n += 1;
    }
    return n;
  }
}
