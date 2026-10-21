/** Erreurs métier du rapport du soir (le contrôleur les traduit en réponses HTTP). */

/** La compagnie n'existe pas, ou le jour est trop ancien pour qu'on le reconstitue. */
export class RapportIntrouvable extends Error {
  constructor(
    readonly compagnieId: string,
    readonly jour: string,
  ) {
    super(`Pas de rapport du soir pour le ${jour}`);
    this.name = "RapportIntrouvable";
  }
}

/** Le rapport de ce jour n'est pas encore dû : il est arrêté à l'heure du rapport (21:00). */
export class RapportPasEncore extends Error {
  constructor(
    readonly jour: string,
    readonly heure: string,
  ) {
    super(`Le rapport du ${jour} est arrêté à ${heure}`);
    this.name = "RapportPasEncore";
  }
}
