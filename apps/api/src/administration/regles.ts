import { prixProrata } from "../billetterie/regles";
import {
  JOURS,
  type ArretLigne,
  type EtatLigne,
  type GareAdmin,
  type HoraireModifie,
  type Jour,
  type PlanLigne,
} from "./modeles";

/**
 * Règles pures de l'administration : calendrier des départs récurrents, arrêts et prix au prorata,
 * fusion des modifications d'une ligne, chevauchement des équipages. Aucune lecture de base ici.
 */

/** Durée supposée d'un trajet dont la ligne n'a pas de durée renseignée. */
export const DUREE_PAR_DEFAUT_MINUTES = 240;
/** Distance entre deux arrêts d'une ligne sans kilomètres connus (le contrat de création n'en porte pas). */
export const KM_PAR_TRONCON_INCONNU = 100;
/** Au plus soixante-deux jours de départs générés en une fois. */
export const JOURS_GENERES_MAX = 62;

/* ------------------------------------------------------------------ calendrier */

const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Un jour AAAA-MM-JJ qui existe au calendrier (pas de 31 février). */
export function jourValide(jour: string): boolean {
  const m = JOUR.exec(jour);
  if (!m) return false;
  const [annee, mois, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, j));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === j;
}

const NOMS_JOURS: readonly Jour[] = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export function jourSemaine(jour: string): Jour {
  const m = JOUR.exec(jour);
  if (!m) throw new RangeError(`Jour invalide : ${jour}`);
  return NOMS_JOURS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]!;
}

export function ajouterJours(jour: string, n: number): string {
  const m = JOUR.exec(jour);
  if (!m) throw new RangeError(`Jour invalide : ${jour}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/** Tous les jours de `du` à `au` inclus. */
export function joursEntre(du: string, au: string): string[] {
  const jours: string[] = [];
  for (let j = du; j <= au; j = ajouterJours(j, 1)) jours.push(j);
  return jours;
}

/** L'instant d'un horaire un jour donné, en ISO de Douala. */
export function heureDepartIso(jour: string, heure: string): string {
  return `${jour}T${heure}:00.000+01:00`;
}

/** Un horaire circule-t-il ce jour-là ? (`jours` vide = tous les jours.) */
export function circuleLe(jours: readonly Jour[], jour: string): boolean {
  return jours.length === 0 || jours.includes(jourSemaine(jour));
}

/** AGENCE-LIGNE-AAMMJJ-HHMM, à partir d'un ISO de Douala (le code de ligne perd son tiret éventuel). */
export function numeroDepart(agence: string, ligneCode: string, iso: string): string {
  const aammjj = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  const hhmm = `${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  return `${agence}-${ligneCode.replace(/-/g, "")}-${aammjj}-${hhmm}`;
}

/** Instant (ms) d'un ISO de Douala. */
export const instantMs = (iso: string): number => Date.parse(iso);

/* ------------------------------------------------------------------ lignes */

export const nomDeLigne = (
  origine: Pick<GareAdmin, "ville">,
  destination: Pick<GareAdmin, "ville">,
) => `${origine.ville} → ${destination.ville}`;

export const codeDeLigne = (
  origine: Pick<GareAdmin, "code">,
  destination: Pick<GareAdmin, "code">,
) => `${origine.code}${destination.code}`;

/** Plan par défaut d'une ligne dont on ne connaît que la capacité : 2 + couloir + 2. */
export function planParDefaut(capacite: number): PlanLigne {
  return { capacite, disposition: "2+2", rangees: Math.ceil(capacite / 4) };
}

const clefNom = (nom: string): string => nom.trim().toLocaleLowerCase("fr");

/**
 * Les arrêts d'une ligne, origine et terminus compris, avec leurs kilomètres.
 *
 * Un arrêt déjà connu garde ses kilomètres. Un nouvel arrêt se place entre ses voisins connus, au prorata de
 * son rang ; une ligne sans aucune distance connue (le contrat de création n'en porte pas) reçoit
 * `KM_PAR_TRONCON_INCONNU` par tronçon, donc des prix de tronçon proportionnels au nombre d'arrêts. Les
 * kilomètres sont toujours croissants.
 */
export function disposerArrets(
  existants: readonly ArretLigne[],
  souhaites: readonly { nom: string; montee: boolean }[],
  origineNom: string,
  terminusNom: string,
): ArretLigne[] {
  const origine: ArretLigne =
    existants.length > 0
      ? { ...existants[0]!, kmDepuisOrigine: 0 }
      : { nom: origineNom, kmDepuisOrigine: 0, montee: true };
  const terminusExistant = existants.length >= 2 ? existants[existants.length - 1]! : null;
  const connus = new Map<string, number>();
  for (const a of existants.slice(1, -1)) connus.set(clefNom(a.nom), a.kmDepuisOrigine);

  const brut = souhaites.map((s) => connus.get(clefNom(s.nom)) ?? null);
  const croissants = brut.every(
    (km, i) => km === null || (km > 0 && brut.slice(0, i).every((p) => p === null || p < km)),
  );
  const kms: (number | null)[] = croissants ? brut : brut.map(() => null);
  const nbInconnus = kms.filter((k) => k === null).length;

  let kmTerminus = terminusExistant?.kmDepuisOrigine ?? 0;
  const plusGrandConnu = Math.max(0, ...kms.filter((k): k is number => k !== null));
  if (kmTerminus <= plusGrandConnu) {
    kmTerminus =
      nbInconnus === souhaites.length && !terminusExistant
        ? KM_PAR_TRONCON_INCONNU * (souhaites.length + 1)
        : plusGrandConnu + KM_PAR_TRONCON_INCONNU;
  }

  const intermediaires: ArretLigne[] = [];
  let i = 0;
  while (i < souhaites.length) {
    if (kms[i] !== null) {
      intermediaires.push({
        nom: souhaites[i]!.nom.trim(),
        kmDepuisOrigine: kms[i]!,
        montee: souhaites[i]!.montee,
      });
      i += 1;
      continue;
    }
    // Une suite d'arrêts inconnus entre deux repères : répartis régulièrement.
    let fin = i;
    while (fin < souhaites.length && kms[fin] === null) fin += 1;
    const avant = i === 0 ? 0 : kms[i - 1]!;
    const apres = fin === souhaites.length ? kmTerminus : kms[fin]!;
    const n = fin - i;
    for (let k = 0; k < n; k++) {
      let km = Math.round(avant + ((apres - avant) * (k + 1)) / (n + 1));
      const precedent =
        intermediaires.length > 0 ? intermediaires[intermediaires.length - 1]!.kmDepuisOrigine : 0;
      if (km <= precedent) km = precedent + 1;
      intermediaires.push({
        nom: souhaites[i + k]!.nom.trim(),
        kmDepuisOrigine: km,
        montee: souhaites[i + k]!.montee,
      });
    }
    i = fin;
  }
  const dernier =
    intermediaires.length > 0 ? intermediaires[intermediaires.length - 1]!.kmDepuisOrigine : 0;
  const terminus: ArretLigne = {
    nom: terminusExistant?.nom ?? terminusNom,
    kmDepuisOrigine: Math.max(kmTerminus, dernier + 1),
    montee: false,
  };
  return [origine, ...intermediaires, terminus];
}

/** Prix d'un arrêt depuis l'origine (tarif classique, au prorata des kilomètres, multiple de 100 F). */
export function prorataDe(
  arrets: readonly ArretLigne[],
  rang: number,
  tarifComplet: number,
): number {
  const kmTotal = arrets.length > 0 ? arrets[arrets.length - 1]!.kmDepuisOrigine : 0;
  if (rang <= 0 || rang >= arrets.length || kmTotal <= 0) return 0;
  return prixProrata({
    arrets: arrets.map((a, k) => ({ id: String(k), kmDepuisOrigine: a.kmDepuisOrigine })),
    prixTrajetComplet: tarifComplet,
    depuisArretId: "0",
    versArretId: String(rang),
  });
}

/* ------------------------------------------------------------------ modifications d'une ligne */

export function fusionner(base: EtatLigne, sections: Partial<EtatLigne> | null): EtatLigne {
  return sections ? { ...base, ...sections } : base;
}

const memeHoraire = (a: HoraireModifie, b: HoraireModifie): boolean =>
  a.heure === b.heure &&
  a.classe === b.classe &&
  a.actif === b.actif &&
  a.note === b.note &&
  JSON.stringify([...a.jours].sort()) === JSON.stringify([...b.jours].sort());

/** Nombre de changements entre deux états, comme les compte « Publier (6 changements) ». */
export function compterModifications(base: EtatLigne, cible: EtatLigne): number {
  let n = 0;
  for (const cle of ["classique", "vip", "bagage"] as const) {
    if (base.tarifs[cle] !== cible.tarifs[cle]) n += 1;
  }
  if (JSON.stringify(base.arrets) !== JSON.stringify(cible.arrets)) n += 1;
  const avant = new Map(base.horaires.filter((h) => h.id !== null).map((h) => [h.id!, h]));
  const gardes = new Set<string>();
  for (const h of cible.horaires) {
    if (h.id === null) n += 1;
    else {
      gardes.add(h.id);
      const ancien = avant.get(h.id);
      if (!ancien || !memeHoraire(ancien, h)) n += 1;
    }
  }
  for (const id of avant.keys()) if (!gardes.has(id)) n += 1;
  if (JSON.stringify(base.plan) !== JSON.stringify(cible.plan)) n += 1;
  if (base.options.venteEnLigne !== cible.options.venteEnLigne) n += 1;
  if (base.options.fusionAuto !== cible.options.fusionAuto) n += 1;
  return n;
}

export interface ErreurEtat {
  code: "ARRET_EN_DOUBLE" | "HORAIRE_EN_DOUBLE" | "PLAN_INCOHERENT";
  message: string;
}

/** Cohérence d'un état voulu ; `null` s'il est valable. */
export function controlerEtat(etat: EtatLigne): ErreurEtat | null {
  const noms = new Set<string>();
  for (const a of etat.arrets) {
    const cle = clefNom(a.nom);
    if (noms.has(cle)) {
      return { code: "ARRET_EN_DOUBLE", message: `L'arrêt « ${a.nom.trim()} » figure deux fois` };
    }
    noms.add(cle);
  }
  const heures = new Set<string>();
  for (const h of etat.horaires) {
    if (!h.actif) continue;
    if (heures.has(h.heure)) {
      return {
        code: "HORAIRE_EN_DOUBLE",
        message: `Deux départs actifs à ${h.heure} sur cette ligne : un seul par heure`,
      };
    }
    heures.add(h.heure);
  }
  const parRangee = etat.plan.disposition.split("+").reduce((somme, n) => somme + Number(n), 0);
  if (parRangee * etat.plan.rangees < etat.plan.capacite) {
    return {
      code: "PLAN_INCOHERENT",
      message: `${etat.plan.rangees} rangées de ${etat.plan.disposition} ne portent pas ${etat.plan.capacite} places`,
    };
  }
  return null;
}

/** Jours dans l'ordre de la semaine, sans doublon. */
export function joursTries(jours: readonly Jour[]): Jour[] {
  return JOURS.filter((j) => jours.includes(j));
}

/* ------------------------------------------------------------------ équipages */

/** Deux trajets se chevauchent-ils ? (début inclus, fin exclue.) */
export function seChevauchent(
  a: { debutMs: number; dureeMinutes: number },
  b: { debutMs: number; dureeMinutes: number },
): boolean {
  const finA = a.debutMs + a.dureeMinutes * 60_000;
  const finB = b.debutMs + b.dureeMinutes * 60_000;
  return a.debutMs < finB && b.debutMs < finA;
}

export const dureeEffective = (dureeMinutes: number): number =>
  dureeMinutes > 0 ? dureeMinutes : DUREE_PAR_DEFAUT_MINUTES;

/** Départs qui ne retiennent plus ni bus ni équipage (un départ « parti » les retient jusqu'à son arrivée). */
export const ETATS_LIBERANT = ["arrive", "annule", "fusionne"] as const;
/** Départs dont on peut encore changer l'équipage. */
export const ETATS_MODIFIABLES = ["programme", "en_vente", "embarquement", "retarde"] as const;

/** Un départ vu sous l'angle des ressources qu'il retient. */
export interface OccupationDepart {
  numero: string;
  debutMs: number;
  dureeMinutes: number;
  busId: string | null;
  chauffeurId: string | null;
  convoyeurId: string | null;
}

/**
 * Le premier bus, chauffeur ou convoyeur de `candidat` déjà retenu par un autre départ qui chevauche le sien.
 * `autres` ne contient que des départs qui retiennent encore leurs ressources (voir `ETATS_LIBERANT`).
 */
export function chercherConflit(
  candidat: OccupationDepart,
  autres: readonly OccupationDepart[],
): { ressource: "bus" | "chauffeur" | "convoyeur"; departNumero: string } | null {
  const ressources = [
    ["bus", "busId"],
    ["chauffeur", "chauffeurId"],
    ["convoyeur", "convoyeurId"],
  ] as const;
  for (const [ressource, cle] of ressources) {
    const valeur = candidat[cle];
    if (valeur === null) continue;
    const autre = autres.find(
      (o) => o.numero !== candidat.numero && o[cle] === valeur && seChevauchent(candidat, o),
    );
    if (autre) return { ressource, departNumero: autre.numero };
  }
  return null;
}
