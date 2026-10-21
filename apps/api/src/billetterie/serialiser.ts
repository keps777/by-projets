/**
 * Exécute les tâches de même clé l'une après l'autre (dans ce processus). Deux requêtes identiques
 * qui arrivent en même temps — un événement renvoyé par le téléphone pendant que la première réponse
 * est en route — ne se croisent donc pas : la seconde trouve le travail de la première.
 * Entre plusieurs instances de l'API, c'est l'index unique de la base qui tranche.
 */
export class Serialiseur {
  private readonly files = new Map<string, Promise<unknown>>();

  async executer<T>(cle: string, tache: () => Promise<T>): Promise<T> {
    const precedente = this.files.get(cle) ?? Promise.resolve();
    const suivante = precedente.then(tache, tache);
    const attente = suivante.catch(() => undefined);
    this.files.set(cle, attente);
    try {
      return await suivante;
    } finally {
      if (this.files.get(cle) === attente) this.files.delete(cle);
    }
  }
}
