import { ajouterMinutes, ecartMinutes, type Instant } from "./temps";

/**
 * Règles de la billetterie, recopiées de `@afrimove/domain` (non compilé : l'API ne peut pas
 * l'importer à l'exécution, voir README). `parite.test.ts` compare chaque règle à sa source :
 * une règle modifiée d'un seul côté fait échouer la CI.
 */

export type Fcfa = number;
export type ClasseBillet = "classique" | "vip";

/* ------------------------------------------------------------------ montants */

function fcfa(valeur: number): Fcfa {
  if (!Number.isSafeInteger(valeur)) {
    throw new RangeError(`Montant FCFA invalide (entier attendu) : ${String(valeur)}`);
  }
  return valeur;
}

type ModeArrondi = "plafond" | "plancher" | "proche";

function diviser(numerateur: number, diviseur: number, mode: ModeArrondi): number {
  if (!Number.isSafeInteger(numerateur) || !Number.isSafeInteger(diviseur) || diviseur <= 0) {
    throw new RangeError("Division entière : entiers sûrs attendus, diviseur > 0");
  }
  const reste = ((numerateur % diviseur) + diviseur) % diviseur;
  const plancher = (numerateur - reste) / diviseur;
  if (reste === 0) return plancher;
  if (mode === "plancher") return plancher;
  if (mode === "plafond") return plancher + 1;
  return reste * 2 >= diviseur ? plancher + 1 : plancher;
}

function pourcentage(montant: Fcfa, pct: number, mode: ModeArrondi = "plafond"): Fcfa {
  fcfa(montant);
  if (!Number.isInteger(pct) || pct < 0) throw new RangeError(`Pourcentage invalide : ${pct}`);
  return diviser(montant * pct, 100, mode);
}

function arrondirAuMultiple(montant: Fcfa, pas: number, mode: ModeArrondi = "proche"): Fcfa {
  if (!Number.isInteger(pas) || pas <= 0) throw new RangeError(`Pas d'arrondi invalide : ${pas}`);
  return diviser(montant, pas, mode) * pas;
}

/* ------------------------------------------------------------------ constantes du domaine */

/** Blocage d'un siège pendant une commande : 15 minutes. */
export const BLOCAGE_SIEGE_MINUTES = 15;

/** Payé par le voyageur en plus du billet quand il achète en ligne. */
export const FRAIS_VOYAGEUR_EN_LIGNE: Fcfa = 250;

export const ARRONDI_PRORATA = 100;

/** Ventes en ligne : numérotées côté serveur dans 4001–9999. */
export const PLAGE_EN_LIGNE = { debut: 4001, fin: 9999 } as const;

export interface Plage {
  debut: number;
  fin: number;
}

export const NB_GUICHETS_AVEC_PLAGE = 3;

/** Guichet 1 : 0001–0999 ; guichet 2 : 1001–1999 ; guichet 3 : 2001–2999. */
export function plageGuichet(rang: number): Plage {
  if (!Number.isInteger(rang) || rang < 1 || rang > NB_GUICHETS_AVEC_PLAGE) {
    throw new RangeError(`Rang de guichet sans plage : ${rang} (1 à ${NB_GUICHETS_AVEC_PLAGE})`);
  }
  return { debut: (rang - 1) * 1000 + 1, fin: (rang - 1) * 1000 + 999 };
}

/* ------------------------------------------------------------------ machines d'états */

export const ETATS_BILLET = [
  "reserve",
  "paye",
  "embarque",
  "voyage",
  "annule",
  "non_presente",
  "reporte",
] as const;
export type EtatBillet = (typeof ETATS_BILLET)[number];

export type ActionBillet =
  | "payer"
  | "embarquer"
  | "terminer"
  | "annuler"
  | "marquer_non_presente"
  | "reporter"
  | "reprogrammer";

export const ETATS_DEPART = [
  "programme",
  "en_vente",
  "embarquement",
  "parti",
  "arrive",
  "annule",
  "retarde",
  "fusionne",
] as const;
export type EtatDepart = (typeof ETATS_DEPART)[number];

export type ActionDepart =
  | "ouvrir_vente"
  | "ouvrir_embarquement"
  | "partir"
  | "arriver"
  | "annuler"
  | "retarder"
  | "reprendre_vente"
  | "fusionner";

export const ACTIONS_DEPART: readonly ActionDepart[] = [
  "ouvrir_vente",
  "ouvrir_embarquement",
  "partir",
  "arriver",
  "annuler",
  "retarder",
  "reprendre_vente",
  "fusionner",
];

type Table<E extends string, A extends string> = Readonly<
  Record<E, Readonly<Partial<Record<A, E>>>>
>;

export const TRANSITIONS_BILLET: Table<EtatBillet, ActionBillet> = {
  reserve: { payer: "paye", annuler: "annule" },
  paye: {
    embarquer: "embarque",
    annuler: "annule",
    marquer_non_presente: "non_presente",
    reporter: "reporte",
  },
  embarque: { terminer: "voyage" },
  voyage: {},
  annule: {},
  non_presente: { reporter: "reporte" },
  reporte: { reprogrammer: "paye", annuler: "annule" },
};

export const TRANSITIONS_DEPART: Table<EtatDepart, ActionDepart> = {
  programme: {
    ouvrir_vente: "en_vente",
    annuler: "annule",
    retarder: "retarde",
    fusionner: "fusionne",
  },
  en_vente: {
    ouvrir_embarquement: "embarquement",
    annuler: "annule",
    retarder: "retarde",
    fusionner: "fusionne",
  },
  embarquement: { partir: "parti", retarder: "retarde" },
  parti: { arriver: "arrive" },
  arrive: {},
  annule: {},
  retarde: {
    reprendre_vente: "en_vente",
    ouvrir_embarquement: "embarquement",
    annuler: "annule",
    fusionner: "fusionne",
  },
  fusionne: {},
};

/** Une transition demandée n'existe pas dans la machine d'états. */
export class TransitionInterdite extends Error {
  constructor(
    readonly machine: string,
    readonly de: string,
    readonly action: string,
  ) {
    super(`Transition interdite (${machine}) : « ${action} » depuis l'état « ${de} »`);
    this.name = "TransitionInterdite";
  }
}

export function etatBilletSuivant(etat: EtatBillet, action: ActionBillet): EtatBillet {
  const vers = TRANSITIONS_BILLET[etat][action];
  if (vers === undefined) throw new TransitionInterdite("billet", etat, action);
  return vers;
}

export function etatDepartSuivant(etat: EtatDepart, action: ActionDepart): EtatDepart {
  const vers = TRANSITIONS_DEPART[etat][action];
  if (vers === undefined) throw new TransitionInterdite("depart", etat, action);
  return vers;
}

export function billetPeut(etat: EtatBillet, action: ActionBillet): boolean {
  return TRANSITIONS_BILLET[etat][action] !== undefined;
}

export function departPeut(etat: EtatDepart, action: ActionDepart): boolean {
  return TRANSITIONS_DEPART[etat][action] !== undefined;
}

/** Billets qui occupent un siège : payés, embarqués (voyage terminé : le bus est parti). */
export const ETATS_BILLET_SIEGE_OCCUPE: readonly EtatBillet[] = ["paye", "embarque", "voyage"];

/** Un départ en vente ou en embarquement accepte encore des ventes. */
export const ETATS_DEPART_VENDABLES: readonly EtatDepart[] = ["en_vente", "embarquement"];

/* ------------------------------------------------------------------ annulation */

/** Règles réglables par compagnie (écran « Règles » du patron). */
export interface ReglesCompagnie {
  /** Annulation gratuite jusqu'à N minutes avant le départ. */
  annulationGratuiteMinutes: number;
  /** Retenue (en %) après ce délai, selon la classe. */
  retenueApresDelaiPct: Readonly<Record<ClasseBillet, number>>;
}

/** Valeurs par défaut du domaine (retenues provisoires, à confirmer par le patron). */
export const REGLES_PAR_DEFAUT: ReglesCompagnie = {
  annulationGratuiteMinutes: 60,
  retenueApresDelaiPct: { classique: 25, vip: 50 },
};

export interface DecisionAnnulation {
  autorise: boolean;
  raison?: "etat_interdit" | "depart_passe";
  gratuite: boolean;
  retenue: Fcfa;
  remboursement: Fcfa;
}

export interface ParamsAnnulation {
  etat: EtatBillet;
  prix: Fcfa;
  classe: ClasseBillet;
  heureDepart: Instant;
  maintenant: Instant;
  regles?: ReglesCompagnie;
}

/**
 * Que devient un billet que l'on annule maintenant ? Gratuit jusqu'à `annulationGratuiteMinutes`
 * avant le départ ; ensuite une retenue selon la classe ; après l'heure du départ, tout est retenu.
 */
export function decisionAnnulation(p: ParamsAnnulation): DecisionAnnulation {
  const regles = p.regles ?? REGLES_PAR_DEFAUT;
  fcfa(p.prix);
  if (!billetPeut(p.etat, "annuler")) {
    return {
      autorise: false,
      raison: "etat_interdit",
      gratuite: false,
      retenue: 0,
      remboursement: 0,
    };
  }
  const minutesAvantDepart = ecartMinutes(p.heureDepart, p.maintenant);
  if (minutesAvantDepart <= 0) {
    return {
      autorise: true,
      raison: "depart_passe",
      gratuite: false,
      retenue: p.prix,
      remboursement: 0,
    };
  }
  if (minutesAvantDepart >= regles.annulationGratuiteMinutes) {
    return { autorise: true, gratuite: true, retenue: 0, remboursement: p.prix };
  }
  const retenue = Math.min(
    p.prix,
    pourcentage(p.prix, regles.retenueApresDelaiPct[p.classe], "plafond"),
  );
  return { autorise: true, gratuite: false, retenue, remboursement: p.prix - retenue };
}

/** Limite de l'annulation gratuite (« gratuit jusqu'à 07:00 »). */
export function limiteAnnulationGratuite(
  heureDepart: Instant,
  regles: ReglesCompagnie = REGLES_PAR_DEFAUT,
): string {
  return ajouterMinutes(heureDepart, -regles.annulationGratuiteMinutes);
}

/** AfriMove ne vend jamais : seuls ces rôles émettent des billets. */
export function peutVendre(role: string): boolean {
  return role === "guichetier" || role === "convoyeur" || role === "vendeur";
}

/** Fin du blocage d'un siège pendant une commande : 15 min. */
export function finBlocageSiege(debut: Instant): string {
  return ajouterMinutes(debut, BLOCAGE_SIEGE_MINUTES);
}

/* ------------------------------------------------------------------ numéros et codes */

export function formaterSequence(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new RangeError(`Numéro de séquence hors 0001–9999 : ${sequence}`);
  }
  return String(sequence).padStart(4, "0");
}

function verifierCode(nom: string, code: string): string {
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new RangeError(`Code ${nom} invalide : « ${code} »`);
  return code;
}

/** AGENCE-GARE-AAMMJJ-NNNN, avec `aammjj` déjà calculé (voir `aammjjDouala`). */
export function numeroBillet(p: {
  agence: string;
  gare: string;
  aammjj: string;
  sequence: number;
}): string {
  return [
    verifierCode("agence", p.agence),
    verifierCode("gare", p.gare),
    p.aammjj,
    formaterSequence(p.sequence),
  ].join("-");
}

/** Lit un numéro de billet : agence, gare, jour, séquence. `null` si ce n'est pas un billet. */
export function analyserNumeroBillet(
  numero: string,
): { agence: string; gare: string; aammjj: string; sequence: number } | null {
  const m = /^([A-Z0-9]{2,8})-([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/.exec(numero);
  if (!m || m[1] === "C" || m[1] === "K") return null;
  return { agence: m[1]!, gare: m[2]!, aammjj: m[3]!, sequence: Number(m[4]) };
}

export type Alea = () => number;

export const LONGUEUR_CODE_BILLET = 4;

function chiffres(alea: Alea, nombre: number): string {
  let code = "";
  for (let i = 0; i < nombre; i++) {
    const x = alea();
    if (!(x >= 0 && x < 1)) {
      throw new RangeError("Le générateur doit renvoyer un nombre dans [0, 1)");
    }
    code += String(Math.floor(x * 10));
  }
  return code;
}

export function genererCodeBillet(alea: Alea): string {
  return chiffres(alea, LONGUEUR_CODE_BILLET);
}

/** Code de billet unique parmi ceux du même départ. Lève une erreur si les 10 000 codes sont pris. */
export function genererCodeBilletUnique(alea: Alea, dejaPris: ReadonlySet<string>): string {
  if (dejaPris.size >= 10 ** LONGUEUR_CODE_BILLET) throw new Error("Tous les codes sont pris");
  for (let essai = 0; essai < 1000; essai++) {
    const code = genererCodeBillet(alea);
    if (!dejaPris.has(code)) return code;
  }
  for (let n = 0; n < 10 ** LONGUEUR_CODE_BILLET; n++) {
    const code = String(n).padStart(LONGUEUR_CODE_BILLET, "0");
    if (!dejaPris.has(code)) return code;
  }
  throw new Error("Tous les codes sont pris");
}

/* ------------------------------------------------------------------ prix */

export interface DevisBillet {
  lignes: { code: string; libelle: string; montant: Fcfa }[];
  total: Fcfa;
}

/** Billet acheté en ligne : prix du billet + 250 F de frais voyageur. */
export function devisBillet(prixBillet: Fcfa, enLigne: boolean): DevisBillet {
  fcfa(prixBillet);
  if (prixBillet < 0) throw new RangeError("Prix de billet négatif");
  const lignes = [{ code: "billet", libelle: "Billet", montant: prixBillet }];
  if (enLigne) {
    lignes.push({
      code: "frais_voyageur",
      libelle: "Frais de service",
      montant: FRAIS_VOYAGEUR_EN_LIGNE,
    });
  }
  return { lignes, total: lignes.reduce((somme, l) => somme + l.montant, 0) };
}

export interface ArretKm {
  id: string;
  kmDepuisOrigine: number;
}

/**
 * Prix d'un trajet partiel au prorata des kilomètres entre arrêts, arrondi au multiple de 100 F le
 * plus proche, jamais au-dessus du prix du trajet complet.
 */
export function prixProrata(p: {
  arrets: readonly ArretKm[];
  prixTrajetComplet: Fcfa;
  depuisArretId: string;
  versArretId: string;
  arrondi?: number;
  prixFixes?: Readonly<Record<string, Fcfa>>;
}): Fcfa {
  const depuis = p.arrets.findIndex((a) => a.id === p.depuisArretId);
  const vers = p.arrets.findIndex((a) => a.id === p.versArretId);
  if (depuis < 0 || vers < 0) throw new RangeError("Arrêt inconnu sur cette ligne");
  if (depuis >= vers) throw new RangeError("L'arrêt de montée doit précéder l'arrêt de descente");
  const fixe = p.prixFixes?.[`${p.depuisArretId}>${p.versArretId}`];
  if (fixe !== undefined) return fcfa(fixe);
  const a = p.arrets[depuis]!;
  const b = p.arrets[vers]!;
  const premier = p.arrets[0]!;
  const dernier = p.arrets[p.arrets.length - 1]!;
  const kmTotal = dernier.kmDepuisOrigine - premier.kmDepuisOrigine;
  if (kmTotal <= 0) throw new RangeError("Distance de ligne invalide");
  const km = b.kmDepuisOrigine - a.kmDepuisOrigine;
  fcfa(p.prixTrajetComplet);
  const brut = diviser(p.prixTrajetComplet * km, kmTotal, "proche");
  const arrondi = arrondirAuMultiple(brut, p.arrondi ?? ARRONDI_PRORATA, "proche");
  return Math.min(arrondi, p.prixTrajetComplet);
}

/* ------------------------------------------------------------------ plan du bus */

/** Le plan d'un bus : quatre colonnes (2 + couloir + 2), sièges numérotés ligne par ligne. */
export const COLONNES_PLAN = 4;

/** Plus que N places : la liste signale « presque complet » (« plus que 3 »). */
export const SEUIL_PRESQUE_COMPLET = 3;

/** Emplacement d'un siège : « fenêtre », « couloir », première rangée « près de la porte ». */
export function emplacementSiege(numero: number): string {
  const colonne = (numero - 1) % COLONNES_PLAN;
  const rangee = Math.floor((numero - 1) / COLONNES_PLAN);
  const cote = colonne === 0 || colonne === COLONNES_PLAN - 1 ? "fenêtre" : "couloir";
  return rangee === 0 ? `${cote} · près de la porte` : cote;
}

/** Deux sièges côte à côte : les paires (1, 2) et (3, 4) de chaque rangée. */
export function sontCoteACote(a: number, b: number): boolean {
  const [petit, grand] = a < b ? [a, b] : [b, a];
  if (grand - petit !== 1) return false;
  return (petit - 1) % 2 === 0;
}

/** Y a-t-il au moins deux sièges libres côte à côte ? */
export function aPlacesCoteACote(libres: ReadonlySet<number>): boolean {
  for (const s of libres) if (libres.has(s + 1) && sontCoteACote(s, s + 1)) return true;
  return false;
}
