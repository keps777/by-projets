import type { patron } from "@afrimove/contrats";
import { estHeureValide, normaliserHeure } from "./formats";

/**
 * Le brouillon de la ligne : ce que le patron a changé sur l'écran et qui n'est pas encore publié. Rien n'en sort
 * avant la signature par le PIN (`versModification`) : les guichets et l'app voyageur continuent de lire la ligne
 * publiée. Ces fonctions sont pures, l'écran ne fait que les appeler.
 */

type Ligne = patron.LigneEditable;
export type ClasseDepart = patron.DepartEditable["classe"];
export type JourSemaine = patron.DepartEditable["jours"][number];
export type ChampTarif = keyof patron.Tarifs;
export type OptionLigne = keyof patron.LigneEditable["options"];

export const CHAMPS_TARIF: readonly ChampTarif[] = ["classique", "vip", "bagage"];

export interface DepartBrouillon {
  /** Clé React stable : l'identifiant du départ, ou « nouveau-n » pour un départ ajouté sur l'écran. */
  cle: string;
  id: string | null;
  /** Ce qui est tapé dans le champ (pas forcément une heure valide pendant la frappe). */
  heure: string;
  /** Le départ tel que l'API le renvoie ; `null` pour un départ ajouté sur l'écran. */
  base: { heure: string; heureInitiale: string | null; actif: boolean } | null;
  classe: ClasseDepart;
  /** Vrai si le prix du départ est celui de la ligne (il suit alors le tarif quand on le change). */
  suitTarif: boolean;
  prix: number;
  actif: boolean;
  note: string | null;
  jours: JourSemaine[];
  nouveau: boolean;
}

export interface ArretBrouillon {
  cle: string;
  nom: string;
  /** `null` pour un arrêt ajouté sur l'écran : l'API calcule le prorata à la publication. */
  prorata: number | null;
  montee: boolean;
}

export type TarifsBrouillon = Record<ChampTarif, number | null>;

export interface Brouillon {
  departs: DepartBrouillon[];
  tarifs: TarifsBrouillon;
  arrets: ArretBrouillon[];
  options: patron.LigneEditable["options"];
}

/** Le brouillon de départ : la ligne telle que l'API la renvoie (avec ses modifications déjà en brouillon). */
export function brouillonDepuis(ligne: Ligne): Brouillon {
  return {
    departs: ligne.departs.map((d, rang) => ({
      cle: d.id ?? `depart-${rang}`,
      id: d.id,
      heure: d.heure,
      base: { heure: d.heure, heureInitiale: d.heureInitiale, actif: d.actif },
      classe: d.classe,
      suitTarif: d.prix === ligne.tarifs[d.classe],
      prix: d.prix,
      actif: d.actif,
      note: d.note,
      jours: [...d.jours],
      nouveau: d.nouveau,
    })),
    tarifs: { ...ligne.tarifs },
    arrets: ligne.arrets.map((a) => ({
      cle: `arret-${a.nom}`,
      nom: a.nom,
      prorata: a.prorata,
      montee: a.montee,
    })),
    options: { ...ligne.options },
  };
}

/* ----------------------------------------------------------------------- lecture d'un départ */

/** L'heure d'avant le changement (« était 10:00 »), `null` si le départ n'a pas bougé. */
export function heureInitiale(d: DepartBrouillon): string | null {
  if (d.base === null) return null;
  const heure = normaliserHeure(d.heure);
  if (heure === null || heure === d.base.heure) return d.base.heureInitiale;
  const avant = d.base.heureInitiale ?? d.base.heure;
  return avant === heure ? null : avant;
}

/** Un départ déplacé par rapport à l'heure publiée. */
export function estDeplace(d: DepartBrouillon): boolean {
  return !d.nouveau && heureInitiale(d) !== null;
}

/** Prix affiché pour un départ : celui de la ligne tant que le départ le suit. */
export function prixDepart(b: Brouillon, d: DepartBrouillon): number {
  return d.suitTarif ? (b.tarifs[d.classe] ?? d.prix) : d.prix;
}

/* ----------------------------------------------------------------------- modifications */

export function changerHeure(b: Brouillon, cle: string, heure: string): Brouillon {
  return { ...b, departs: b.departs.map((d) => (d.cle === cle ? { ...d, heure } : d)) };
}

export function basculerDepart(b: Brouillon, cle: string): Brouillon {
  return { ...b, departs: b.departs.map((d) => (d.cle === cle ? { ...d, actif: !d.actif } : d)) };
}

export function changerTarif(b: Brouillon, champ: ChampTarif, valeur: number | null): Brouillon {
  return { ...b, tarifs: { ...b.tarifs, [champ]: valeur } };
}

export function basculerOption(b: Brouillon, option: OptionLigne): Brouillon {
  return { ...b, options: { ...b.options, [option]: !b.options[option] } };
}

/** « + départ » : un départ classique de plus, au prix de la ligne, à régler (heure vide). */
export function ajouterDepart(b: Brouillon, rang: number): Brouillon {
  const depart: DepartBrouillon = {
    cle: `nouveau-${rang}`,
    id: null,
    heure: "",
    base: null,
    classe: "classique",
    suitTarif: true,
    prix: b.tarifs.classique ?? 0,
    actif: true,
    note: null,
    jours: [],
    nouveau: true,
  };
  return { ...b, departs: [...b.departs, depart] };
}

export type ErreurArret = "nom" | "existe";

/** Le nom d'un arrêt ajouté : non vide, et pas déjà sur la ligne. */
export function verifierArret(b: Brouillon, nom: string): ErreurArret | null {
  const net = nom.trim();
  if (net === "") return "nom";
  const existe = b.arrets.some((a) => a.nom.trim().toLowerCase() === net.toLowerCase());
  return existe ? "existe" : null;
}

export function ajouterArret(b: Brouillon, nom: string, montee: boolean, rang: number): Brouillon {
  return {
    ...b,
    arrets: [...b.arrets, { cle: `nouvel-arret-${rang}`, nom: nom.trim(), prorata: null, montee }],
  };
}

/* ----------------------------------------------------------------------- comptage et contrôle */

/** Les changements faits sur l'écran depuis la lecture de la ligne. */
export function changementsLocaux(b: Brouillon, ligne: Ligne): number {
  let n = 0;
  for (const d of b.departs) {
    if (d.base === null) n += 1;
    else if ((normaliserHeure(d.heure) ?? d.heure) !== d.base.heure || d.actif !== d.base.actif)
      n += 1;
  }
  for (const champ of CHAMPS_TARIF) if (b.tarifs[champ] !== ligne.tarifs[champ]) n += 1;
  n += b.arrets.filter((a) => a.prorata === null).length;
  for (const option of ["venteEnLigne", "fusionAuto"] as const) {
    if (b.options[option] !== ligne.options[option]) n += 1;
  }
  return n;
}

/** Les changements à publier : ceux déjà en brouillon côté API, plus ceux de l'écran (« 2 changements »). */
export function nombreChangements(b: Brouillon, ligne: Ligne): number {
  return ligne.brouillon.modifications + changementsLocaux(b, ligne);
}

export interface Erreurs {
  /** Départs dont l'heure n'est pas une heure (« 25:70 », vide). */
  departs: string[];
  /** Tarifs laissés vides. */
  tarifs: ChampTarif[];
}

export function erreursDuBrouillon(b: Brouillon): Erreurs {
  return {
    departs: b.departs
      .filter((d) => !estHeureValide(normaliserHeure(d.heure) ?? d.heure))
      .map((d) => d.cle),
    tarifs: CHAMPS_TARIF.filter((champ) => b.tarifs[champ] === null),
  };
}

export function estPubliable(erreurs: Erreurs): boolean {
  return erreurs.departs.length === 0 && erreurs.tarifs.length === 0;
}

/* ----------------------------------------------------------------------- publication */

/**
 * Le corps de la publication (`useModifierLigne`). Les heures sont normalisées (« 9:15 » -> « 09:15 »), le plan de
 * sièges est celui de la ligne (il se modifie sur sa propre planche), le prorata des arrêts est calculé par l'API.
 * À n'appeler que si `estPubliable`.
 */
export function versModification(
  b: Brouillon,
  ligne: Ligne,
  signature: patron.SignaturePin,
  effetDu: string,
): patron.ModifierLigne {
  return {
    ligneId: ligne.id,
    departs: b.departs.map((d) => ({
      id: d.id,
      heure: normaliserHeure(d.heure) ?? d.heure,
      heureInitiale: heureInitiale(d),
      classe: d.classe,
      prix: prixDepart(b, d),
      actif: d.actif,
      note: d.note,
      jours: d.jours,
      nouveau: d.nouveau,
    })),
    tarifs: {
      classique: b.tarifs.classique ?? ligne.tarifs.classique,
      vip: b.tarifs.vip ?? ligne.tarifs.vip,
      bagage: b.tarifs.bagage ?? ligne.tarifs.bagage,
    },
    arrets: b.arrets.map((a) => ({ nom: a.nom, montee: a.montee })),
    plan: ligne.plan,
    options: b.options,
    effetDu,
    signature,
  };
}
