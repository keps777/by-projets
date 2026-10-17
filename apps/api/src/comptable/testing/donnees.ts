import type {
  AnnulationComptable,
  LigneReleve,
  MoyenEncaissement,
  SessionComptable,
  VenteComptable,
} from "../modele";
import { Horloge } from "../../socle/horloge";
import { ChargeurMois } from "../donnees.service";
import {
  AnnulationsMemoire,
  ClotureMemoire,
  DecisionsMemoire,
  FacturesPayeesMemoire,
  FaitsMemoire,
  ParametresMemoire,
  RelevesMemoire,
  SessionsMemoire,
  VentesMemoire,
} from "../memoire";

/** Les données d'un mois fictif, de quoi exercer les exports et le rapprochement. */

export const AGENCE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_AGENCE = "00000000-0000-4000-8000-0000000000c2";

/** Instant ISO Douala : `iso("2026-12-03", "11:42:00")`. */
export const iso = (jour: string, heure = "12:00:00"): string => `${jour}T${heure}.000+01:00`;

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function graine(depart: number): () => number {
  let a = depart >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let compteur = 0;

/** Une vente de billet en espèces au guichet GU1, à surcharger. */
export function vente(surcharge: Partial<VenteComptable> = {}): VenteComptable {
  compteur += 1;
  return {
    id: `vente-${compteur}`,
    genre: "billet",
    numero: `A-ALP-${String(compteur).padStart(4, "0")}`,
    at: iso("2026-12-01", "08:00:00"),
    ligne: "DLA-YDE",
    depart: "09:00",
    siege: "12",
    classe: "CLASSIQUE",
    prix: 5000,
    moyen: "cash",
    guichet: "GU1",
    agent: "JM",
    sessionId: null,
    referenceOperateur: null,
    annuleeA: null,
    ...surcharge,
  };
}

export function session(surcharge: Partial<SessionComptable> = {}): SessionComptable {
  compteur += 1;
  return {
    id: `session-${compteur}`,
    numero: `K-AKW-261201-GU1-${compteur}`,
    guichet: "GU1",
    agent: "Joseph M.",
    ouverteA: iso("2026-12-01", "05:30:00"),
    clotureeA: iso("2026-12-01", "18:00:00"),
    fond: 20_000,
    cashAttendu: null,
    cashCompte: null,
    ecart: 0,
    validePar: "Mme Essono",
    validation: "pin",
    ...surcharge,
  };
}

export function annulation(surcharge: Partial<AnnulationComptable> = {}): AnnulationComptable {
  compteur += 1;
  return {
    id: `annulation-${compteur}`,
    at: iso("2026-12-10", "10:00:00"),
    numero: `A-ALP-9${compteur}`,
    genre: "billet",
    montant: 5000,
    decision: "rembourser",
    motif: "Le voyageur a changé de date",
    demandePar: "Joseph M.",
    validePar: "Mme Essono",
    validation: "pin",
    venteAt: iso("2026-12-09", "08:00:00"),
    moyen: "cash",
    ...surcharge,
  };
}

export function ligneReleve(surcharge: Partial<LigneReleve> = {}): LigneReleve {
  compteur += 1;
  return {
    reference: `MP261201.0800.R${String(compteur).padStart(5, "0")}`,
    recueA: iso("2026-12-01", "08:00:00"),
    telephone: "+237677123441",
    operateur: "mtn",
    montant: 5000,
    ...surcharge,
  };
}

/** Les quatre transactions sans correspondance de la planche (16 000 F au total). */
export const ORPHELINES = {
  doublon: "MP261203.1142.A71290",
  expiration: "OM261209.0658.K01884",
  colis: "MP261217.1930.B55012",
  inconnue: "OM261228.1405.Q77731",
} as const;

export const TELEPHONES = {
  doublon: "+237677123441",
  expiration: "+237699000002",
  colis: "+237650000077",
  inconnue: "+237694000018",
} as const;

export const COLIS_A_RATTACHER = "C-ALP-DLA-261217-0141";

export interface Magasins {
  ventes: VentesMemoire;
  sessions: SessionsMemoire;
  annulations: AnnulationsMemoire;
  releves: RelevesMemoire;
  faits: FaitsMemoire;
}

const GUICHETS = ["GU1", "GU2", "GU3"] as const;
const AGENTS: Record<(typeof GUICHETS)[number], string> = { GU1: "JM", GU2: "MT", GU3: "PN" };
const EN_LIGNE = ["APP", "USSD", "WHATSAPP"] as const;

export interface Resume {
  ventes: VenteComptable[];
  sessions: SessionComptable[];
}

/**
 * Remplit un mois de `jours` jours de ventes en espèces, MoMo, Orange Money et carte, aux guichets et en
 * ligne, avec des sessions de caisse, quelques annulations et un relevé d'opérateur qui porte chaque vente
 * mobile. Reproductible : la même graine donne les mêmes données.
 */
export function peuplerMois(
  m: Magasins,
  compagnieId: string,
  mois: string,
  options: { jours?: number; parJour?: number; graine?: number } = {},
): Resume {
  const alea = graine(options.graine ?? 7);
  const jours = options.jours ?? 28;
  const parJour = options.parJour ?? 6;
  const ventes: VenteComptable[] = [];
  const sessions: SessionComptable[] = [];
  const parGuichet = new Map<string, SessionComptable>();

  for (let j = 1; j <= jours; j++) {
    const jour = `${mois}-${String(j).padStart(2, "0")}`;
    for (const g of GUICHETS) {
      const s = session({
        id: `s-${mois}-${j}-${g}`,
        numero: `K-AKW-${jour.replace(/-/g, "").slice(2)}-${g}-1`,
        guichet: g,
        agent: `Agent ${g}`,
        ouverteA: iso(jour, "05:30:00"),
        clotureeA: iso(jour, "18:00:00"),
        ecart: Math.round((alea() - 0.5) * 4) * 500,
      });
      sessions.push(s);
      parGuichet.set(`${j}-${g}`, s);
    }
    for (let k = 0; k < parJour; k++) {
      const tirage = alea();
      const moyen: MoyenEncaissement =
        tirage < 0.55 ? "cash" : tirage < 0.8 ? "mtn" : tirage < 0.95 ? "orange" : "carte";
      const enLigne = moyen !== "cash" && alea() < 0.4;
      const guichet = enLigne
        ? EN_LIGNE[Math.floor(alea() * EN_LIGNE.length)]!
        : GUICHETS[Math.floor(alea() * GUICHETS.length)]!;
      const colis = alea() < 0.2;
      const heure = `${String(6 + Math.floor(alea() * 12)).padStart(2, "0")}:${String(
        Math.floor(alea() * 60),
      ).padStart(2, "0")}:00`;
      const prix = colis
        ? 1000 * (1 + Math.floor(alea() * 4))
        : [3500, 5000, 7500][Math.floor(alea() * 3)]!;
      const sessionId = enLigne ? null : parGuichet.get(`${j}-${guichet}`)!.id;
      const annulee = !colis && alea() < 0.04;
      ventes.push(
        vente({
          id: `v-${mois}-${j}-${k}`,
          genre: colis ? "colis" : "billet",
          numero: `${colis ? "C" : "A"}-ALP-${jour.replace(/-/g, "").slice(2)}-${String(k).padStart(4, "0")}`,
          at: iso(jour, heure),
          ligne: colis ? "COLIS" : "DLA-YDE",
          depart: colis ? null : "09:00",
          siege: colis ? null : String(1 + Math.floor(alea() * 40)),
          classe: colis ? `${1 + Math.floor(alea() * 5)} kg` : alea() < 0.3 ? "VIP" : "CLASSIQUE",
          prix,
          moyen,
          guichet,
          agent: enLigne ? null : AGENTS[guichet as (typeof GUICHETS)[number]],
          sessionId,
          referenceOperateur:
            moyen === "cash" || moyen === "carte"
              ? null
              : `${moyen === "orange" ? "OM" : "MP"}${jour.replace(/-/g, "").slice(2)}.${heure.slice(0, 2)}${heure.slice(3, 5)}.${j}${k}Z${Math.floor(alea() * 90000 + 10000)}`,
          annuleeA: annulee ? iso(jour, "20:00:00") : null,
        }),
      );
    }
  }

  m.ventes.ajouter(compagnieId, ...ventes);
  m.sessions.ajouter(compagnieId, ...sessions);
  // Le relevé de l'opérateur porte chaque vente mobile (annulée ou non : l'argent est entré).
  m.releves.ajouter(
    compagnieId,
    ...ventes
      .filter((v) => v.referenceOperateur !== null)
      .map((v) =>
        ligneReleve({
          reference: v.referenceOperateur!,
          recueA: v.at,
          operateur: v.moyen === "orange" ? "orange" : "mtn",
          montant: v.prix,
          telephone: "+237670000000",
        }),
      ),
  );
  return { ventes, sessions };
}

/**
 * Les quatre transactions de la planche ComptableRapprochement, avec les faits qui désignent leur cause :
 * doublon, expiration, colis sans dépôt, inconnue. 16 000 F au total.
 */
export function ajouterOrphelines(m: Magasins, compagnieId: string, mois: string): void {
  const j = (d: string) => `${mois}-${d}`;
  m.releves.ajouter(
    compagnieId,
    ligneReleve({
      reference: ORPHELINES.doublon,
      recueA: iso(j("03"), "11:42:00"),
      telephone: TELEPHONES.doublon,
      operateur: "mtn",
      montant: 4000,
    }),
    ligneReleve({
      reference: ORPHELINES.expiration,
      recueA: iso(j("09"), "06:58:00"),
      telephone: TELEPHONES.expiration,
      operateur: "orange",
      montant: 4000,
    }),
    ligneReleve({
      reference: ORPHELINES.colis,
      recueA: iso(j("17"), "19:30:00"),
      telephone: TELEPHONES.colis,
      operateur: "mtn",
      montant: 5000,
    }),
    ligneReleve({
      reference: ORPHELINES.inconnue,
      recueA: iso(j("28"), "14:05:00"),
      telephone: TELEPHONES.inconnue,
      operateur: "orange",
      montant: 3000,
    }),
  );
  // 1. Le billet DLA -> BAF de 10:00 déjà payé 40 secondes plus tôt avec le même numéro.
  m.faits.ventes.set(TELEPHONES.doublon, [
    {
      numero: "A-ALP-DOUBLON",
      genre: "billet",
      at: iso(j("03"), "11:41:20"),
      montant: 4000,
      ligne: "DLA-BAF",
      depart: "10:00",
      referenceOperateur: "MP261203.1141.A71000",
      canal: "en_ligne",
    },
  ]);
  // 2. Le siège a expiré à 06:41, le client a repayé au guichet à 06:50.
  m.faits.expires.set(TELEPHONES.expiration, [
    { expireA: iso(j("09"), "06:41:00"), montant: 4000, ligne: "DLA-YDE", depart: "07:00" },
  ]);
  m.faits.ventes.set(TELEPHONES.expiration, [
    {
      numero: "A-ALP-REPAYE",
      genre: "billet",
      at: iso(j("09"), "06:50:00"),
      montant: 4000,
      ligne: "DLA-YDE",
      depart: "07:00",
      referenceOperateur: null,
      canal: "guichet",
    },
  ]);
  // 3. Un colis payé à l'arrivée au relais Bonabéri, sans scan de dépôt.
  m.faits.colis.set(TELEPHONES.colis, [
    { numero: COLIS_A_RATTACHER, montant: 5000, relais: "Bonabéri" },
  ]);
  // 4. Le dernier numéro n'est connu de personne.
}

/** Une horloge qu'on règle à la main. */
export class HorlogeDeTest extends Horloge {
  constructor(public instant: Date) {
    super();
  }

  maintenant(): Date {
    return new Date(this.instant);
  }
}

/** Les ports en mémoire et le chargeur de mois, sans Nest : de quoi tester les exports d'un mois. */
export function creerMonde(instant = new Date("2027-01-05T08:12:00.000Z")) {
  const ventes = new VentesMemoire();
  const sessions = new SessionsMemoire();
  const annulations = new AnnulationsMemoire();
  const releves = new RelevesMemoire();
  const faits = new FaitsMemoire();
  const facturesPayees = new FacturesPayeesMemoire();
  const parametres = new ParametresMemoire();
  const clotures = new ClotureMemoire();
  const decisions = new DecisionsMemoire(clotures);
  const horloge = new HorlogeDeTest(instant);
  const chargeur = new ChargeurMois(
    ventes,
    sessions,
    annulations,
    releves,
    faits,
    facturesPayees,
    parametres,
    decisions,
    horloge,
  );
  parametres.definir({
    compagnieId: AGENCE,
    nomAgence: "Alpha Voyages",
    emailCabinet: "cabinet@compta-douala.cm",
    envoiAutomatique: true,
    jourDEnvoi: 2,
    jourDeCloture: 5,
  });
  return {
    ventes,
    sessions,
    annulations,
    releves,
    faits,
    facturesPayees,
    parametres,
    clotures,
    decisions,
    horloge,
    chargeur,
  };
}
