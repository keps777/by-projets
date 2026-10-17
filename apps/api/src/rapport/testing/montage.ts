import { AuditService } from "../../socle/audit/audit.service";
import { configTest } from "../../socle/testing/app-test";
import { AuditMemoire, HorlogeFixe } from "../../socle/testing/memoire";
import { CollecteRapportService } from "../collecte.service";
import { chargerConfigRapport, type ConfigRapport } from "../config";
import type {
  BilletVendu,
  CaisseDuJour,
  ColisEnregistre,
  DepartDuJour,
  GareRapport,
} from "../modele";
import {
  ActiviteColisMemoire,
  AnnulationsMemoire,
  CaissesMemoire,
  ControlesMemoire,
  DepartsMemoire,
  RapportsSoirMemoire,
  ReferentielMemoire,
  TrousMemoire,
  VentesBilletsMemoire,
} from "../memoire";
import { AssistantRapport, AssistantRapportAucun } from "../ports";
import { PlanificateurRapport } from "../planificateur";
import { RapportSoirService } from "../rapport.service";

/** Mardi 5 janvier 2027. */
export const JOUR = "2027-01-05";
export const VEILLE = "2027-01-04";
/** Le même jour à 08:00 à Douala (07:00 UTC). */
export const MATIN = new Date("2027-01-05T07:00:00.000Z");
/** Le même jour à 21:00 à Douala (20:00 UTC). */
export const VINGT_ET_UNE_HEURES = new Date("2027-01-05T20:00:00.000Z");

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const AKWA = "00000000-0000-4000-8000-0000000000a1";
export const MVAN = "00000000-0000-4000-8000-0000000000a2";
export const BAFOUSSAM = "00000000-0000-4000-8000-0000000000a3";
export const GARE_AUTRE = "00000000-0000-4000-8000-0000000000b1";

export const GARES: GareRapport[] = [
  { id: AKWA, nom: "Akwa" },
  { id: MVAN, nom: "Mvan" },
  { id: BAFOUSSAM, nom: "Bafoussam" },
];

/** Le nom de la compagnie de la planche (« le 09:30 Oméga part à 55 % »). */
export const NOM_COMPAGNIE = "Oméga";

export interface OptionsMontage {
  env?: Record<string, string>;
  assistant?: AssistantRapport;
}

/**
 * Assemble le rapport sans Nest ni HTTP : horloge réglable, ports en mémoire (que les tests
 * remplissent), vrai service d'audit sur un journal en mémoire.
 */
export function monterRapport(options: OptionsMontage = {}) {
  const horloge = new HorlogeFixe(MATIN);
  const config: ConfigRapport = chargerConfigRapport({
    NODE_ENV: "test",
    RAPPORT_PLANIFICATEUR_MS: "0",
    ...options.env,
  });
  const auditRepo = new AuditMemoire();
  const audit = new AuditService(auditRepo, configTest());

  const referentiel = new ReferentielMemoire()
    .ajouter({ id: COMPAGNIE, nom: NOM_COMPAGNIE }, GARES)
    .ajouter({ id: AUTRE_COMPAGNIE, nom: "Beta Express" }, [{ id: GARE_AUTRE, nom: "Bonabéri" }]);
  const ventes = new VentesBilletsMemoire();
  const departs = new DepartsMemoire();
  const colis = new ActiviteColisMemoire();
  const caisses = new CaissesMemoire();
  const annulations = new AnnulationsMemoire();
  const trous = new TrousMemoire();
  const controles = new ControlesMemoire();
  const assistant = options.assistant ?? new AssistantRapportAucun();
  const rapports = new RapportsSoirMemoire();

  const collecte = new CollecteRapportService(
    referentiel,
    ventes,
    departs,
    colis,
    caisses,
    annulations,
    trous,
    controles,
    assistant,
  );
  const service = new RapportSoirService(referentiel, collecte, rapports, audit, horloge, config);
  const planificateur = new PlanificateurRapport(service, horloge, config);

  return {
    horloge,
    config,
    audit,
    auditRepo,
    referentiel,
    ventes,
    departs,
    colis,
    caisses,
    annulations,
    trous,
    controles,
    assistant,
    rapports,
    collecte,
    service,
    planificateur,
    /** Avance l'horloge jusqu'à l'instant donné. */
    allerA(instant: Date): void {
      horloge.avancer(instant.getTime() - horloge.maintenant().getTime());
    },
  };
}

export type MontageRapport = ReturnType<typeof monterRapport>;

/* ------------------------------------------------------------------ fabriques de faits */

let compteur = 0;
const id = (prefixe: string): string => `${prefixe}-${String(++compteur).padStart(5, "0")}`;

/** `2027-01-05T09:30:00.000+01:00` */
export const instant = (hhmm: string, jour = JOUR): string => `${jour}T${hhmm}:00.000+01:00`;

export function billet(partiel: Partial<BilletVendu> = {}): BilletVendu {
  const n = id("b");
  return {
    id: n,
    numero: `OME-DLA-270105-${n.slice(-4)}`,
    gareId: AKWA,
    canal: "guichet",
    mode: "cash",
    montant: 3_500,
    venduA: instant("10:00"),
    etat: "paye",
    reporteDe: null,
    aCompleterAuQuai: false,
    sansNom: false,
    embarque: true,
    departParti: true,
    ...partiel,
  };
}

export function colis(partiel: Partial<ColisEnregistre> = {}): ColisEnregistre {
  const n = id("c");
  return {
    id: n,
    numero: `C-DLA-270105-${n.slice(-4)}`,
    gareId: AKWA,
    montant: 2_500,
    mode: "cash",
    creeA: instant("11:00"),
    ...partiel,
  };
}

export function caisse(partiel: Partial<CaisseDuJour> = {}): CaisseDuJour {
  const n = id("k");
  return {
    sessionId: n,
    numero: `K-DLA-270105-1-${n.slice(-1)}`,
    gareId: AKWA,
    guichetRang: 1,
    etat: "validee",
    ecart: 0,
    comptageAbsent: false,
    validation: { superviseurId: "sup-essono", superviseurNom: "Essono", at: instant("19:00") },
    ...partiel,
  };
}

export function depart(partiel: Partial<DepartDuJour> = {}): DepartDuJour {
  return {
    departId: id("d"),
    gareId: AKWA,
    heure: "08:30",
    etat: "parti",
    capacite: 40,
    vendus: 35,
    fusionneAvec: null,
    soutePleine: false,
    ...partiel,
  };
}

/* ------------------------------------------------------------------ la planche RapportSoir */

/**
 * Les chiffres de la planche « RapportSoir » reconstitués à partir de faits : 1 004 billets
 * (Akwa 491, Mvan 338, Bafoussam 175) dont 61 en ligne et 23 vendus par les convoyeurs, 312 colis,
 * 4 410 000 F de recette dont 2 900 000 F en cash, 947 billets la veille, un guichet d'Akwa à
 * − 1 000 F validé par Essono, un départ fusionné à Mvan, la soute pleine à Bafoussam, 5
 * annulations à PIN (20 000 F), un contrôle à Edéa, 10 départs dont le 09:30 à 55 %.
 */
export function peuplerPlanche(m: MontageRapport): void {
  const billets: BilletVendu[] = [];
  const PRIX_BAS = 3_500;
  const PRIX_HAUT = 3_700;
  const NB_PRIX_BAS = 424;
  const CASH_BAS = 284;
  const CASH_HAUT = 380;
  let cashBas = 0;
  let cashHaut = 0;
  for (let i = 0; i < 1004; i++) {
    const bas = i < NB_PRIX_BAS;
    const cash = bas ? cashBas++ < CASH_BAS : cashHaut++ < CASH_HAUT;
    const gareId = i < 491 ? AKWA : i < 491 + 338 ? MVAN : BAFOUSSAM;
    const heure = `${String(6 + (i % 14)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`;
    billets.push(
      billet({
        gareId,
        mode: cash ? "cash" : i % 2 === 0 ? "momo" : "orange_money",
        montant: bas ? PRIX_BAS : PRIX_HAUT,
        venduA: instant(heure),
      }),
    );
  }
  // 61 ventes en ligne parmi les paiements mobiles, 23 ventes de convoyeurs parmi les paiements cash.
  billets
    .filter((b) => b.mode !== "cash")
    .slice(-61)
    .forEach((b) => (b.canal = "en_ligne"));
  billets
    .filter((b) => b.mode === "cash")
    .slice(0, 23)
    .forEach((b) => (b.canal = "convoyeur"));
  m.ventes.ajouter(COMPAGNIE, ...billets);

  // La veille : 947 billets.
  const veille = Array.from({ length: 947 }, () => billet({ venduA: instant("12:00", VEILLE) }));
  m.ventes.ajouter(COMPAGNIE, ...veille);

  // 312 colis à 2 500 F, 200 payés en cash.
  m.colis.ajouter(
    COMPAGNIE,
    ...Array.from({ length: 312 }, (_, i) =>
      colis({
        gareId: i < 150 ? AKWA : i < 260 ? MVAN : BAFOUSSAM,
        mode: i < 200 ? "cash" : "momo",
      }),
    ),
  );
  m.colis.definirLitiges(COMPAGNIE, JOUR, 0);

  // Caisses : trois guichets à Akwa (le 2 à − 1 000 F, validé par Essono), deux à Mvan, un à Bafoussam.
  const valide = (superviseurId: string, superviseurNom: string) => ({
    superviseurId,
    superviseurNom,
    at: instant("19:30"),
  });
  m.caisses.ajouter(
    COMPAGNIE,
    JOUR,
    caisse({ gareId: AKWA, guichetRang: 1, ecart: 0, validation: valide("sup-essono", "Essono") }),
    caisse({
      gareId: AKWA,
      guichetRang: 2,
      ecart: -1_000,
      validation: valide("sup-essono", "Essono"),
    }),
    caisse({ gareId: AKWA, guichetRang: 3, ecart: 0, validation: valide("sup-essono", "Essono") }),
    caisse({
      gareId: MVAN,
      guichetRang: 1,
      ecart: 0,
      validation: valide("sup-tchinda", "Tchinda"),
    }),
    caisse({
      gareId: MVAN,
      guichetRang: 2,
      ecart: 0,
      validation: valide("sup-tchinda", "Tchinda"),
    }),
    caisse({
      gareId: BAFOUSSAM,
      guichetRang: 1,
      ecart: 0,
      validation: valide("sup-fosso", "Fosso"),
    }),
  );

  // Départs : dix à 40 places, 336 places prises (84 %), le 09:30 à 22/40 (55 %).
  m.departs.ajouter(
    COMPAGNIE,
    JOUR,
    depart({ gareId: AKWA, heure: "09:30", vendus: 22 }),
    depart({ gareId: AKWA, heure: "08:30", vendus: 35 }),
    depart({ gareId: AKWA, heure: "11:00", vendus: 35 }),
    depart({ gareId: AKWA, heure: "14:30", vendus: 35 }),
    depart({ gareId: AKWA, heure: "17:00", vendus: 35 }),
    depart({ gareId: MVAN, heure: "08:00", vendus: 35 }),
    depart({ gareId: MVAN, heure: "16:00", etat: "fusionne", fusionneAvec: "16:30", vendus: 0 }),
    depart({ gareId: MVAN, heure: "16:30", vendus: 35 }),
    depart({ gareId: MVAN, heure: "18:00", vendus: 35 }),
    depart({ gareId: BAFOUSSAM, heure: "10:00", vendus: 35, soutePleine: true }),
    depart({ gareId: BAFOUSSAM, heure: "15:00", vendus: 34 }),
  );

  m.annulations.ajouter(
    COMPAGNIE,
    ...Array.from({ length: 5 }, () => ({
      billetId: id("annule"),
      numero: "OME-DLA-270105-0171",
      gareId: AKWA,
      montant: 4_000,
      avecPin: true,
      at: instant("14:00"),
    })),
  );

  m.controles.ajouter(COMPAGNIE, JOUR, {
    controleId: id("controle"),
    lieu: "Edéa",
    regularisations: 1,
    ventesNonEnregistrees: 0,
  });
}
