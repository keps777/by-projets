import type { ReactNode } from "react";
import type { ModuleId } from "./modules";
import { PLANCHES, analyserRoute, urlPlanche, type Planche } from "./planches";
import type { Espace } from "./roles";

/**
 * Barres d'onglets des maquettes (Main, Guichet, Superviseur, Patron : le `<nav>` du bas de chaque planche).
 * Les icônes sont celles des planches, au trait près ; le kit UI n'en a pas de plus proche.
 */
function icone(dessin: ReactNode) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {dessin}
    </svg>
  );
}

const ICONES = {
  bus: icone(
    <>
      <rect x="4" y="3" width="16" height="15" rx="3" />
      <path d="M4 11h16" />
      <path d="M7 18v3M17 18v3" />
    </>,
  ),
  colis: icone(
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>,
  ),
  covoit: icone(
    <>
      <path d="M5 17h14l-1.5-5h-11z" />
      <path d="M7 12l1.5-4h7L17 12" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>,
  ),
  moi: icone(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>,
  ),
  maison: icone(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  billet: icone(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M15 6v12" strokeDasharray="2 2" />
    </>,
  ),
  caisse: icone(
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  barres: icone(<path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />),
  tendance: icone(
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>,
  ),
  reglages: icone(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
    </>,
  ),
};

export interface OngletEspace {
  cle: string;
  /** Clé i18n du libellé, sous `navigation.<espace>`. */
  libelle: string;
  /** Planche vers laquelle mène l'onglet. */
  planche: Planche;
  icone: ReactNode;
  /** Module dont dépend l'entrée : masqué, l'onglet disparaît. */
  module?: ModuleId;
}

export interface BarreEspace {
  onglets: readonly OngletEspace[];
  /**
   * Écrans qui affichent la barre et onglet que chacun éclaire. Les autres écrans (vente, paiement, quai...)
   * n'ont pas de barre dans les maquettes : ils ont une action principale en pied d'écran.
   */
  ecrans: ReadonlyArray<readonly [Planche, string]>;
}

/** Les quatre barres. Un espace absent de la table (quai, bus, relais...) n'a pas de barre. */
export const BARRES: Partial<Record<Espace, BarreEspace>> = {
  voyageur: {
    onglets: [
      { cle: "voyager", libelle: "voyager", planche: "Main", icone: ICONES.bus },
      {
        cle: "colis",
        libelle: "colis",
        planche: "ColisEnvoi",
        icone: ICONES.colis,
        module: "colis",
      },
      {
        cle: "covoit",
        libelle: "covoit",
        planche: "Covoit",
        icone: ICONES.covoit,
        module: "covoit",
      },
      { cle: "moi", libelle: "moi", planche: "Moi", icone: ICONES.moi },
    ],
    ecrans: [
      ["Main", "voyager"],
      ["MainVille", "voyager"],
      ["MainFiltres", "voyager"],
      ["Arret", "voyager"],
      ["Pass", "voyager"],
      ["Direct", "voyager"],
      ["Reseau", "voyager"],
      ["ColisCode", "colis"],
      ["Covoit", "covoit"],
      ["CovoitVille", "covoit"],
      ["Moi", "moi"],
    ],
  },
  guichet: {
    onglets: [
      { cle: "guichet", libelle: "guichet", planche: "Guichet", icone: ICONES.maison },
      { cle: "vendre", libelle: "vendre", planche: "Vente", icone: ICONES.billet },
      {
        cle: "colis",
        libelle: "colis",
        planche: "GuichetColis",
        icone: ICONES.colis,
        module: "colis",
      },
      { cle: "quai", libelle: "quai", planche: "Quai", icone: ICONES.bus, module: "quai" },
      { cle: "caisse", libelle: "caisse", planche: "Caisse", icone: ICONES.caisse },
    ],
    ecrans: [["Guichet", "guichet"]],
  },
  superviseur: {
    onglets: [
      {
        cle: "gare",
        libelle: "gare",
        planche: "Superviseur",
        icone: ICONES.maison,
        module: "supervision",
      },
      { cle: "caisses", libelle: "caisses", planche: "Caisse", icone: ICONES.caisse },
      { cle: "quais", libelle: "quais", planche: "Quai", icone: ICONES.bus, module: "quai" },
      { cle: "patron", libelle: "patron", planche: "Patron", icone: ICONES.barres },
    ],
    ecrans: [["Superviseur", "gare"]],
  },
  patron: {
    onglets: [
      { cle: "aujourdhui", libelle: "aujourdhui", planche: "Patron", icone: ICONES.barres },
      { cle: "analyses", libelle: "analyses", planche: "Analyses", icone: ICONES.tendance },
      { cle: "gares", libelle: "gares", planche: "PatronEquipe", icone: ICONES.maison },
      { cle: "reglages", libelle: "reglages", planche: "Config", icone: ICONES.reglages },
    ],
    ecrans: [["Patron", "aujourdhui"]],
  },
};

/** Motif d'URL (`/billet/:billetId`) de l'écran d'une planche. */
export function motifPlanche(planche: Planche): string {
  return analyserRoute(PLANCHES[planche].route).url;
}

/** Destination d'un onglet : l'URL de sa planche (les segments dynamiques n'existent dans aucun onglet). */
export function hrefOnglet(onglet: OngletEspace): string {
  return urlPlanche(onglet.planche);
}
