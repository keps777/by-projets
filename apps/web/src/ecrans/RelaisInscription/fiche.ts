import type { colis } from "@afrimove/contrats";
import { ecrire, lire, retirer } from "@/coquille/stockage";

/**
 * La fiche de la boutique telle que l'écran la tient : des textes, comme dans les champs. Les fonctions de ce fichier
 * sont pures (sauf le stockage du brouillon) : elles lisent ce qui est tapé et le mettent au format du contrat
 * (`FicheRelais`, brouillon partiel). Le serveur ne renvoie que le MoMo masqué : le numéro complet se retape.
 */

export interface Saisie {
  nom: string;
  type: string;
  ouvert: string;
  /** « Ville · Quartier, repère » : détectée par l'appareil, tapée seulement quand la détection n'a rien donné. */
  position: string;
  tailleMax: string;
  /** Ce qui est dans le champ : « 6 99 •• •• 41 · Orange » tant que rien n'est tapé. */
  momo: string;
  /** Référence de la photo de la façade ; `null` tant qu'aucune photo n'est prise. */
  facadeRef: string | null;
}

type Fiche = colis.FicheRelais;
type Position = Fiche["position"];
type Momo = Fiche["momo"];
type Operateur = Momo["operateur"];

/** « Bafoussam · Tamdja, face école publique » → ville, quartier, repère (le contraire de ce que le serveur écrit). */
export function lirePosition(texte: string): Position | null {
  const [ville = "", ...suite] = texte.split("·");
  const reste = suite.join("·");
  const virgule = reste.indexOf(",");
  const quartier = (virgule < 0 ? reste : reste.slice(0, virgule)).trim();
  const repere = virgule < 0 ? "" : reste.slice(virgule + 1).trim();
  if (ville.trim() === "" || quartier === "") return null;
  return repere === ""
    ? { ville: ville.trim(), quartier }
    : { ville: ville.trim(), quartier, repere };
}

/** L'opérateur d'un numéro camerounais d'après son préfixe (mêmes règles que le serveur). */
function operateurDuNumero(national: string): Operateur | null {
  if (/^(69|65[5-9]|640)/.test(national)) return "orange";
  if (/^(67|68|65[0-4])/.test(national)) return "mtn";
  return null;
}

/**
 * Le numéro tapé (« 699 12 34 41 », « +237 6 99 12 34 41 · Orange »). L'opérateur est celui écrit après le numéro, à
 * défaut celui du préfixe. Un numéro masqué (« 6 99 •• •• 41 ») ou incomplet n'est pas un numéro : `null`.
 */
export function lireMomo(texte: string): Momo | null {
  const chiffres = texte.replace(/\D/g, "");
  const national =
    chiffres.length === 12 && chiffres.startsWith("237") ? chiffres.slice(3) : chiffres;
  if (!/^6\d{8}$/.test(national)) return null;
  const ecrit = /orange/i.test(texte) ? "orange" : /mtn|momo/i.test(texte) ? "mtn" : null;
  const operateur = ecrit ?? operateurDuNumero(national);
  if (operateur === null) return null;
  return { telephone: `+237${national}`, operateur };
}

export interface Problemes {
  nom: boolean;
  position: boolean;
  momo: boolean;
  facade: boolean;
}

export function problemesDe(saisie: Saisie): Problemes {
  return {
    nom: saisie.nom.trim() === "",
    position: lirePosition(saisie.position) === null,
    momo: lireMomo(saisie.momo) === null,
    facade: saisie.facadeRef === null,
  };
}

export function estEnvoyable(problemes: Problemes): boolean {
  return !Object.values(problemes).some(Boolean);
}

/** La fiche complète, au format du contrat ; `null` tant qu'un champ manque ou n'est pas lisible. */
export function versFiche(saisie: Saisie): Fiche | null {
  const position = lirePosition(saisie.position);
  const momo = lireMomo(saisie.momo);
  if (saisie.nom.trim() === "" || position === null || momo === null || saisie.facadeRef === null) {
    return null;
  }
  return {
    nom: saisie.nom.trim(),
    type: saisie.type,
    ouvert: saisie.ouvert,
    position,
    tailleMax: saisie.tailleMax,
    momo,
    facadeRef: saisie.facadeRef,
  };
}

/** Ce qui est déjà bon dans la saisie : le serveur garde le brouillon champ par champ, chaque champ complet et valide. */
export function versBrouillon(saisie: Saisie): Partial<Fiche> {
  const brouillon: Partial<Fiche> = {
    type: saisie.type,
    ouvert: saisie.ouvert,
    tailleMax: saisie.tailleMax,
  };
  if (saisie.nom.trim() !== "") brouillon.nom = saisie.nom.trim();
  const position = lirePosition(saisie.position);
  if (position !== null) brouillon.position = position;
  const momo = lireMomo(saisie.momo);
  if (momo !== null) brouillon.momo = momo;
  if (saisie.facadeRef !== null) brouillon.facadeRef = saisie.facadeRef;
  return brouillon;
}

/**
 * Le texte d'engagement du serveur, coupé autour du « et » de « le code et la pièce » que la planche met en gras.
 * `null` si le texte ne contient pas cette phrase : il s'affiche alors tel quel.
 */
export function decouperEngagement(
  texte: string,
): { avant: string; gras: string; apres: string } | null {
  const trouve = /^([\s\S]*?le code )(et)( la pièce[\s\S]*)$/.exec(texte);
  return trouve ? { avant: trouve[1] ?? "", gras: trouve[2] ?? "", apres: trouve[3] ?? "" } : null;
}

/* ------------------------------------------------------------------ brouillon gardé sur l'appareil */

/** Clé du brouillon sur l'appareil. Le numéro MoMo n'y est jamais écrit (appareil parfois partagé). */
export const CLE_BROUILLON = "afrimove.relais.brouillon";

/** Garde la saisie sur l'appareil : si l'utilisateur quitte (ou si le réseau lâche), elle est là au retour. */
export function garderBrouillon(saisie: Saisie, positionDetectee: boolean): void {
  ecrire(
    CLE_BROUILLON,
    JSON.stringify({
      nom: saisie.nom,
      type: saisie.type,
      ouvert: saisie.ouvert,
      tailleMax: saisie.tailleMax,
      facadeRef: saisie.facadeRef,
      // La position détectée vient de l'appareil, pas de l'utilisateur : seule une position tapée est gardée.
      ...(positionDetectee ? {} : { position: saisie.position }),
    }),
  );
}

export function oublierBrouillon(): void {
  retirer(CLE_BROUILLON);
}

/**
 * Pose le brouillon de l'appareil sur la fiche du serveur. Un choix qui n'est plus proposé est ignoré ; un brouillon
 * illisible aussi.
 */
export function reprendreBrouillon(
  base: Saisie,
  choix: { type: readonly string[]; ouvert: readonly string[]; tailleMax: readonly string[] },
  positionDetectee: boolean,
): Saisie {
  const brut = lire(CLE_BROUILLON);
  if (brut === null) return base;
  let garde: unknown;
  try {
    garde = JSON.parse(brut);
  } catch {
    return base;
  }
  if (typeof garde !== "object" || garde === null) return base;
  const g = garde as Record<string, unknown>;
  const texte = (cle: string): string | null => (typeof g[cle] === "string" ? g[cle] : null);
  const parmi = (cle: "type" | "ouvert" | "tailleMax", valeurs: readonly string[]) => {
    const v = texte(cle);
    return v !== null && valeurs.includes(v) ? v : base[cle];
  };
  return {
    ...base,
    nom: texte("nom") ?? base.nom,
    type: parmi("type", choix.type),
    ouvert: parmi("ouvert", choix.ouvert),
    tailleMax: parmi("tailleMax", choix.tailleMax),
    position: positionDetectee ? base.position : (texte("position") ?? base.position),
    facadeRef: typeof g.facadeRef === "string" ? g.facadeRef : base.facadeRef,
  };
}
