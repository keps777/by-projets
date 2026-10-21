import type { patron as c } from "@afrimove/contrats";
import { erreurApi, type SignaturePin } from "../modules/commande";
import { estRoleEquipe, type RoleEquipe } from "./modele";

/**
 * Lecture stricte des corps des écritures du patron (réglages). L'API n'importe pas zod à l'exécution :
 * chaque corps est vérifié ici, champ par champ, et un champ inconnu est refusé (422 `COMMANDE_INVALIDE`).
 * Les tests comparent ces lecteurs aux schémas des contrats (`validation.test.ts`) : ce qu'un schéma refuse,
 * ils le refusent aussi.
 */

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function invalide(message: string) {
  return erreurApi(422, "COMMANDE_INVALIDE", message);
}

/** Un objet dont les clés sont exactement `obligatoires` (+ éventuellement `optionnelles`) et `signature`. */
function objet(
  brut: unknown,
  chemin: string,
  obligatoires: readonly string[],
  optionnelles: readonly string[] = [],
  avecSignature = false,
): Record<string, unknown> {
  if (!estObjet(brut)) throw invalide(`${chemin} : un objet est attendu`);
  const permises = new Set([
    ...obligatoires,
    ...optionnelles,
    ...(avecSignature ? ["signature"] : []),
  ]);
  const inconnues = Object.keys(brut).filter((k) => !permises.has(k));
  if (inconnues.length > 0)
    throw invalide(`${chemin} : champ inattendu « ${inconnues.join(", ")} »`);
  for (const cle of obligatoires) {
    if (!(cle in brut) || brut[cle] === undefined)
      throw invalide(`${chemin}.${cle} est obligatoire`);
  }
  return brut;
}

function texte(v: unknown, chemin: string, max = 200): string {
  if (typeof v !== "string" || v.trim().length === 0)
    throw invalide(`${chemin} : un texte non vide est attendu`);
  if (v.length > max) throw invalide(`${chemin} : ${max} caractères au plus`);
  return v.trim();
}

function entier(v: unknown, chemin: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw invalide(`${chemin} : un entier de ${min} à ${max} est attendu`);
  }
  return v;
}

function booleen(v: unknown, chemin: string): boolean {
  if (typeof v !== "boolean") throw invalide(`${chemin} : vrai ou faux attendu`);
  return v;
}

function choix<T extends string>(v: unknown, chemin: string, valeurs: readonly T[]): T {
  if (typeof v !== "string" || !(valeurs as readonly string[]).includes(v)) {
    throw invalide(`${chemin} : une valeur parmi ${valeurs.join(", ")} est attendue`);
  }
  return v as T;
}

const FCFA_MAX = 10_000_000;
const fcfa = (v: unknown, chemin: string): number => entier(v, chemin, 0, FCFA_MAX);

/** Un identifiant (texte non vide) ; les adaptateurs refusent ce qui n'est pas un UUID connu. */
const identifiant = (v: unknown, chemin: string): string => texte(v, chemin, 100);

/* ------------------------------------------------------------------ personnes */

export interface ChampsPersonne {
  nom: string;
  telephone: string;
  operateur: "MTN" | "Orange";
  role: RoleEquipe;
  gareId: string | null;
  guichet: string | null;
  salaire: number;
  droits: c.DroitsPersonne;
}

const TELEPHONE = /^\+\d{9,15}$/;
const CHAMPS_PERSONNE = [
  "nom",
  "telephone",
  "operateur",
  "role",
  "gareId",
  "guichet",
  "salaire",
  "droits",
] as const;

function lireChamps(brut: unknown, chemin: string, partiel: boolean): Partial<ChampsPersonne> {
  const o = partiel
    ? objet(brut, chemin, [], CHAMPS_PERSONNE)
    : objet(brut, chemin, CHAMPS_PERSONNE);
  const champs: Partial<ChampsPersonne> = {};
  if (o["nom"] !== undefined) champs.nom = texte(o["nom"], `${chemin}.nom`, 80);
  if (o["telephone"] !== undefined) {
    const tel = texte(o["telephone"], `${chemin}.telephone`, 20);
    if (!TELEPHONE.test(tel))
      throw invalide(`${chemin}.telephone : format international +237… attendu`);
    champs.telephone = tel;
  }
  if (o["operateur"] !== undefined) {
    champs.operateur = choix(o["operateur"], `${chemin}.operateur`, ["MTN", "Orange"] as const);
  }
  if (o["role"] !== undefined) {
    if (!estRoleEquipe(o["role"])) throw invalide(`${chemin}.role : rôle d'équipe inconnu`);
    champs.role = o["role"];
  }
  if (o["gareId"] !== undefined) {
    champs.gareId = o["gareId"] === null ? null : identifiant(o["gareId"], `${chemin}.gareId`);
  }
  if (o["guichet"] !== undefined) {
    champs.guichet = o["guichet"] === null ? null : texte(o["guichet"], `${chemin}.guichet`, 10);
  }
  if (o["salaire"] !== undefined) champs.salaire = fcfa(o["salaire"], `${chemin}.salaire`);
  if (o["droits"] !== undefined) {
    const d = objet(o["droits"], `${chemin}.droits`, [
      "vendreBilletsEtColis",
      "annulerSansPinSuperviseur",
      "modeCadence",
      "voirCaissesDesAutres",
    ]);
    champs.droits = {
      vendreBilletsEtColis: booleen(
        d["vendreBilletsEtColis"],
        `${chemin}.droits.vendreBilletsEtColis`,
      ),
      annulerSansPinSuperviseur: booleen(
        d["annulerSansPinSuperviseur"],
        `${chemin}.droits.annulerSansPinSuperviseur`,
      ),
      modeCadence: booleen(d["modeCadence"], `${chemin}.droits.modeCadence`),
      voirCaissesDesAutres: booleen(
        d["voirCaissesDesAutres"],
        `${chemin}.droits.voirCaissesDesAutres`,
      ),
    };
  }
  return champs;
}

/** Corps de `POST /patron/reglages/personnes` (`CreerPersonne`). */
export function lireCreerPersonne(corps: unknown): ChampsPersonne {
  const o = objet(corps, "corps", ["champs"], [], true);
  return lireChamps(o["champs"], "champs", false) as ChampsPersonne;
}

/** Corps de `PUT /patron/reglages/personnes/:personneId` (`ModifierPersonne`). */
export function lireModifierPersonne(corps: unknown): {
  personneId: string;
  champs: Partial<ChampsPersonne>;
} {
  const o = objet(corps, "corps", ["personneId", "champs"], [], true);
  const champs = lireChamps(o["champs"], "champs", true);
  if (Object.keys(champs).length === 0) throw invalide("champs : au moins un champ à modifier");
  return { personneId: identifiant(o["personneId"], "personneId"), champs };
}

/** Corps de `POST …/personnes/:personneId/desactivation` et `…/pin-provisoire`. */
export function lirePersonneVisee(corps: unknown): string {
  const o = objet(corps, "corps", ["personneId"], [], true);
  return identifiant(o["personneId"], "personneId");
}

/* ------------------------------------------------------------------ règles */

/** Corps de `PUT /patron/reglages/regles` (`EnregistrerRegles`). */
export function lireEnregistrerRegles(corps: unknown): c.ReglesModifiables {
  const o = objet(corps, "corps", ["regles"], [], true);
  const r = objet(o["regles"], "regles", ["annulation", "caisse", "cadence", "fraisService"]);
  const an = objet(r["annulation"], "regles.annulation", [
    "gratuiteJusqua",
    "retenue",
    "retenueParClassePct",
  ]);
  const pct = objet(an["retenueParClassePct"], "regles.annulation.retenueParClassePct", [
    "classique",
    "vip",
  ]);
  const ca = objet(r["caisse"], "regles.caisse", ["toleranceEcart", "auDela"]);
  const cad = objet(r["cadence"], "regles.cadence", ["numeroObligatoire"]);
  const fr = objet(r["fraisService"], "regles.fraisService", ["montant", "priseEnChargeParAgence"]);
  return {
    annulation: {
      gratuiteJusqua: choix(an["gratuiteJusqua"], "regles.annulation.gratuiteJusqua", [
        "1h_avant",
        "2h_avant",
        "veille_20h",
        "jamais",
      ] as const),
      retenue: choix(an["retenue"], "regles.annulation.retenue", [
        "selon_classe",
        "dix_pct",
        "cinquante_pct",
        "aucun_remboursement",
      ] as const),
      retenueParClassePct: {
        classique: entier(
          pct["classique"],
          "regles.annulation.retenueParClassePct.classique",
          0,
          100,
        ),
        vip: entier(pct["vip"], "regles.annulation.retenueParClassePct.vip", 0, 100),
      },
    },
    caisse: {
      toleranceEcart: fcfa(ca["toleranceEcart"], "regles.caisse.toleranceEcart"),
      auDela: choix(ca["auDela"], "regles.caisse.auDela", [
        "pin_superviseur_et_patron",
        "pin_superviseur",
        "bloque_guichet",
      ] as const),
    },
    cadence: {
      numeroObligatoire: booleen(cad["numeroObligatoire"], "regles.cadence.numeroObligatoire"),
    },
    fraisService: {
      montant: fcfa(fr["montant"], "regles.fraisService.montant"),
      priseEnChargeParAgence: booleen(
        fr["priseEnChargeParAgence"],
        "regles.fraisService.priseEnChargeParAgence",
      ),
    },
  };
}

/* ------------------------------------------------------------------ comptes mobile money */

const OPERATEURS = ["mtn", "orange"] as const;
const NUMERO_MOMO = /^\+?\d{9,15}$/;

export interface CommandeConfirmationMomo {
  operateur: c.OperateurMomo;
  nouveauNumero: string;
}

/** Corps de `POST /patron/reglages/comptes-momo/confirmation`. */
export function lireConfirmationMomo(corps: unknown): CommandeConfirmationMomo {
  const o = objet(corps, "corps", ["operateur", "nouveauNumero"], [], true);
  const numero = texte(o["nouveauNumero"], "nouveauNumero", 20);
  if (!NUMERO_MOMO.test(numero)) throw invalide("nouveauNumero : 9 à 15 chiffres attendus");
  return { operateur: choix(o["operateur"], "operateur", OPERATEURS), nouveauNumero: numero };
}

export interface CommandeChangerMomo extends CommandeConfirmationMomo {
  codeSms: string;
}

/** Corps de `PUT /patron/reglages/comptes-momo`. */
export function lireChangerMomo(corps: unknown): CommandeChangerMomo {
  const o = objet(corps, "corps", ["operateur", "nouveauNumero", "codeSms"], [], true);
  const numero = texte(o["nouveauNumero"], "nouveauNumero", 20);
  if (!NUMERO_MOMO.test(numero)) throw invalide("nouveauNumero : 9 à 15 chiffres attendus");
  const code = texte(o["codeSms"], "codeSms", 6);
  if (!/^\d{6}$/.test(code)) throw invalide("codeSms : 6 chiffres attendus");
  return {
    operateur: choix(o["operateur"], "operateur", OPERATEURS),
    nouveauNumero: numero,
    codeSms: code,
  };
}

export type { SignaturePin };
