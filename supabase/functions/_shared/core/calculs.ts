// Calculs automatiques du catalogue (spec §4). Toutes les entrées et sorties sont dans les unités de base.

/** Solde = Entrées − Sorties (centimes). */
export const solde = (entrees: number, sorties: number) => entrees - sorties;

/** Reste du budget et reste par jour jusqu'à la fin de la période (centimes). */
export function resteBudget(budget: number, sorties: number, joursRestants: number) {
  const reste = budget - sorties;
  return { reste, parJour: joursRestants > 0 ? Math.round(reste / joursRestants) : null };
}

/** Taux d'épargne = Épargne ÷ Entrées (0 à 1), ou null si pas d'entrées. */
export const tauxEpargne = (epargne: number, entrees: number) => (entrees > 0 ? epargne / entrees : null);

/** Rythme = valeur cumulée ÷ jours écoulés. */
export const rythme = (cumul: number, joursEcoules: number) => (joursEcoules > 0 ? cumul / joursEcoules : null);

/** Durée moyenne par fois (secondes). */
export const dureeMoyenne = (secondes: number, fois: number) => (fois > 0 ? secondes / fois : null);

/** Allure en secondes par kilomètre. */
export const allure = (secondes: number, metres: number) => (metres > 0 ? secondes / (metres / 1000) : null);

/** Personnes rencontrées par heure. */
export const personnesParHeure = (personnes: number, secondes: number) => (secondes > 0 ? personnes / (secondes / 3600) : null);

/** Chiffre d'affaires par heure (centimes). */
export const caParHeure = (centimes: number, secondes: number) => (secondes > 0 ? Math.round(centimes / (secondes / 3600)) : null);

/** Reste à épargner = objectif − épargné (centimes, jamais négatif). */
export const resteAEpargner = (objectif: number, epargne: number) => Math.max(0, objectif - epargne);

/** Écart à la cible = valeur − cible (même unité que la valeur). */
export const ecartCible = (valeur: number, cible: number) => valeur - cible;

/** Jours de jeûne = somme des valeurs des options (complet = 1, partiel = 0,5). */
export const joursDeJeune = (valeurs: number[]) => valeurs.reduce((s, v) => s + v, 0);
