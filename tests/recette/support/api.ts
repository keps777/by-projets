import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inject } from "vitest";
import { COMPTES, type NomCompte, type Pile } from "./config";

/** La pile démarrée par le banc (`support/pile.ts`). */
export function pile(): Pile {
  return inject("pile");
}

export interface Reponse<T = unknown> {
  statut: number;
  corps: T;
  entetes: Headers;
}

/** Un appel HTTP brut vers l'API : ne lève jamais sur un statut d'erreur (les scénarios vérifient les refus). */
export async function appeler<T = any>(
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  chemin: string,
  options: {
    jeton?: string;
    corps?: unknown;
    requete?: Record<string, string | number>;
    /** Une autre API que celle de la pile (le serveur de la restauration). */
    urlBase?: string;
  } = {},
): Promise<Reponse<T>> {
  const url = new URL(chemin, options.urlBase ?? pile().urlApi);
  for (const [k, v] of Object.entries(options.requete ?? {})) url.searchParams.set(k, String(v));
  const entetes: Record<string, string> = { Accept: "application/json" };
  if (options.corps !== undefined) entetes["Content-Type"] = "application/json";
  if (options.jeton) entetes["Authorization"] = `Bearer ${options.jeton}`;
  const r = await fetch(url, {
    method: methode,
    headers: entetes,
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
  });
  const texte = await r.text();
  let corps: unknown = texte;
  try {
    corps = texte === "" ? undefined : JSON.parse(texte);
  } catch {
    // corps non JSON : gardé tel quel
  }
  return { statut: r.status, corps: corps as T, entetes: r.headers };
}

export interface Session {
  nom: NomCompte;
  jeton: string;
  /** Identifiant de la personne (`/me`). */
  id: string;
  compagnieId: string | null;
  gareId: string | null;
}

/** Les codes SMS (4 à 6 chiffres) que le simulateur a « envoyés » à ce numéro, lus dans le journal de l'API. */
function codesSms(telephone: string): string[] {
  const journal = readFileSync(pile().journalApi, "utf8");
  const re = new RegExp(`${telephone.replace("+", "\\+")}\\s*:\\s*[^\\n]*?(\\d{4,6})`, "g");
  return [...journal.matchAll(re)].map((m) => m[1] ?? "");
}

/** Connexion réelle : numéro + PIN (agents), ou mot de passe puis code SMS (direction). */
export async function connecter(nom: NomCompte): Promise<Session> {
  const compte = COMPTES[nom];
  let jeton: string;
  if (compte.role === "superviseur" || compte.role === "patron") {
    const dejaEnvoyes = codesSms(compte.telephone).length;
    const etape1 = await appeler("POST", "/auth/direction/connexion", {
      corps: { telephone: compte.telephone, motDePasse: compte.secret, role: compte.role },
    });
    if (etape1.statut !== 202) {
      throw new Error(
        `Connexion ${nom} refusée (étape 1) : ${etape1.statut} ${JSON.stringify(etape1.corps)}`,
      );
    }
    // Le journal de l'API est écrit par un autre processus : on laisse un instant au système de fichiers.
    // Le code attendu est un NOUVEAU message : celui d'une connexion précédente du même compte est déjà dans le journal.
    let code: string | null = null;
    for (let i = 0; i < 50 && !code; i++) {
      const codes = codesSms(compte.telephone);
      if (codes.length > dejaEnvoyes) code = codes[codes.length - 1] ?? null;
      if (!code) await new Promise((r) => setTimeout(r, 100));
    }
    if (!code) throw new Error(`Aucun code SMS lu dans le journal de l'API pour ${nom}`);
    const etape2 = await appeler("POST", "/auth/direction/verification", {
      corps: { defiId: (etape1.corps as { defiId: string }).defiId, code },
    });
    if (etape2.statut !== 200) {
      throw new Error(
        `Connexion ${nom} refusée (étape 2) : ${etape2.statut} ${JSON.stringify(etape2.corps)}`,
      );
    }
    jeton = (etape2.corps as { accessToken: string }).accessToken;
  } else {
    const r = await appeler("POST", "/auth/guichet/connexion", {
      corps: { telephone: compte.telephone, pin: compte.secret, role: compte.role },
    });
    if (r.statut !== 200) {
      throw new Error(`Connexion ${nom} refusée : ${r.statut} ${JSON.stringify(r.corps)}`);
    }
    jeton = (r.corps as { accessToken: string }).accessToken;
  }
  const moi = await appeler<{ id: string; compagnieId: string | null; gareId: string | null }>(
    "GET",
    "/me",
    { jeton },
  );
  return {
    nom,
    jeton,
    id: moi.corps.id,
    compagnieId: moi.corps.compagnieId,
    gareId: moi.corps.gareId,
  };
}

/** Requête SQL en lecture sur la base de la recette ; rend les lignes (JSON). */
export function lire<T = Record<string, any>>(sql: string, base?: string): T[] {
  const p = pile();
  const sortie = execFileSync(
    "psql",
    [
      `${p.serveurPg}/${base ?? p.base}`,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(sortie) as T[];
}

/** Instruction SQL d'écriture (préparation des données : départs, appareils). */
export function ecrire(sql: string, base?: string): void {
  const p = pile();
  execFileSync(
    "psql",
    [`${p.serveurPg}/${base ?? p.base}`, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql],
    {
      stdio: "pipe",
    },
  );
}

/**
 * L'API ferme toute caisse restée ouverte sur un jour passé, par un balayage d'une minute (clôture automatique de
 * minuit, `PlanificateurClotureAuto`). Les scénarios jouent des journées passées (horloge d'appareil simulée) avec
 * des caisses ouvertes : si un balayage tombe au milieu, la caisse est clôturée par le système et le scénario casse
 * pour une raison qui n'a rien à voir avec ce qu'il vérifie. Cette aide attend d'être loin d'un balayage : les
 * balayages tombent toutes les 60 s à partir du démarrage de l'API, dont on connaît l'instant (à quelques secondes
 * près), et le scénario tient dans `dureeMs`. Sans effet quand l'API n'a pas été lancée par la recette.
 */
export async function fenetreSansBalayage(dureeMs = 20_000): Promise<void> {
  const { apiPretA } = pile();
  if (apiPretA === null) return;
  const periode = 60_000;
  const marge = 6_000; // le démarrage de la minuterie précède de quelques secondes le premier « health » réussi
  for (;;) {
    const phase = (Date.now() - apiPretA) % periode;
    if (phase >= marge && phase + dureeMs <= periode - marge) return;
    const attente = phase < marge ? marge - phase : periode - phase + marge;
    await new Promise((r) => setTimeout(r, attente));
  }
}
