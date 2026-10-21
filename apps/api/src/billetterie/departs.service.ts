import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { BilletsService, entreeHistorique } from "./billets.service";
import { CommandesService } from "./commandes.service";
import { conflit, inconnu, interdit, invalide } from "./erreurs";
import type { Billet, DepartComplet, EntreeHistorique } from "./modeles";
import { Billets, Catalogue, Inventaire, AvisBillets, PreferencesVoyageur } from "./ports";
import {
  BLOCAGE_SIEGE_MINUTES,
  aPlacesCoteACote,
  departPeut,
  etatDepartSuivant,
  prixProrata,
  TransitionInterdite,
  type ActionDepart,
  type EtatDepart,
} from "./regles";
import type { FiltresDeparts } from "./schemas";
import { SiegesService } from "./sieges.service";
import {
  MS_PAR_JOUR,
  debutDuJourDoualaMs,
  enMs,
  heureDouala,
  jourDouala,
  versIsoDouala,
} from "./temps";
import { capaciteDe, departVoyageur, siegesLibres } from "./vues";

/** Le filtre rapide « ≤ 5 000 F » de l'écran des filtres. */
export const PRIX_MAX_RAPIDE = 5000;

export const CLASSES_FILTRE = [
  { valeur: "toutes", libelle: "Toutes" },
  { valeur: "vip", libelle: "VIP · clim" },
  { valeur: "classique", libelle: "Classique" },
] as const;

export interface ParamsRecherche {
  depart: string;
  arrivee: string;
  jour?: string | undefined;
  filtres?: FiltresDeparts | undefined;
}

export interface TransitionDemandee {
  action: Exclude<ActionDepart, "fusionner">;
  heureDepart?: string | undefined;
  motif?: string | undefined;
}

const entree = (
  action: ActionDepart,
  de: EtatDepart,
  vers: EtatDepart,
  at: string,
  par: string,
  motif?: string,
): EntreeHistorique<EtatDepart, ActionDepart> => ({
  action,
  de,
  vers,
  at,
  par,
  ...(motif !== undefined ? { motif } : {}),
});

/**
 * Départs : recherche multi-compagnies avec filtres (voyageur), détail, plan des sièges, et la vie
 * d'un départ (ouvrir la vente, embarquer, partir, retarder, annuler, fusionner) pour la supervision.
 */
@Injectable()
export class DepartsService {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly sieges: SiegesService,
    private readonly billets: Billets,
    private readonly billetsService: BilletsService,
    private readonly commandes: CommandesService,
    private readonly inventaire: Inventaire,
    private readonly preferences: PreferencesVoyageur,
    private readonly avis: AvisBillets,
    private readonly horloge: Horloge,
  ) {}

  /* -------------------------------------------------------------- voyageur : recherche */

  private async villeOuInconnue(code: string) {
    const nom = await this.catalogue.ville(code);
    if (nom === null) throw inconnu("VILLE_INCONNUE", `Ville inconnue : ${code}`);
    return { code, nom };
  }

  /** Les départs en vente d'un trajet un jour donné (aujourd'hui : ceux qui n'ont pas encore quitté). */
  private async departsDuTrajet(depart: string, arrivee: string, jour: string) {
    const debut = debutDuJourDoualaMs(jour);
    const maintenant = this.horloge.maintenant().getTime();
    const de = versIsoDouala(Math.max(debut, maintenant));
    const tous = await this.catalogue.departs({
      villeOrigine: depart,
      villeDestination: arrivee,
      de,
      avant: versIsoDouala(debut + MS_PAR_JOUR),
      etats: ["en_vente"],
    });
    return tous.filter((d) => d.bus !== null && enMs(d.depart.heureDepart) > maintenant);
  }

  private jourOuAujourdhui(jour: string | undefined): string {
    return jour ?? jourDouala(this.horloge.maintenant());
  }

  async rechercher(voyageurId: string, p: ParamsRecherche) {
    const [depart, arrivee] = await Promise.all([
      this.villeOuInconnue(p.depart),
      this.villeOuInconnue(p.arrivee),
    ]);
    const jour = this.jourOuAujourdhui(p.jour);
    const filtres: FiltresDeparts =
      p.filtres ?? (await this.preferences.filtres(voyageurId, p.depart, p.arrivee)) ?? {};
    const preferees = await this.preferences.compagniesPreferees(voyageurId);
    const dujour = await this.departsDuTrajet(p.depart, p.arrivee, jour);
    const maintenant = this.sieges.maintenant();

    const retenus: { dc: DepartComplet; libres: number[] }[] = [];
    for (const dc of dujour) {
      if (filtres.classe && filtres.classe !== "toutes" && dc.depart.classe !== filtres.classe) {
        continue;
      }
      if (filtres.compagnies && filtres.compagnies.length > 0) {
        if (!filtres.compagnies.includes(dc.compagnie.id)) continue;
      }
      if (filtres.preferees && !preferees.has(dc.compagnie.id)) continue;
      if (filtres.matinSeulement && heureDouala(dc.depart.heureDepart) >= 12) continue;
      if (filtres.prixMax !== undefined && dc.ligne.tarifs[dc.depart.classe] > filtres.prixMax) {
        continue;
      }
      const plan = await this.inventaire.plan(dc.depart.id);
      const libres = siegesLibres(plan, capaciteDe(dc), maintenant);
      if (filtres.placesCoteACote && !aPlacesCoteACote(new Set(libres))) continue;
      retenus.push({ dc, libres });
    }
    // Les compagnies préférées d'abord, puis par heure de départ.
    retenus.sort(
      (a, b) =>
        Number(preferees.has(b.dc.compagnie.id)) - Number(preferees.has(a.dc.compagnie.id)) ||
        enMs(a.dc.depart.heureDepart) - enMs(b.dc.depart.heureDepart),
    );

    const compagniesDuTrajet = new Set(dujour.map((d) => d.compagnie.id));
    return {
      maintenant,
      depart,
      arrivee,
      jour,
      filtres: {
        classe: filtres.classe ?? ("toutes" as const),
        compagnies:
          filtres.compagnies && filtres.compagnies.length > 0
            ? filtres.compagnies.length
            : compagniesDuTrajet.size,
        preferees: [...compagniesDuTrajet].filter((id) => preferees.has(id)).length,
      },
      departs: retenus.map((r) => departVoyageur(r.dc, r.libres.length)),
      covoits: [],
      totaux: { bus: retenus.length, covoiturages: 0 },
    };
  }

  async optionsFiltres(
    voyageurId: string,
    p: { depart: string; arrivee: string; jour?: string | undefined },
  ) {
    const [depart, arrivee] = await Promise.all([
      this.villeOuInconnue(p.depart),
      this.villeOuInconnue(p.arrivee),
    ]);
    const jour = this.jourOuAujourdhui(p.jour);
    const filtres: FiltresDeparts =
      (await this.preferences.filtres(voyageurId, p.depart, p.arrivee)) ?? {};
    const preferees = await this.preferences.compagniesPreferees(voyageurId);
    const dujour = await this.departsDuTrajet(p.depart, p.arrivee, jour);

    const parCompagnie = new Map<string, DepartComplet[]>();
    for (const dc of dujour) {
      parCompagnie.set(dc.compagnie.id, [...(parCompagnie.get(dc.compagnie.id) ?? []), dc]);
    }
    const retenues =
      filtres.compagnies && filtres.compagnies.length > 0 ? filtres.compagnies : null;
    const compagnies = [...parCompagnie.values()]
      .map((departs) => {
        const compagnie = departs[0]!.compagnie;
        const tousVip = departs.every((d) => d.depart.classe === "vip");
        const tousDeNuit = departs.every((d) => {
          const h = heureDouala(d.depart.heureDepart);
          return h >= 20 || h < 5;
        });
        const etiquette = tousVip ? "VIP" : tousDeNuit ? "nuit" : undefined;
        return {
          id: compagnie.id,
          nom: compagnie.nom,
          ...(etiquette ? { etiquette } : {}),
          departs: departs.length,
          coche: retenues === null || retenues.includes(compagnie.id),
          preferee: preferees.has(compagnie.id),
        };
      })
      .sort((a, b) => Number(b.preferee) - Number(a.preferee) || a.nom.localeCompare(b.nom, "fr"));
    return {
      depart,
      arrivee,
      jour,
      classes: CLASSES_FILTRE.map((c) => ({ ...c })),
      classeActive: filtres.classe ?? ("toutes" as const),
      compagnies,
      totalDeparts: dujour.length,
      aussi: [
        { code: "covoiturage", libelle: "Covoiturage", actif: filtres.inclureCovoit ?? false },
        {
          code: "matin-seulement",
          libelle: "Matin seulement",
          actif: filtres.matinSeulement ?? false,
        },
        {
          code: "places-cote-a-cote",
          libelle: "Places côte à côte",
          actif: filtres.placesCoteACote ?? false,
        },
        {
          code: "5-000-f",
          libelle: "≤ 5 000 F",
          actif: filtres.prixMax !== undefined && filtres.prixMax <= PRIX_MAX_RAPIDE,
        },
      ],
    };
  }

  async enregistrerFiltres(
    voyageurId: string,
    p: { depart: string; arrivee: string; filtres: FiltresDeparts },
  ): Promise<{ enregistre: boolean }> {
    await this.villeOuInconnue(p.depart);
    await this.villeOuInconnue(p.arrivee);
    await this.preferences.enregistrerFiltres(voyageurId, p.depart, p.arrivee, p.filtres);
    return { enregistre: true };
  }

  async definirPreferee(voyageurId: string, compagnieId: string, preferee: boolean) {
    if (!(await this.catalogue.compagnie(compagnieId))) {
      throw inconnu("COMPAGNIE_INCONNUE", "Compagnie introuvable");
    }
    await this.preferences.definirPreferee(voyageurId, compagnieId, preferee);
    return { compagnieId, preferee };
  }

  /* -------------------------------------------------------------- voyageur : un départ */

  async chargerDepart(departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc) throw inconnu("DEPART_INCONNU", "Départ introuvable");
    return dc;
  }

  async detail(departId: string) {
    const dc = await this.chargerDepart(departId);
    return {
      depart: departVoyageur(dc, await this.sieges.placesLibres(dc)),
      origine: { ville: { code: dc.origine.code, nom: dc.origine.ville }, gare: dc.origine.nom },
      destination: {
        ville: { code: dc.destination.code, nom: dc.destination.ville },
        gare: dc.destination.nom,
      },
      dureeMinutes: dc.ligne.dureeMinutes,
      blocageMinutes: BLOCAGE_SIEGE_MINUTES,
    };
  }

  async plan(departId: string, voyageurId: string) {
    return this.sieges.vue(await this.chargerDepart(departId), voyageurId);
  }

  async bloquerSiege(departId: string, siege: number, voyageurId: string) {
    return this.sieges.bloquer(await this.chargerDepart(departId), siege, voyageurId);
  }

  /* -------------------------------------------------------------- prix au prorata */

  /** Prix d'un trajet partiel (montée en route) : prorata des kilomètres, arrondi à 100 F. */
  async prixPartiel(departId: string, depuisArretId: string, versArretId: string) {
    const dc = await this.chargerDepart(departId);
    const arrets = [...dc.ligne.arrets].sort((a, b) => a.ordre - b.ordre);
    const montee = arrets.find((a) => a.id === depuisArretId);
    if (montee && !montee.montee) {
      throw invalide("ARRET_SANS_MONTEE", "On ne monte pas à cet arrêt");
    }
    try {
      const prix = prixProrata({
        arrets,
        prixTrajetComplet: dc.ligne.tarifs[dc.depart.classe],
        depuisArretId,
        versArretId,
      });
      return { departId, depuisArretId, versArretId, classe: dc.depart.classe, prix };
    } catch (e) {
      if (e instanceof RangeError) throw invalide("ARRETS_INVALIDES", e.message);
      throw e;
    }
  }

  /* -------------------------------------------------------------- supervision : vie d'un départ */

  /** La supervision agit sur les départs de sa gare ; le patron sur toute sa compagnie. */
  private async departDeSaCompagnie(u: Utilisateur, departId: string): Promise<DepartComplet> {
    const dc = await this.catalogue.depart(departId);
    if (!dc || dc.compagnie.id !== u.compagnieId)
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    if (u.role === "superviseur" && u.gareId !== dc.origine.id) {
      throw interdit("AUTRE_GARE", "Ce départ n'est pas celui de ta gare");
    }
    return dc;
  }

  async transitionner(u: Utilisateur, departId: string, t: TransitionDemandee) {
    const dc = await this.departDeSaCompagnie(u, departId);
    return this.appliquer(dc, u.id, t);
  }

  /** Applique une transition de la machine d'états d'un départ (sans contrôle d'accès). */
  async appliquer(dc: DepartComplet, par: string, t: TransitionDemandee) {
    const departId = dc.depart.id;
    const de = dc.depart.etat;
    let vers: EtatDepart;
    try {
      vers = etatDepartSuivant(de, t.action);
    } catch (e) {
      if (e instanceof TransitionInterdite) {
        throw conflit("TRANSITION_INTERDITE", e.message, { etat: de, action: t.action });
      }
      throw e;
    }
    if (t.action === "ouvrir_vente" && !dc.bus) {
      throw conflit("BUS_NON_AFFECTE", "Affecte un bus avant d'ouvrir la vente");
    }
    const at = this.sieges.maintenant();
    let heureDepart = dc.depart.heureDepart;
    if (t.action === "retarder") {
      if (!t.heureDepart) throw invalide("HEURE_REQUISE", "Indique la nouvelle heure de départ");
      if (enMs(t.heureDepart) <= enMs(dc.depart.heureDepart)) {
        throw invalide("HEURE_INVALIDE", "La nouvelle heure doit être après l'heure prévue");
      }
      heureDepart = t.heureDepart;
    }
    const change = await this.catalogue.changerDepart(departId, de, {
      etat: vers,
      heureDepart,
      historique: [...dc.depart.historique, entree(t.action, de, vers, at, par, t.motif)],
    });
    if (!change) throw conflit("TRANSITION_INTERDITE", "Ce départ vient de changer d'état");

    let touches = 0;
    const billets = await this.billets.duDepart(departId);
    if (t.action === "partir") {
      // Les voyageurs payés qui ne sont pas montés sont « non présentés » : ils gardent leur numéro.
      for (const b of billets.filter((x) => x.etat === "paye")) {
        if (await this.billetsService.marquerNonPresent(b, at, par, "départ du bus")) touches++;
      }
    } else if (t.action === "arriver") {
      for (const b of billets.filter((x) => x.etat === "embarque")) {
        const fini = await this.billets.transitionner(b.id, ["embarque"], {
          etat: "voyage",
          historique: [
            ...b.historique,
            entreeHistorique("terminer", "embarque", "voyage", at, par),
          ],
        });
        if (fini) touches++;
      }
    } else if (t.action === "annuler") {
      // Départ annulé par la compagnie : tous les billets sont remboursés en entier.
      for (const b of billets.filter((x) => x.etat === "paye")) {
        await this.billetsService.annuler(b, {
          dc,
          par,
          raison: "depart_annule",
          ...(t.motif ? { motif: t.motif } : {}),
          remboursementIntegral: true,
        });
        touches++;
      }
      await this.annulerCommandesEnAttente(departId);
    }
    await this.avis.publier({ type: "depart.etat_change", departId, de, vers });
    return { departId, etat: vers, heureDepart, billetsTouches: touches };
  }

  private async annulerCommandesEnAttente(departId: string): Promise<void> {
    // Les commandes en cours ne sont plus payables : leurs sièges reviennent à la vente.
    const pendantes = await this.commandesEnAttente(departId);
    for (const id of pendantes) await this.commandes.annuler(id, "depart");
  }

  private commandesEnAttente(departId: string): Promise<string[]> {
    return this.commandes.enAttenteDuDepart(departId);
  }

  /**
   * Fusionne un départ dans un autre de la même ligne : les voyageurs payés sont replacés (même
   * numéro de siège si libre, sinon le premier siège libre), sans changer ni numéro ni code ni QR.
   * Tout ou rien : si la capacité ne suffit pas, rien ne bouge (409 `CAPACITE_INSUFFISANTE`).
   */
  async fusionner(u: Utilisateur, departId: string, dansDepartId: string) {
    if (departId === dansDepartId) {
      throw invalide("FUSION_IMPOSSIBLE", "Un départ ne peut pas fusionner avec lui-même");
    }
    const source = await this.departDeSaCompagnie(u, departId);
    const cible = await this.departDeSaCompagnie(u, dansDepartId);
    if (source.ligne.id !== cible.ligne.id) {
      throw conflit("FUSION_IMPOSSIBLE", "On ne fusionne que des départs de la même ligne");
    }
    if (!departPeut(source.depart.etat, "fusionner")) {
      throw conflit("TRANSITION_INTERDITE", "Ce départ ne peut plus être fusionné", {
        etat: source.depart.etat,
      });
    }
    if (
      !["programme", "en_vente", "embarquement", "retarde"].includes(cible.depart.etat) ||
      !cible.bus
    ) {
      throw conflit("FUSION_IMPOSSIBLE", "Le départ d'accueil ne peut pas recevoir de voyageurs");
    }
    const aDeplacer = (await this.billets.duDepart(departId))
      .filter((b) => b.etat === "paye")
      .sort((a, b) => (a.siege ?? Infinity) - (b.siege ?? Infinity));
    if (aDeplacer.some((b) => b.etat !== "paye")) {
      throw conflit("FUSION_IMPOSSIBLE", "Des voyageurs sont déjà embarqués");
    }
    const at = this.sieges.maintenant();
    const plan = await this.inventaire.plan(dansDepartId);
    const libres = siegesLibres(plan, capaciteDe(cible), at);
    const dispo = new Set(libres);
    const attribution = new Map<string, number | null>();
    // 1. Chacun garde son numéro de siège s'il est libre dans le départ d'accueil.
    for (const b of aDeplacer) {
      if (b.siege === null) attribution.set(b.id, null);
      else if (dispo.has(b.siege)) {
        attribution.set(b.id, b.siege);
        dispo.delete(b.siege);
      }
    }
    // 2. Les autres prennent les premiers sièges libres.
    const restants = [...dispo].sort((a, b) => a - b);
    for (const b of aDeplacer) {
      if (attribution.has(b.id)) continue;
      const siege = restants.shift();
      if (siege === undefined) {
        throw conflit(
          "CAPACITE_INSUFFISANTE",
          "Le départ d'accueil n'a pas assez de places libres pour tous les voyageurs",
          { aDeplacer: aDeplacer.length, libres: libres.length },
        );
      }
      attribution.set(b.id, siege);
    }

    // On réserve d'abord le départ source (plus de ventes), puis on déplace.
    const reserve = await this.catalogue.changerDepart(departId, source.depart.etat, {
      etat: "fusionne",
      fusionneDansId: dansDepartId,
      historique: [
        ...source.depart.historique,
        entree(
          "fusionner",
          source.depart.etat,
          "fusionne",
          at,
          u.id,
          `dans ${cible.depart.numero}`,
        ),
      ],
    });
    if (!reserve) throw conflit("TRANSITION_INTERDITE", "Ce départ vient de changer d'état");

    const deplaces: { billet: Billet; nouveauSiege: number | null }[] = [];
    try {
      for (const b of aDeplacer) {
        const nouveau = attribution.get(b.id) ?? null;
        if (nouveau !== null) {
          const r = await this.inventaire.occuper({
            departId: dansDepartId,
            siege: nouveau,
            billetId: b.id,
            par: null,
            maintenant: at,
          });
          if (!r.ok) throw conflit("CAPACITE_INSUFFISANTE", "Un siège vient d'être pris");
          this.sieges.publier(dansDepartId, nouveau, "pris", null, undefined, r.version);
        }
        const maj = await this.billets.transitionner(b.id, ["paye"], {
          departId: dansDepartId,
          siege: nouveau,
        });
        if (!maj) throw conflit("TRANSITION_INTERDITE", "Un billet vient de changer d'état");
        deplaces.push({ billet: b, nouveauSiege: nouveau });
      }
    } catch (e) {
      // Retour en arrière : les billets déjà déplacés reviennent, le départ source rouvre.
      for (const d of deplaces.reverse()) {
        await this.billets.transitionner(d.billet.id, ["paye"], {
          departId: departId,
          siege: d.billet.siege,
        });
        if (d.nouveauSiege !== null) {
          const levee = await this.inventaire.liberer(dansDepartId, d.nouveauSiege, d.billet.id);
          if (levee) {
            this.sieges.publier(
              dansDepartId,
              d.nouveauSiege,
              "libre",
              null,
              undefined,
              levee.version,
            );
          }
        }
      }
      await this.catalogue.changerDepart(departId, "fusionne", {
        etat: source.depart.etat,
        fusionneDansId: null,
        historique: source.depart.historique,
      });
      throw e;
    }
    for (const d of deplaces) {
      if (d.billet.siege !== null) {
        const levee = await this.inventaire.liberer(departId, d.billet.siege, d.billet.id);
        if (levee) {
          this.sieges.publier(departId, d.billet.siege, "libre", null, undefined, levee.version);
        }
      }
    }
    await this.annulerCommandesEnAttente(departId);
    const resume = deplaces.map((d) => ({
      billetId: d.billet.id,
      ancienSiege: d.billet.siege,
      nouveauSiege: d.nouveauSiege,
    }));
    await this.avis.publier({
      type: "depart.fusionne",
      departId,
      dansDepartId,
      deplaces: resume,
    });
    return { departId, dansDepartId, etat: "fusionne" as const, deplaces: resume };
  }
}
