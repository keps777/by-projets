import { Injectable } from "@nestjs/common";

/**
 * Exécute les tâches d'une même clé l'une après l'autre (dans ce processus). Deux webhooks du même
 * paiement, ou deux paiements de la même commande, ne se croisent jamais. Entre instances de l'API,
 * ce sont les index uniques et les écritures « comparer et remplacer » des ports qui tiennent.
 */
@Injectable()
export class Verrous {
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
