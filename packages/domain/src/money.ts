/**
 * Montants en francs CFA, toujours des entiers (le FCFA n'a pas de centimes).
 * Aucun calcul de prix ne passe par un flottant : les pourcentages sont calculés sur des entiers.
 */
export type Fcfa = number;

export type ModeArrondi = "plafond" | "plancher" | "proche";

export function estFcfa(valeur: unknown): valeur is Fcfa {
  return typeof valeur === "number" && Number.isSafeInteger(valeur);
}

/** Vérifie qu'une valeur est un montant entier et la renvoie. */
export function fcfa(valeur: number): Fcfa {
  if (!estFcfa(valeur)) {
    throw new RangeError(`Montant FCFA invalide (entier attendu) : ${String(valeur)}`);
  }
  return valeur;
}

/** Division entière arrondie selon le mode (diviseur strictement positif). */
export function diviser(numerateur: number, diviseur: number, mode: ModeArrondi): number {
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

/** `pct` % de `montant` (pct entier), arrondi au FCFA. */
export function pourcentage(montant: Fcfa, pct: number, mode: ModeArrondi = "plafond"): Fcfa {
  fcfa(montant);
  if (!Number.isInteger(pct) || pct < 0) throw new RangeError(`Pourcentage invalide : ${pct}`);
  return diviser(montant * pct, 100, mode);
}

/** Arrondit un montant à un multiple de `pas` (par exemple 100 F). */
export function arrondirAuMultiple(montant: Fcfa, pas: number, mode: ModeArrondi = "proche"): Fcfa {
  if (!Number.isInteger(pas) || pas <= 0) throw new RangeError(`Pas d'arrondi invalide : ${pas}`);
  return diviser(montant, pas, mode) * pas;
}

/** Rendu de monnaie ; refuse un montant donné insuffisant. */
export function rendu(donne: Fcfa, du: Fcfa): Fcfa {
  fcfa(donne);
  fcfa(du);
  if (donne < du) throw new RangeError(`Montant donné insuffisant : ${donne} < ${du}`);
  return donne - du;
}
