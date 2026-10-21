import type { Instant } from "./temps";
import { aammjjDouala, hhmmDouala } from "./temps";

/**
 * Numérotation sans trou.
 *
 * Billet  : AGENCE-GARE-AAMMJJ-NNNN         (ex. ALP-DLA-270105-0232)
 * Colis   : C-GARE-AAMMJJ-NNNN              (ex. C-DLA-270105-0017)
 * Départ  : AGENCE-LIGNE-AAMMJJ-HHMM        (ex. ALP-DLAYDE-270105-0530)
 * Session : K-GARE-AAMMJJ-GUICHET-N         (ex. K-DLA-270105-2-1)
 *
 * Hors ligne, deux guichets ne peuvent pas se concerter : chacun reçoit une plage de NNNN qui lui
 * est propre et la consomme dans l'ordre, un numéro à la fois. Deux appareils ne partagent donc
 * jamais un numéro (pas de doublon), et un appareil n'en saute jamais un (pas de trou). Le compteur
 * repart de zéro chaque jour (AAMMJJ en heure de Douala).
 */

export interface Plage {
  /** Premier numéro (inclus). */
  readonly debut: number;
  /** Dernier numéro (inclus). */
  readonly fin: number;
}

/** Nombre de guichets ayant une plage dédiée : 0001–0999, 1001–1999, 2001–2999. */
export const NB_GUICHETS_AVEC_PLAGE = 3;

/** Guichet 1 : 0001–0999 ; guichet 2 : 1001–1999 ; guichet 3 : 2001–2999. */
export function plageGuichet(rang: number): Plage {
  if (!Number.isInteger(rang) || rang < 1 || rang > NB_GUICHETS_AVEC_PLAGE) {
    throw new RangeError(`Rang de guichet sans plage : ${rang} (1 à ${NB_GUICHETS_AVEC_PLAGE})`);
  }
  return { debut: (rang - 1) * 1000 + 1, fin: (rang - 1) * 1000 + 999 };
}

/**
 * Convoyeurs : 3001–3999, découpé en parts égales entre `nbConvoyeurs` (rang à partir de 1) pour
 * que deux convoyeurs hors ligne ne se croisent pas.
 */
export function plageConvoyeur(rang: number, nbConvoyeurs: number): Plage {
  if (!Number.isInteger(nbConvoyeurs) || nbConvoyeurs < 1 || nbConvoyeurs > 999) {
    throw new RangeError(`Nombre de convoyeurs invalide : ${nbConvoyeurs}`);
  }
  if (!Number.isInteger(rang) || rang < 1 || rang > nbConvoyeurs) {
    throw new RangeError(`Rang de convoyeur invalide : ${rang} (1 à ${nbConvoyeurs})`);
  }
  const taille = Math.floor(999 / nbConvoyeurs);
  const debut = 3001 + (rang - 1) * taille;
  return { debut, fin: debut + taille - 1 };
}

/** Ventes en ligne et colis de l'app, numérotés côté serveur. */
export const PLAGE_EN_LIGNE: Plage = { debut: 4001, fin: 9999 };

export class PlageEpuisee extends Error {
  constructor(readonly plage: Plage) {
    super(`Plage de numéros épuisée (${plage.debut}–${plage.fin}) : demander une nouvelle plage`);
    this.name = "PlageEpuisee";
  }
}

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

export interface ParamsNumeroBillet {
  agence: string;
  gare: string;
  at: Instant;
  sequence: number;
}

export function numeroBillet(p: ParamsNumeroBillet): string {
  return [
    verifierCode("agence", p.agence),
    verifierCode("gare", p.gare),
    aammjjDouala(p.at),
    formaterSequence(p.sequence),
  ].join("-");
}

export function numeroColis(p: Omit<ParamsNumeroBillet, "agence">): string {
  return ["C", verifierCode("gare", p.gare), aammjjDouala(p.at), formaterSequence(p.sequence)].join(
    "-",
  );
}

export function numeroDepart(p: { agence: string; ligne: string; at: Instant }): string {
  return [
    verifierCode("agence", p.agence),
    verifierCode("ligne", p.ligne),
    aammjjDouala(p.at),
    hhmmDouala(p.at),
  ].join("-");
}

export function numeroSession(p: {
  gare: string;
  at: Instant;
  guichetRang: number;
  ordre: number;
}): string {
  if (!Number.isInteger(p.guichetRang) || p.guichetRang < 1)
    throw new RangeError("Guichet invalide");
  if (!Number.isInteger(p.ordre) || p.ordre < 1) throw new RangeError("Ordre de session invalide");
  return ["K", verifierCode("gare", p.gare), aammjjDouala(p.at), p.guichetRang, p.ordre].join("-");
}

export interface NumeroBilletAnalyse {
  agence: string;
  gare: string;
  aammjj: string;
  sequence: number;
}

export function analyserNumeroBillet(numero: string): NumeroBilletAnalyse | null {
  const m = /^([A-Z0-9]{2,8})-([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/.exec(numero);
  if (!m || m[1] === "C" || m[1] === "K") return null;
  return { agence: m[1]!, gare: m[2]!, aammjj: m[3]!, sequence: Number(m[4]) };
}

export function analyserNumeroColis(
  numero: string,
): { gare: string; aammjj: string; sequence: number } | null {
  const m = /^C-([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/.exec(numero);
  if (!m) return null;
  return { gare: m[1]!, aammjj: m[2]!, sequence: Number(m[3]) };
}

/** État sérialisable d'un générateur (à garder dans la base locale de l'appareil). */
export interface EtatGenerateur {
  /** AAMMJJ → prochain NNNN de billet. */
  billets: Record<string, number>;
  /** AAMMJJ → prochain NNNN de colis. */
  colis: Record<string, number>;
  /** AAMMJJ → dernier numéro de session de caisse pris. */
  sessions: Record<string, number>;
}

export interface NumeroPris {
  numero: string;
  sequence: number;
}

/**
 * Générateur d'un appareil : un guichet ou un convoyeur, avec sa plage.
 * Les billets et les colis ont chacun leur compteur du jour, dans la même plage.
 * L'état est exportable pour survivre à un redémarrage hors ligne.
 */
export class GenerateurNumeros {
  private readonly etat: EtatGenerateur;

  constructor(
    private readonly options: { agence: string; gare: string; plage: Plage; etat?: EtatGenerateur },
  ) {
    if (
      options.plage.debut < 1 ||
      options.plage.fin > 9999 ||
      options.plage.debut > options.plage.fin
    ) {
      throw new RangeError("Plage invalide");
    }
    this.etat = {
      billets: { ...(options.etat?.billets ?? {}) },
      colis: { ...(options.etat?.colis ?? {}) },
      sessions: { ...(options.etat?.sessions ?? {}) },
    };
  }

  get plage(): Plage {
    return this.options.plage;
  }

  /** Prochain numéro de billet ; `gare` permet au convoyeur de vendre ailleurs que chez lui. */
  prochainBillet(at: Instant, gare: string = this.options.gare): NumeroPris {
    const jour = aammjjDouala(at);
    const sequence = this.consommer(this.etat.billets, jour);
    return { sequence, numero: numeroBillet({ agence: this.options.agence, gare, at, sequence }) };
  }

  prochainColis(at: Instant, gare: string = this.options.gare): NumeroPris {
    const jour = aammjjDouala(at);
    const sequence = this.consommer(this.etat.colis, jour);
    return { sequence, numero: numeroColis({ gare, at, sequence }) };
  }

  /** Numéro de la prochaine session de caisse du guichet pour ce jour (1, 2, 3…). */
  prochaineSession(at: Instant, guichetRang: number): string {
    const jour = aammjjDouala(at);
    const ordre = (this.etat.sessions[jour] ?? 0) + 1;
    this.etat.sessions[jour] = ordre;
    return numeroSession({ gare: this.options.gare, at, guichetRang, ordre });
  }

  /** Numéros restants aujourd'hui pour les billets. */
  billetsRestants(at: Instant): number {
    const prochain = this.etat.billets[aammjjDouala(at)] ?? this.options.plage.debut;
    return this.options.plage.fin - prochain + 1;
  }

  exporter(): EtatGenerateur {
    return {
      billets: { ...this.etat.billets },
      colis: { ...this.etat.colis },
      sessions: { ...this.etat.sessions },
    };
  }

  private consommer(compteurs: Record<string, number>, jour: string): number {
    const prochain = compteurs[jour] ?? this.options.plage.debut;
    if (prochain > this.options.plage.fin) throw new PlageEpuisee(this.options.plage);
    compteurs[jour] = prochain + 1;
    return prochain;
  }
}

export interface AnalyseSequences {
  /** Numéros manquants entre le début de la plage et le plus grand numéro vu. */
  trous: number[];
  /** Numéros vus plus d'une fois. */
  doublons: number[];
  /** Numéros hors de la plage attendue. */
  horsPlage: number[];
}

/**
 * Contrôle côté serveur : les numéros reçus d'un appareil pour un jour couvrent-ils sa plage
 * sans trou ? Un billet annulé garde son numéro : il doit donc figurer dans la liste.
 */
export function analyserSequences(sequences: Iterable<number>, plage: Plage): AnalyseSequences {
  const vus = new Map<number, number>();
  for (const s of sequences) vus.set(s, (vus.get(s) ?? 0) + 1);
  const horsPlage = [...vus.keys()].filter((s) => s < plage.debut || s > plage.fin).sort(cmp);
  const dansPlage = [...vus.keys()].filter((s) => s >= plage.debut && s <= plage.fin);
  const max = dansPlage.length ? Math.max(...dansPlage) : plage.debut - 1;
  const trous: number[] = [];
  for (let n = plage.debut; n <= max; n++) if (!vus.has(n)) trous.push(n);
  const doublons = [...vus.entries()]
    .filter(([, n]) => n > 1)
    .map(([s]) => s)
    .sort(cmp);
  return { trous, doublons, horsPlage };
}

const cmp = (a: number, b: number): number => a - b;
