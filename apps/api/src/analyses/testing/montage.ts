import { decalerJour } from "../../rapport/temps";
import { AnalysesService } from "../analyses.service";
import { chargerConfigAnalyses, type ConfigAnalyses } from "../config";
import type { ContexteRegles } from "../regles";
import type {
  AgentRef,
  BusRef,
  Classe,
  DepartFait,
  EcartCaisseFait,
  GareRef,
  LigneRef,
  VenteCadenceFait,
} from "../modele";
import {
  FaitsCaisseMemoire,
  FaitsDepartsMemoire,
  OffresPubliquesMemoire,
  ReferentielMemoire,
  ReseauMemoire,
} from "../memoire";
import { Horloge } from "../../socle/horloge";
import { jourParJour, jourSemaine } from "../periodes";

/** Mardi 5 janvier 2027, 08:00 à Douala. */
export const AUJOURDHUI = "2027-01-05";
export const MATIN = new Date("2027-01-05T07:00:00.000Z");

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const TROISIEME = "00000000-0000-4000-8000-0000000000c3";
export const QUATRIEME = "00000000-0000-4000-8000-0000000000c4";
export const CINQUIEME = "00000000-0000-4000-8000-0000000000c5";

export const AKWA: GareRef = { id: "gare-akwa", nom: "Akwa", ville: "Douala" };
export const MVAN: GareRef = { id: "gare-mvan", nom: "Mvan", ville: "Yaoundé" };
export const BAFOUSSAM: GareRef = { id: "gare-baf", nom: "Bafoussam", ville: "Bafoussam" };

export const DLA_BAF: LigneRef = {
  id: "ligne-dla-baf",
  nom: "Douala → Bafoussam",
  code: "DLABAF",
  origine: "Douala",
  destination: "Bafoussam",
};
export const DLA_YDE: LigneRef = {
  id: "ligne-dla-yde",
  nom: "Douala → Yaoundé",
  code: "DLAYDE",
  origine: "Douala",
  destination: "Yaoundé",
};

export const JOSEPH: AgentRef = { id: "agent-joseph", nom: "Joseph" };
export const ESSONO: AgentRef = { id: "agent-essono", nom: "Essono" };

export const BUS_207: BusRef = {
  id: "bus-lt207",
  immatriculation: "LT 207 AB",
  modele: "Coaster",
  capacite: 30,
  annee: 2019,
  chauffeurId: "chauffeur-nana",
  chauffeurNom: "Nana",
  entretien: null,
};
export const BUS_330: BusRef = {
  id: "bus-lt330",
  immatriculation: "LT 330 AB",
  modele: "Coaster",
  capacite: 30,
  annee: 2021,
  chauffeurId: "chauffeur-essomba",
  chauffeurNom: "Essomba",
  entretien: null,
};
export const BUS_412: BusRef = {
  id: "bus-lt412",
  immatriculation: "LT 412 AB",
  modele: "Coaster",
  capacite: 30,
  annee: 2020,
  chauffeurId: "chauffeur-mbarga",
  chauffeurNom: "Mbarga",
  entretien: "pneus à changer",
};

let compteur = 0;

/** Un fait de départ avec des valeurs neutres : un bus de 30 places, 20 billets à 3 500 F. */
export function depart(over: Partial<DepartFait> = {}): DepartFait {
  compteur += 1;
  const base: DepartFait = {
    departId: `depart-${compteur}`,
    ligneId: DLA_BAF.id,
    jour: "2027-01-04",
    heure: "08:15",
    classe: "classique",
    prix: 3_500,
    busId: BUS_330.id,
    chauffeurId: "chauffeur-essomba",
    capacite: 30,
    billets: 20,
    recetteBillets: 0,
    billetsEnLigne: 0,
    billetsEnRoute: 0,
    arretsEnRoute: [],
    enRouteTousEnregistres: true,
    colis: 0,
    recetteColis: 0,
    annule: false,
    note: null,
    retardMinutes: null,
    incident: null,
    carburant: 30_000,
    coutPanne: 0,
    autresDepenses: 0,
  };
  const fait = { ...base, ...over };
  if (over.recetteBillets === undefined) fait.recetteBillets = fait.billets * fait.prix;
  return fait;
}

/** Le jour de la semaine (0 = dimanche) d'un jour. */
export const jourDe = jourSemaine;

export interface Serie {
  heure: string;
  classe?: Classe;
  prix?: number;
  /** Remplissage en % du jour de la semaine (0 = dimanche … 6 = samedi) ; 75 par défaut. */
  remplissage?: (jourDeLaSemaine: number) => number;
  busId?: string | null;
  note?: string | null;
}

/**
 * Trente jours de départs réguliers sur une ligne : une série par ligne de `series`, chaque jour,
 * avec le remplissage voulu pour le jour de la semaine.
 */
export function genererLigne(
  ligne: LigneRef,
  du: string,
  au: string,
  series: readonly Serie[],
  capacite = 40,
): DepartFait[] {
  const sortie: DepartFait[] = [];
  for (const jour of jourParJour(du, au)) {
    for (const s of series) {
      const pct = s.remplissage ? s.remplissage(jourSemaine(jour)) : 75;
      const billets = Math.round((capacite * pct) / 100);
      const prix = s.prix ?? 3_500;
      sortie.push(
        depart({
          ligneId: ligne.id,
          jour,
          heure: s.heure,
          classe: s.classe ?? "classique",
          prix,
          capacite,
          billets,
          recetteBillets: billets * prix,
          billetsEnLigne: Math.round(billets * 0.11),
          busId: s.busId === undefined ? BUS_330.id : s.busId,
          note: s.note ?? null,
        }),
      );
    }
  }
  return sortie;
}

export function ecart(over: Partial<EcartCaisseFait> & { jour: string }): EcartCaisseFait {
  compteur += 1;
  return {
    sessionId: `session-${compteur}`,
    agentId: JOSEPH.id,
    gareId: AKWA.id,
    guichet: "Guichet 2",
    ecart: -1_500,
    tolerance: 1_000,
    validee: true,
    ...over,
  };
}

export function cadence(over: Partial<VenteCadenceFait> & { jour: string }): VenteCadenceFait {
  compteur += 1;
  return {
    agentId: JOSEPH.id,
    gareId: AKWA.id,
    departId: `depart-cadence-${compteur}`,
    ligneId: DLA_YDE.id,
    heure: "05:30",
    billets: 20,
    sansNom: 0,
    ...over,
  };
}

export class HorlogeReglable extends Horloge {
  constructor(private instant = MATIN) {
    super();
  }
  maintenant(): Date {
    return new Date(this.instant);
  }
  aller(instant: Date): void {
    this.instant = new Date(instant);
  }
  avancer(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

export interface MontageAnalyses {
  service: AnalysesService;
  config: ConfigAnalyses;
  referentiel: ReferentielMemoire;
  departs: FaitsDepartsMemoire;
  caisse: FaitsCaisseMemoire;
  offres: OffresPubliquesMemoire;
  reseau: ReseauMemoire;
  horloge: HorlogeReglable;
}

export function monterAnalyses(env: Record<string, string> = {}): MontageAnalyses {
  const referentiel = new ReferentielMemoire();
  const departs = new FaitsDepartsMemoire();
  const caisse = new FaitsCaisseMemoire();
  const offres = new OffresPubliquesMemoire();
  const reseau = new ReseauMemoire();
  const horloge = new HorlogeReglable();
  const config = chargerConfigAnalyses(env);
  const service = new AnalysesService(
    referentiel,
    departs,
    caisse,
    offres,
    reseau,
    horloge,
    config,
  );
  return { service, config, referentiel, departs, caisse, offres, reseau, horloge };
}

/** Le référentiel de la compagnie de la planche : trois gares, deux lignes, trois bus, deux agents. */
export function peuplerReferentiel(m: MontageAnalyses, compagnieId = COMPAGNIE): void {
  for (const g of [AKWA, MVAN, BAFOUSSAM]) m.referentiel.ajouterGare(compagnieId, g);
  for (const l of [DLA_BAF, DLA_YDE]) m.referentiel.ajouterLigne(compagnieId, l);
  for (const b of [BUS_207, BUS_330, BUS_412]) m.referentiel.ajouterBus(compagnieId, b);
  for (const a of [JOSEPH, ESSONO]) m.referentiel.ajouterAgent(compagnieId, a);
}

/**
 * La semaine de la planche, aux jours de ce montage : Douala → Bafoussam sur 30 jours (le 10:00 à
 * 55 %, le mercredi qui s'effondre, le mardi qui monte), Oméga qui publie un 09:30 à 3 000 F, les écarts
 * de Joseph et ses billets de cadence sans numéro.
 */
export function peuplerPlanche(m: MontageAnalyses): void {
  peuplerReferentiel(m);
  const du = decalerJour(AUJOURDHUI, -30);
  const au = decalerJour(AUJOURDHUI, -1);
  m.departs.ajouter(
    COMPAGNIE,
    ...genererLigne(DLA_BAF, du, au, [
      { heure: "06:00", remplissage: () => 94 },
      { heure: "08:15", remplissage: () => 88 },
      { heure: "10:00", remplissage: (j) => (j === 3 ? 40 : j === 2 ? 70 : 55) },
      { heure: "13:00", remplissage: (j) => (j === 3 ? 42 : 76) },
      { heure: "16:30", classe: "vip", prix: 5_000, remplissage: (j) => (j === 3 ? 45 : 81) },
    ]),
  );
  for (const jour of jourParJour(du, au)) {
    m.offres.publier(AUTRE_COMPAGNIE, {
      compagnie: "Oméga",
      ligneCode: "DLABAF",
      jour,
      heure: "09:30",
      prix: 3_000,
    });
  }
  m.caisse.ajouterEcart(
    COMPAGNIE,
    ecart({ jour: "2026-12-29" }),
    ecart({ jour: "2027-01-02", ecart: -1_500 }),
    ecart({ jour: "2027-01-04", ecart: -1_500 }),
  );
}

/** Un contexte de règles prêt à l'emploi : le référentiel de la planche et des faits à ajouter. */
export function contexteRegles(over: Partial<ContexteRegles> = {}): ContexteRegles {
  return {
    aujourdhui: AUJOURDHUI,
    lignes: [DLA_BAF, DLA_YDE],
    bus: [BUS_207, BUS_330, BUS_412],
    agents: [JOSEPH, ESSONO],
    gares: [AKWA, MVAN, BAFOUSSAM],
    departs: [],
    ecarts: [],
    cadence: [],
    offres: [],
    reseau: [],
    nommerConcurrents: true,
    ...over,
  };
}
