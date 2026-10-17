import {
  ETATS_BILLET,
  ETATS_COLIS,
  ETATS_DEPART,
  ETATS_SESSION,
  MACHINE_BILLET,
  MACHINE_COLIS,
  MACHINE_DEPART,
  MACHINE_SESSION,
  aammjjDouala,
  analyserNumeroBillet,
  analyserNumeroColis,
  estCodeBillet,
  estFcfa,
  hhmmDouala,
  peutAppliquer,
} from "@afrimove/domain";
import type {
  Appareil,
  Billet,
  Bus,
  Colis,
  Compagnie,
  DefinitionMachine,
  Depart,
  EntreeHistorique,
  Gare,
  Guichet,
  Id,
  Ligne,
  Module,
  Personne,
  PlanSieges,
  SessionCaisse,
} from "@afrimove/domain";

/**
 * Validation des objets de démonstration contre le domaine (AM-010). Le domaine est du TypeScript pur,
 * sans bibliothèque de schémas : on vérifie donc ici les invariants qu'il définit (formats de numéros,
 * machines d'états, entiers FCFA, codes, cohérence des références) et on renvoie la liste des
 * problèmes, jamais une exception partielle.
 */

export interface Entites {
  compagnies?: readonly Compagnie[];
  gares?: readonly Gare[];
  guichets?: readonly Guichet[];
  lignes?: readonly Ligne[];
  bus?: readonly Bus[];
  departs?: readonly Depart[];
  billets?: readonly Billet[];
  colis?: readonly Colis[];
  sessions?: readonly SessionCaisse[];
  /** Plan de sièges de chaque départ, par identifiant de départ. */
  plans?: Readonly<Record<Id, PlanSieges>>;
  personnes?: readonly Personne[];
  appareils?: readonly Appareil[];
  modules?: readonly Module[];
}

const ISO_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+01:00$/;
const CODE = /^[A-Z0-9]{2,8}$/;
const IMMATRICULATION = /^[A-Z]{2} \d{3} [A-Z]{2}$/;
const TELEPHONE = /^\+\d{8,15}$/;

/** Références déjà connues (le monde commun) et celles du scénario. */
export interface Registre {
  compagnies: ReadonlyMap<Id, Compagnie>;
  gares: ReadonlyMap<Id, Gare>;
  guichets: ReadonlyMap<Id, Guichet>;
  lignes: ReadonlyMap<Id, Ligne>;
  departs: ReadonlyMap<Id, Depart>;
}

function indexer<T extends { id: Id }>(...listes: (readonly T[] | undefined)[]): Map<Id, T> {
  const m = new Map<Id, T>();
  for (const liste of listes) for (const x of liste ?? []) m.set(x.id, x);
  return m;
}

export function registre(...sources: (Entites | undefined)[]): Registre {
  const s = sources.filter((x): x is Entites => x !== undefined);
  return {
    compagnies: indexer(...s.map((x) => x.compagnies)),
    gares: indexer(...s.map((x) => x.gares)),
    guichets: indexer(...s.map((x) => x.guichets)),
    lignes: indexer(...s.map((x) => x.lignes)),
    departs: indexer(...s.map((x) => x.departs)),
  };
}

function iso(valeur: string, nom: string, p: string[]): void {
  if (!ISO_DOUALA.test(valeur) || Number.isNaN(Date.parse(valeur))) {
    p.push(`${nom} : date ISO Africa/Douala attendue (+01:00), reçu « ${valeur} »`);
  }
}

function entier(valeur: number, nom: string, p: string[], min = 0): void {
  if (!estFcfa(valeur) || valeur < min) p.push(`${nom} : entier ≥ ${min} attendu, reçu ${valeur}`);
}

/** L'historique doit partir de l'état initial, enchaîner des transitions permises et finir à `etat`. */
function historique<E extends string, A extends string>(
  quoi: string,
  machine: DefinitionMachine<E, A>,
  etats: readonly string[],
  etat: E,
  h: readonly EntreeHistorique<E, A>[],
  p: string[],
): void {
  if (!etats.includes(etat)) p.push(`${quoi} : état inconnu « ${etat} »`);
  let courant: E = machine.initial;
  for (const e of h) {
    if (e.de !== courant) p.push(`${quoi} : l'historique saute de « ${courant} » à « ${e.de} »`);
    if (!peutAppliquer(machine, e.de, e.action)) {
      p.push(`${quoi} : transition interdite « ${e.action} » depuis « ${e.de} »`);
    } else if (machine.transitions[e.de]?.[e.action] !== e.vers) {
      p.push(`${quoi} : « ${e.action} » ne mène pas à « ${e.vers} »`);
    }
    iso(e.at, `${quoi} : historique`, p);
    courant = e.vers;
  }
  if (courant !== etat)
    p.push(`${quoi} : l'historique finit à « ${courant} », l'état est « ${etat} »`);
}

export function problemesCompagnie(c: Compagnie): string[] {
  const p: string[] = [];
  if (!CODE.test(c.code)) p.push(`compagnie ${c.id} : code invalide « ${c.code} »`);
  if (!c.nom.trim()) p.push(`compagnie ${c.id} : nom vide`);
  return p;
}

export function problemesGare(g: Gare, r: Registre): string[] {
  const p: string[] = [];
  if (!CODE.test(g.code)) p.push(`gare ${g.id} : code invalide « ${g.code} »`);
  if (!r.compagnies.has(g.compagnieId))
    p.push(`gare ${g.id} : compagnie inconnue ${g.compagnieId}`);
  return p;
}

export function problemesLigne(l: Ligne, r: Registre): string[] {
  const p: string[] = [];
  if (!CODE.test(l.code)) p.push(`ligne ${l.id} : code invalide « ${l.code} »`);
  if (!r.compagnies.has(l.compagnieId)) p.push(`ligne ${l.id} : compagnie inconnue`);
  const o = r.gares.get(l.origineGareId);
  const d = r.gares.get(l.destinationGareId);
  if (!o || !d) p.push(`ligne ${l.id} : gare d'origine ou de destination inconnue`);
  else if (l.code !== o.code + d.code)
    p.push(`ligne ${l.id} : le code ne correspond pas aux gares`);
  if (l.arrets.length < 2) p.push(`ligne ${l.id} : au moins deux arrêts`);
  l.arrets.forEach((a, i) => {
    if (i === 0 && a.kmDepuisOrigine !== 0) p.push(`ligne ${l.id} : le premier arrêt est à 0 km`);
    const avant = l.arrets[i - 1];
    if (avant && a.kmDepuisOrigine <= avant.kmDepuisOrigine) {
      p.push(`ligne ${l.id} : distances croissantes attendues (${a.nom})`);
    }
  });
  for (const [nom, v] of Object.entries(l.tarifs)) entier(v, `ligne ${l.id} : tarif ${nom}`, p);
  return p;
}

export function problemesBus(b: Bus): string[] {
  const p: string[] = [];
  if (!IMMATRICULATION.test(b.immatriculation)) {
    p.push(`bus ${b.id} : immatriculation invalide « ${b.immatriculation} »`);
  }
  entier(b.capacite, `bus ${b.id} : capacité`, p, 1);
  return p;
}

export function problemesDepart(d: Depart, r: Registre): string[] {
  const p: string[] = [];
  const quoi = `départ ${d.numero}`;
  iso(d.heureDepart, `${quoi} : heure`, p);
  const m = /^([A-Z0-9]{2,8})-([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/.exec(d.numero);
  if (!m) p.push(`${quoi} : numéro AGENCE-LIGNE-AAMMJJ-HHMM attendu`);
  else if (!Number.isNaN(Date.parse(d.heureDepart))) {
    if (m[3] !== aammjjDouala(d.heureDepart)) p.push(`${quoi} : date du numéro ≠ date du départ`);
    if (m[4] !== hhmmDouala(d.heureDepart)) p.push(`${quoi} : heure du numéro ≠ heure du départ`);
    const ligne = r.lignes.get(d.ligneId);
    if (!ligne) p.push(`${quoi} : ligne inconnue ${d.ligneId}`);
    else {
      const cie = r.compagnies.get(ligne.compagnieId);
      if (cie && m[1] !== cie.code) p.push(`${quoi} : agence du numéro ≠ compagnie de la ligne`);
      if (m[2] !== ligne.code) p.push(`${quoi} : ligne du numéro ≠ ligne du départ`);
    }
  }
  historique(quoi, MACHINE_DEPART, ETATS_DEPART, d.etat, d.historique, p);
  return p;
}

export function problemesBillet(b: Billet, r: Registre): string[] {
  const p: string[] = [];
  const quoi = `billet ${b.numero}`;
  const a = analyserNumeroBillet(b.numero);
  if (!a) p.push(`${quoi} : numéro AGENCE-GARE-AAMMJJ-NNNN attendu`);
  else {
    if (a.sequence !== b.sequence) p.push(`${quoi} : séquence ${b.sequence} ≠ numéro`);
    iso(b.creeA, `${quoi} : création`, p);
    if (!Number.isNaN(Date.parse(b.creeA)) && a.aammjj !== aammjjDouala(b.creeA)) {
      p.push(`${quoi} : date du numéro ≠ date de création`);
    }
    const cie = r.compagnies.get(b.compagnieId);
    const gare = r.gares.get(b.gareId);
    if (!cie) p.push(`${quoi} : compagnie inconnue`);
    else if (a.agence !== cie.code) p.push(`${quoi} : agence du numéro ≠ compagnie`);
    if (!gare) p.push(`${quoi} : gare inconnue`);
    else if (a.gare !== gare.code) p.push(`${quoi} : gare du numéro ≠ gare`);
  }
  if (!estCodeBillet(b.codeBillet)) p.push(`${quoi} : code à 4 chiffres attendu`);
  entier(b.prix, `${quoi} : prix`, p);
  if (
    b.passager.pieceQuatreDerniers !== undefined &&
    !/^\d{4}$/.test(b.passager.pieceQuatreDerniers)
  ) {
    p.push(`${quoi} : pièce = 4 derniers chiffres`);
  }
  if (b.siege !== null) entier(b.siege, `${quoi} : siège`, p, 1);
  if (!r.departs.has(b.departId)) p.push(`${quoi} : départ inconnu ${b.departId}`);
  historique(quoi, MACHINE_BILLET, ETATS_BILLET, b.etat, b.historique, p);
  return p;
}

export function problemesColis(c: Colis, r: Registre): string[] {
  const p: string[] = [];
  const quoi = `colis ${c.numero}`;
  const a = analyserNumeroColis(c.numero);
  if (!a) p.push(`${quoi} : numéro C-GARE-AAMMJJ-NNNN attendu`);
  else {
    if (a.sequence !== c.sequence) p.push(`${quoi} : séquence ${c.sequence} ≠ numéro`);
    iso(c.creeA, `${quoi} : création`, p);
    if (!Number.isNaN(Date.parse(c.creeA)) && a.aammjj !== aammjjDouala(c.creeA)) {
      p.push(`${quoi} : date du numéro ≠ date de création`);
    }
    const origine = r.gares.get(c.gareOrigineId);
    if (!origine) p.push(`${quoi} : gare d'origine inconnue`);
    else if (a.gare !== origine.code) p.push(`${quoi} : gare du numéro ≠ gare d'origine`);
  }
  if (!r.gares.has(c.gareDestinationId)) p.push(`${quoi} : gare de destination inconnue`);
  if (!/^[0-9a-f]{64}$/.test(c.codeRetraitHache)) p.push(`${quoi} : haché SHA-256 attendu`);
  if (!/^[0-9a-f]{32}$/.test(c.codeRetraitSel)) p.push(`${quoi} : sel de 16 octets attendu`);
  entier(c.prixTotal, `${quoi} : prix`, p);
  entier(c.valeurDeclaree, `${quoi} : valeur`, p);
  if (!(c.poidsKg > 0)) p.push(`${quoi} : poids positif attendu`);
  historique(quoi, MACHINE_COLIS, ETATS_COLIS, c.etat, c.historique, p);
  return p;
}

export function problemesSession(s: SessionCaisse, r: Registre): string[] {
  const p: string[] = [];
  const quoi = `session ${s.numero}`;
  const m = /^K-([A-Z0-9]{2,8})-(\d{6})-(\d+)-(\d+)$/.exec(s.numero);
  if (!m) p.push(`${quoi} : numéro K-GARE-AAMMJJ-GUICHET-N attendu`);
  else {
    if (m[2] !== aammjjDouala(s.ouverteA)) p.push(`${quoi} : date du numéro ≠ ouverture`);
    const g = r.guichets.get(s.guichetId);
    if (!g) p.push(`${quoi} : guichet inconnu`);
    else if (Number(m[3]) !== g.rang) p.push(`${quoi} : guichet du numéro ≠ rang du guichet`);
  }
  iso(s.ouverteA, `${quoi} : ouverture`, p);
  entier(s.fondDeCaisse, `${quoi} : fond de caisse`, p);
  if (s.cloturee) {
    const c = s.cloturee;
    iso(c.at, `${quoi} : clôture`, p);
    if (c.ecart !== c.cashCompte - c.cashAttendu) p.push(`${quoi} : écart ≠ compté − attendu`);
  }
  if ((s.etat === "cloturee" || s.etat === "validee") && !s.cloturee) {
    p.push(`${quoi} : clôture manquante`);
  }
  if (s.etat === "validee" && !s.validee) p.push(`${quoi} : validation manquante`);
  historique(quoi, MACHINE_SESSION, ETATS_SESSION, s.etat, s.historique, p);
  return p;
}

export function problemesPlan(departId: Id, plan: PlanSieges): string[] {
  const p: string[] = [];
  entier(plan.capacite, `plan ${departId} : capacité`, p, 1);
  for (const cle of Object.keys(plan.occupes)) {
    const s = Number(cle);
    if (!Number.isInteger(s) || s < 1 || s > plan.capacite) {
      p.push(`plan ${departId} : siège ${cle} hors du plan (1 à ${plan.capacite})`);
    }
  }
  return p;
}

export function problemesPersonne(x: Personne): string[] {
  const p: string[] = [];
  if (!x.nom.trim()) p.push(`personne ${x.id} : nom vide`);
  if (!TELEPHONE.test(x.telephone)) p.push(`personne ${x.id} : téléphone E.164 attendu`);
  if (x.roles.length === 0) p.push(`personne ${x.id} : au moins un rôle`);
  return p;
}

export function problemesAppareil(a: Appareil): string[] {
  const p: string[] = [];
  iso(a.derniereSyncA, `appareil ${a.id} : dernière synchro`, p);
  if (a.debloqueJusqua !== undefined) iso(a.debloqueJusqua, `appareil ${a.id} : déblocage`, p);
  return p;
}

/** Tous les problèmes d'un lot d'entités ; `base` apporte les références du monde commun. */
export function problemes(entites: Entites, base?: Entites): string[] {
  const r = registre(base, entites);
  const p: string[] = [];
  for (const c of entites.compagnies ?? []) p.push(...problemesCompagnie(c));
  for (const g of entites.gares ?? []) p.push(...problemesGare(g, r));
  for (const l of entites.lignes ?? []) p.push(...problemesLigne(l, r));
  for (const b of entites.bus ?? []) p.push(...problemesBus(b));
  for (const d of entites.departs ?? []) p.push(...problemesDepart(d, r));
  for (const b of entites.billets ?? []) p.push(...problemesBillet(b, r));
  for (const c of entites.colis ?? []) p.push(...problemesColis(c, r));
  for (const s of entites.sessions ?? []) p.push(...problemesSession(s, r));
  for (const [id, plan] of Object.entries(entites.plans ?? {})) p.push(...problemesPlan(id, plan));
  for (const x of entites.personnes ?? []) p.push(...problemesPersonne(x));
  for (const a of entites.appareils ?? []) p.push(...problemesAppareil(a));
  return p;
}
