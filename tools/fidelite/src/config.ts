import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Dossier tools/fidelite (racine du package). */
export const DOSSIER_OUTIL = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Horloge figée de toutes les captures : mercredi 5 janvier 2027, 07:38, heure de Douala (UTC+1). */
export const HORLOGE_ISO = "2027-01-05T07:38:00+01:00";
export const FUSEAU = "Africa/Douala";
export const LANGUE = "fr-FR";
export const SEUIL_DEFAUT = 3;

export type Config = {
  appUrl: string;
  maquettes: string;
  sortie: string;
  params: { scenario: string; conception: string; horloge: string };
  cleStockageConception: string;
  polices: { famille: string; poids: number; fichier: string }[];
};

export type Ecran = {
  /** Chemin (et éventuelle query) de l'écran dans apps/web, ex. "/voyager". */
  route: string;
  /** Scénario de démonstration ; par défaut le nom de la planche (fixtures/ecrans/<Planche>.ts). */
  scenario?: string;
  /** Sélecteur CSS à attendre avant la capture, si l'écran charge ses données en différé. */
  attente?: string;
};

export type Seuil = { seuil: number; justification: string };
export type Seuils = { defaut: number; planches: Record<string, Seuil> };

function lireJson<T>(chemin: string): T {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as T;
  } catch (e) {
    throw new Error(`Fichier illisible ou JSON invalide : ${chemin} (${(e as Error).message})`);
  }
}

export function chargerConfig(dossier = DOSSIER_OUTIL): Config {
  const c = lireJson<Config>(resolve(dossier, "config.json"));
  return {
    ...c,
    maquettes: resolve(dossier, c.maquettes),
    sortie: resolve(dossier, c.sortie),
    polices: (c.polices ?? []).map((p) => ({ ...p, fichier: resolve(dossier, p.fichier) })),
  };
}

export function chargerEcrans(
  chemin = resolve(DOSSIER_OUTIL, "ecrans.json"),
): Record<string, Ecran> {
  if (!existsSync(chemin)) return {};
  return lireJson<{ ecrans: Record<string, Ecran> }>(chemin).ecrans ?? {};
}

/**
 * Charge seuils.json. Règle : un seuil propre à une planche n'est accepté qu'avec une
 * justification écrite (au moins 15 caractères), sinon on refuse de démarrer.
 */
export function chargerSeuils(chemin = resolve(DOSSIER_OUTIL, "seuils.json")): Seuils {
  const brut = lireJson<{ defaut?: number; planches?: Record<string, Partial<Seuil>> }>(chemin);
  const defaut = brut.defaut ?? SEUIL_DEFAUT;
  if (typeof defaut !== "number" || !(defaut > 0 && defaut <= 100)) {
    throw new Error(
      `seuils.json : "defaut" doit être un pourcentage dans ]0, 100], reçu ${defaut}`,
    );
  }
  const planches: Record<string, Seuil> = {};
  for (const [nom, s] of Object.entries(brut.planches ?? {})) {
    if (typeof s.seuil !== "number" || !(s.seuil > 0 && s.seuil <= 100)) {
      throw new Error(`seuils.json : "${nom}.seuil" doit être un pourcentage dans ]0, 100]`);
    }
    const j = (s.justification ?? "").trim();
    if (j.length < 15) {
      throw new Error(
        `seuils.json : "${nom}" a un seuil (${s.seuil} %) sans justification écrite. ` +
          `Ajoutez "justification" (au moins une phrase) : un seuil se justifie, il ne se règle pas pour faire passer le banc.`,
      );
    }
    planches[nom] = { seuil: s.seuil, justification: j };
  }
  return { defaut, planches };
}

export function seuilPour(
  seuils: Seuils,
  planche: string,
): { seuil: number; justification: string | null } {
  const s = seuils.planches[planche];
  return s
    ? { seuil: s.seuil, justification: s.justification }
    : { seuil: seuils.defaut, justification: null };
}

/** "Main", "Main.dc.html" ou "docs/maquettes-v3/Main.dc.html" → "Main". */
export function nomPlanche(arg: string): string {
  const base = arg.split(/[\\/]/).pop() ?? arg;
  return base.replace(/\.dc\.html$/, "").replace(/\.html$/, "");
}
