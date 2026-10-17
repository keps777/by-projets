import { Inject, Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { decalerJour, jourDouala } from "../rapport/temps";
import {
  analyseBus,
  analyseLigne,
  netDuDepart,
  synthese,
  vivants,
  type VueAnalyseBus,
  type VueAnalyseLigne,
  type VueAnalyses,
} from "./agregats";
import { CONFIG_ANALYSES, type ConfigAnalyses } from "./config";
import { erreurApi } from "./erreurs";
import type { AgregatReseau, DepartFait, OffrePublique, SimulationFaite } from "./modele";
import { fenetre, semaines, type Fenetre, type Periode } from "./periodes";
import {
  FaitsCaisse,
  FaitsDeparts,
  OffresPubliques,
  ReferentielAnalyses,
  ReseauAnonyme,
} from "./ports";
import {
  avisBus,
  busASurveiller,
  debutBase,
  detecter,
  hier,
  type ContexteRegles,
  type Detections,
} from "./regles";
import {
  BASE_JOURS,
  SimulationImpossible,
  series,
  simulerHoraire,
  simulerPrix,
} from "./simulation";

export type DemandeSimulationAnalyses =
  | { type: "horaire"; departId: string; nouvelleHeure: string }
  | { type: "prix"; departId: string; nouveauPrix: number };

export interface ResultatSimulationAnalyses {
  demande: DemandeSimulationAnalyses;
  simulation: SimulationFaite;
  base: string;
}

/** Ce que les sources complémentaires n'ont pas pu donner (le module répond quand même). */
export type SourceComplementaire = "caisse" | "offres_publiques" | "reseau";

export interface ContexteAnalyses extends ContexteRegles {
  compagnieId: string;
  indisponibles: SourceComplementaire[];
}

/** Départ → série → ce qu'il faut pour simuler. */
interface DepartRetrouve {
  depart: DepartFait;
  serie: ReturnType<typeof series>[number];
  autresDeLaClasse: DepartFait[];
  heuresDeLaLigne: string[];
  ligneCode: string;
}

/**
 * Agrégats et règles de détection sur les chiffres de la compagnie du patron. Source essentielle :
 * le référentiel et les départs (sans eux, 503). Sources complémentaires : la caisse, les offres
 * publiques des autres compagnies et les moyennes anonymes du réseau ; si l'une manque, la réponse
 * part sans elle et `indisponibles` le dit.
 */
@Injectable()
export class AnalysesService {
  private readonly journal = new Logger("Analyses");

  constructor(
    private readonly referentiel: ReferentielAnalyses,
    private readonly departs: FaitsDeparts,
    private readonly caisse: FaitsCaisse,
    private readonly offres: OffresPubliques,
    private readonly reseau: ReseauAnonyme,
    private readonly horloge: Horloge,
    @Inject(CONFIG_ANALYSES) private readonly config: ConfigAnalyses,
  ) {}

  /** Aujourd'hui, jour de Douala. */
  aujourdhui(): string {
    return jourDouala(this.horloge.maintenant());
  }

  /* ------------------------------------------------------------------ les trois écrans */

  async synthese(compagnieId: string, periode: Periode): Promise<VueAnalyses> {
    const f = fenetre(periode, this.aujourdhui());
    const [ref, faits] = await this.essentiel(compagnieId, f.precedentDu, f.au);
    return synthese(f, faits, ref);
  }

  async ligne(
    compagnieId: string,
    ligneId: string,
    periode: Periode = "semaine",
  ): Promise<VueAnalyseLigne> {
    const f = fenetre(periode, this.aujourdhui());
    const [ref, faits] = await this.essentiel(compagnieId, f.precedentDu, f.au);
    const ligne = ref.lignes.find((l) => l.id === ligneId);
    if (!ligne) throw erreurApi(404, "LIGNE_INCONNUE", `Ligne « ${ligneId} » inconnue`);
    const offres = await this.offresPubliques(compagnieId, [ligne.code], f.du, f.au);
    return analyseLigne(f, ligne, faits, ref, offres.valeur, this.config.nommerConcurrents);
  }

  async bus(compagnieId: string, busId: string): Promise<VueAnalyseBus> {
    const aujourdhui = this.aujourdhui();
    const f = fenetre("semaine", aujourdhui);
    // 8 semaines pleines de net, la semaine courante en dernier.
    const debut = decalerJour(f.au, -(8 * 7 - 1));
    const [ref, faits] = await this.essentiel(compagnieId, debut, f.au);
    const bus = ref.bus.find((b) => b.id === busId);
    if (!bus) throw erreurApi(404, "BUS_INCONNU", `Bus « ${busId} » inconnu`);

    const semaine = vivants(faits.filter((d) => d.jour >= f.du && d.jour <= f.au));
    const parBus = new Map<string, { net: number; trajets: number; pannes: number }>();
    for (const d of semaine) {
      if (d.busId === null) continue;
      const cumul = parBus.get(d.busId) ?? { net: 0, trajets: 0, pannes: 0 };
      cumul.net += netDuDepart(d);
      cumul.trajets += 1;
      cumul.pannes += d.incident?.nature === "panne" ? 1 : 0;
      parBus.set(d.busId, cumul);
    }
    const lignes = new Map(ref.lignes.map((l) => [l.id, l]));
    const coupesNet = semaines(f.au, 8);
    return analyseBus(
      f,
      bus,
      faits.filter((d) => d.busId === busId),
      lignes,
      avisBus({ aujourdhui, bus: ref.bus, departs: faits }, bus, parBus),
      busASurveiller(faits, busId, aujourdhui) ? "a_surveiller" : "ok",
      [...parBus.values()].map((v) => v.net),
      coupesNet,
    );
  }

  /* ------------------------------------------------------------------ pour l'assistant */

  /**
   * Tout ce que les règles de détection et l'assistant lisent : les `BASE_JOURS` derniers jours complets,
   * la caisse, les offres publiques des autres compagnies et les moyennes anonymes du réseau.
   */
  async contexte(compagnieId: string): Promise<ContexteAnalyses> {
    const aujourdhui = this.aujourdhui();
    const du = debutBase(aujourdhui);
    const au = hier(aujourdhui);
    const [ref, departs] = await this.essentiel(compagnieId, du, au);
    const indisponibles: SourceComplementaire[] = [];

    const caisse = await this.complement("caisse", indisponibles, async () => ({
      ecarts: await this.caisse.ecarts(compagnieId, du, au),
      cadence: await this.caisse.ventesCadence(compagnieId, du, au),
    }));
    const codes = [...new Set(ref.lignes.map((l) => l.code))];
    const offres = await this.offresPubliques(compagnieId, codes, du, au);
    if (offres.indisponible) indisponibles.push("offres_publiques");
    const reseau = await this.complement("reseau", indisponibles, async () =>
      this.anonymiser(
        await this.reseau.moyennes(compagnieId, codes, du, au, this.config.seuilAnonymat),
      ),
    );

    return {
      compagnieId,
      aujourdhui,
      lignes: ref.lignes,
      bus: ref.bus,
      agents: ref.agents,
      gares: ref.gares,
      departs,
      ecarts: caisse?.ecarts ?? [],
      cadence: caisse?.cadence ?? [],
      offres: offres.valeur,
      reseau: reseau ?? [],
      nommerConcurrents: this.config.nommerConcurrents,
      indisponibles,
    };
  }

  /** Les constats du moment : « argent qui fuit » et « argent à gagner ». */
  async constats(
    compagnieId: string,
  ): Promise<{ contexte: ContexteAnalyses; constats: Detections }> {
    const contexte = await this.contexte(compagnieId);
    return { contexte, constats: detecter(contexte) };
  }

  /* ------------------------------------------------------------------ simulation */

  async simuler(
    compagnieId: string,
    demande: DemandeSimulationAnalyses,
  ): Promise<ResultatSimulationAnalyses> {
    const contexte = await this.contexte(compagnieId);
    return this.simulerDans(contexte, demande);
  }

  simulerDans(
    contexte: ContexteAnalyses,
    demande: DemandeSimulationAnalyses,
  ): ResultatSimulationAnalyses {
    const trouve = this.retrouver(contexte, demande.departId);
    try {
      if (demande.type === "horaire") {
        const creneau = `${demande.nouvelleHeure.slice(0, 2)}:00`;
        const s = simulerHoraire({
          serie: trouve.serie,
          autres: trouve.autresDeLaClasse,
          heuresDeLaLigne: trouve.heuresDeLaLigne,
          offres: contexte.offres,
          ligneCode: trouve.ligneCode,
          nouvelleHeure: demande.nouvelleHeure,
          reseau:
            contexte.reseau.find(
              (r) => r.ligneCode === trouve.ligneCode && r.creneau === creneau,
            ) ?? null,
          nommerConcurrents: contexte.nommerConcurrents,
        });
        const { concurrent: _concurrent, ...simulation } = s;
        return { demande, simulation, base: simulation.base };
      }
      const simulation = simulerPrix({ serie: trouve.serie, nouveauPrix: demande.nouveauPrix });
      return { demande, simulation, base: simulation.base };
    } catch (e) {
      if (e instanceof SimulationImpossible) {
        throw erreurApi(422, e.code, e.message);
      }
      throw e;
    }
  }

  /** Un départ des `BASE_JOURS` derniers jours, sa série et ce qu'il faut pour la simuler. */
  retrouver(contexte: ContexteAnalyses, departId: string): DepartRetrouve {
    const depart = contexte.departs.find((d) => d.departId === departId && !d.annule);
    if (!depart) {
      throw erreurApi(
        404,
        "DEPART_INTROUVABLE",
        `Départ « ${departId} » inconnu parmi les ${BASE_JOURS} derniers jours`,
      );
    }
    const deLaLigne = vivants(contexte.departs.filter((d) => d.ligneId === depart.ligneId));
    const toutes = series(deLaLigne);
    const serie = toutes.find((s) => s.heure === depart.heure && s.classe === depart.classe)!;
    return {
      depart,
      serie,
      autresDeLaClasse: deLaLigne.filter(
        (d) => d.classe === depart.classe && d.heure !== depart.heure,
      ),
      heuresDeLaLigne: toutes.map((s) => s.heure),
      ligneCode: contexte.lignes.find((l) => l.id === depart.ligneId)?.code ?? "",
    };
  }

  /* ------------------------------------------------------------------ sources */

  private async essentiel(compagnieId: string, du: string, au: string) {
    try {
      const [lignes, bus, agents, gares, faits] = await Promise.all([
        this.referentiel.lignes(compagnieId),
        this.referentiel.bus(compagnieId),
        this.referentiel.agents(compagnieId),
        this.referentiel.gares(compagnieId),
        this.departs.entre(compagnieId, du, au),
      ]);
      return [{ lignes, bus, agents, gares }, faits] as const;
    } catch (e) {
      this.journal.error(`Source essentielle indisponible : ${(e as Error).message}`);
      throw erreurApi(503, "SOURCE_INDISPONIBLE", "Les chiffres de l'agence sont indisponibles");
    }
  }

  private async complement<T>(
    nom: SourceComplementaire,
    indisponibles: SourceComplementaire[],
    lire: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await lire();
    } catch (e) {
      this.journal.warn(`Source « ${nom} » indisponible : ${(e as Error).message}`);
      indisponibles.push(nom);
      return null;
    }
  }

  /** Les offres publiques, réduites aux cinq champs publics (rien d'autre ne sort d'un adaptateur). */
  private async offresPubliques(
    compagnieId: string,
    codes: readonly string[],
    du: string,
    au: string,
  ): Promise<{ valeur: OffrePublique[]; indisponible: boolean }> {
    try {
      const brutes = await this.offres.entre(compagnieId, codes, du, au);
      return {
        valeur: brutes.map((o) => ({
          compagnie: o.compagnie,
          ligneCode: o.ligneCode,
          jour: o.jour,
          heure: o.heure,
          prix: o.prix,
        })),
        indisponible: false,
      };
    } catch (e) {
      this.journal.warn(`Offres publiques indisponibles : ${(e as Error).message}`);
      return { valeur: [], indisponible: true };
    }
  }

  /** Défense en profondeur : sous le seuil, ou sans nombre de compagnies, une moyenne ne sort pas. */
  private anonymiser(brutes: readonly AgregatReseau[]): AgregatReseau[] {
    return brutes
      .filter((r) => Number.isInteger(r.compagnies) && r.compagnies >= this.config.seuilAnonymat)
      .map((r) => ({
        ligneCode: r.ligneCode,
        creneau: r.creneau,
        compagnies: r.compagnies,
        remplissageMoyenPct: r.remplissageMoyenPct,
        jours: r.jours,
      }));
  }

  /** Pour les tests et l'assistant : la fenêtre de la période demandée. */
  fenetre(periode: Periode): Fenetre {
    return fenetre(periode, this.aujourdhui());
  }
}
