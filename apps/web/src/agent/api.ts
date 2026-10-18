/**
 * Appels de la connexion des agents et de l'enrôlement de leur téléphone (lot De, AM-093).
 *
 * Ces routes ne passent pas par `@afrimove/api-client` : elles ne figurent pas dans `@afrimove/contrats` (le
 * jeton n'existe pas encore quand on les appelle, et l'enrôlement se prouve par un code, pas par un compte).
 * Les formes sont celles de l'API (`apps/api/src/socle/auth/auth.dto.ts` et `apps/api/src/administration/`).
 */

export type Fetch = typeof fetch;

export interface OptionsAgent {
  /** Racine de l'API : `/api` ou `VITE_API_URL`. */
  urlBase: string;
  fetch?: Fetch;
}

/** Réponse non 2xx de l'API, ou réseau coupé (`statut` 0). */
export class ErreurAgent extends Error {
  constructor(
    readonly statut: number,
    /** Code métier de l'API (`PIN_INCORRECT`, `CODE_EXPIRE`…), s'il y en a un. */
    readonly code: string | null,
    message: string,
    /** Attente demandée par le serveur (429 : en-tête `Retry-After`), en millisecondes. */
    readonly reessayerApresMs: number | null = null,
  ) {
    super(message);
    this.name = "ErreurAgent";
  }
}

export interface JetonAgent {
  accessToken: string;
  /** Durée de validité, en secondes. */
  expiresIn: number;
  /** Rôle de l'API (`guichetier`, `patron`…). */
  role: string;
}

export interface DefiDirection {
  defiId: string;
  /** Validité du code reçu par SMS, en secondes. */
  expireDans: number;
}

export interface Moi {
  id: string;
  role: string;
  compagnieId: string | null;
  gareId: string | null;
  peutVendre: boolean;
  accesPatron: boolean;
}

/** Ce que le serveur répond à l'enrôlement : le secret n'est donné qu'une fois. */
export interface Enrolement {
  appareilId: string;
  secret: string;
  compagnieId: string;
  gareId: string | null;
  libelle: string | null;
  /** Codes de 3 lettres (agence, gare) : l'identité que l'appareil met dans ses numéros de billets. */
  agence: string | null;
  gare: string | null;
  genre: "guichet" | "convoyeur" | "autre";
  rang: number | null;
  plage: { debut: number; fin: number } | null;
}

function objet(valeur: unknown): Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null ? (valeur as Record<string, unknown>) : {};
}

async function appeler(
  options: OptionsAgent,
  methode: "GET" | "POST",
  chemin: string,
  corps?: unknown,
  jeton?: string,
): Promise<unknown> {
  const f = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = options.urlBase.replace(/\/+$/, "");
  let reponse: Response;
  try {
    reponse = await f(`${base}${chemin}`, {
      method: methode,
      headers: {
        Accept: "application/json",
        ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      cache: "no-store",
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
  } catch {
    throw new ErreurAgent(0, null, "Réseau indisponible");
  }
  let json: unknown = null;
  try {
    json = await reponse.json();
  } catch {
    json = null;
  }
  if (!reponse.ok) {
    const c = objet(json);
    // 429 : `Retry-After` en secondes ; 423 (compte bloqué) : `reessayerApres`, un instant ISO.
    const enTete = Number(reponse.headers.get("Retry-After"));
    const jusqua = typeof c["reessayerApres"] === "string" ? Date.parse(c["reessayerApres"]) : NaN;
    const attenteMs =
      Number.isFinite(enTete) && enTete > 0
        ? enTete * 1000
        : Number.isFinite(jusqua)
          ? Math.max(0, jusqua - Date.now())
          : null;
    throw new ErreurAgent(
      reponse.status,
      typeof c["code"] === "string" ? c["code"] : null,
      typeof c["message"] === "string" ? c["message"] : `HTTP ${reponse.status}`,
      attenteMs,
    );
  }
  return json;
}

function texte(c: Record<string, unknown>, cle: string): string {
  const v = c[cle];
  if (typeof v !== "string" || v === "")
    throw new ErreurAgent(502, null, `Réponse illisible : ${cle}`);
  return v;
}

function entier(c: Record<string, unknown>, cle: string): number {
  const v = c[cle];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ErreurAgent(502, null, `Réponse illisible : ${cle}`);
  }
  return v;
}

function lireJeton(json: unknown): JetonAgent {
  const c = objet(json);
  return {
    accessToken: texte(c, "accessToken"),
    expiresIn: entier(c, "expiresIn"),
    role: texte(c, "role"),
  };
}

/** Compte d'un agent à PIN (guichetier, convoyeur, chauffeur, vendeur, contrôleur, relais, livreur). */
export async function connecterParPin(
  options: OptionsAgent,
  saisie: { telephone: string; pin: string; role: string },
): Promise<JetonAgent> {
  return lireJeton(await appeler(options, "POST", "/auth/guichet/connexion", saisie));
}

/** Direction, première étape : mot de passe, puis un code arrive par SMS. */
export async function demanderCodeDirection(
  options: OptionsAgent,
  saisie: { telephone: string; motDePasse: string; role: string },
): Promise<DefiDirection> {
  const c = objet(await appeler(options, "POST", "/auth/direction/connexion", saisie));
  return { defiId: texte(c, "defiId"), expireDans: entier(c, "expireDans") };
}

/** Direction, seconde étape : le code à 6 chiffres reçu par SMS. */
export async function verifierCodeDirection(
  options: OptionsAgent,
  saisie: { defiId: string; code: string },
): Promise<JetonAgent> {
  return lireJeton(await appeler(options, "POST", "/auth/direction/verification", saisie));
}

export async function lireMoi(options: OptionsAgent, jeton: string): Promise<Moi> {
  const c = objet(await appeler(options, "GET", "/me", undefined, jeton));
  return {
    id: texte(c, "id"),
    role: texte(c, "role"),
    compagnieId: typeof c["compagnieId"] === "string" ? c["compagnieId"] : null,
    gareId: typeof c["gareId"] === "string" ? c["gareId"] : null,
    peutVendre: c["peutVendre"] === true,
    accesPatron: c["accesPatron"] === true,
  };
}

/** Échange le code d'enrôlement donné par l'administration contre le secret de l'appareil. */
export async function enrolerAppareil(options: OptionsAgent, code: string): Promise<Enrolement> {
  const c = objet(await appeler(options, "POST", "/appareils/enrolement", { code }));
  const plage = objet(c["plage"]);
  const genre = c["genre"];
  return {
    appareilId: texte(c, "appareilId"),
    secret: texte(c, "secret"),
    compagnieId: texte(c, "compagnieId"),
    gareId: typeof c["gareId"] === "string" ? c["gareId"] : null,
    libelle: typeof c["libelle"] === "string" ? c["libelle"] : null,
    agence: typeof c["agence"] === "string" ? c["agence"] : null,
    gare: typeof c["gare"] === "string" ? c["gare"] : null,
    genre: genre === "guichet" || genre === "convoyeur" ? genre : "autre",
    rang: typeof c["rang"] === "number" ? c["rang"] : null,
    plage:
      typeof plage["debut"] === "number" && typeof plage["fin"] === "number"
        ? { debut: plage["debut"], fin: plage["fin"] }
        : null,
  };
}
