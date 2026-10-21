import {
  EvenementsTraites,
  JournalAgenceRepository,
  type EntreeJournalStockee,
  type EtatTraitement,
  type FiltreJournal,
} from "./ports";
import { jourDouala } from "../temps";

/** Versions en mémoire des ports du journal (tests, développement). Rien n'y survit à un redémarrage. */

export class JournalAgenceMemoire extends JournalAgenceRepository {
  readonly durable = false;
  readonly lignes: EntreeJournalStockee[] = [];
  private prochain = 1;

  async ajouter(
    chaine: string,
    evenementId: string,
    construire: (precedente: string | null) => Omit<EntreeJournalStockee, "seq" | "chaine">,
  ): Promise<EntreeJournalStockee | null> {
    if (this.lignes.some((l) => l.evenementId === evenementId)) return null;
    const tete = [...this.lignes].reverse().find((l) => l.chaine === chaine);
    const entree: EntreeJournalStockee = {
      ...construire(tete?.empreinte ?? null),
      chaine,
      seq: this.prochain++,
    };
    this.lignes.push(entree);
    return structuredClone(entree);
  }

  async lister(filtre: FiltreJournal): Promise<EntreeJournalStockee[]> {
    return this.lignes
      .filter((l) => filtre.compagnieId === undefined || l.compagnieId === filtre.compagnieId)
      .filter((l) => filtre.gareId === undefined || l.gareId === filtre.gareId)
      .filter(
        (l) =>
          filtre.personneId === undefined ||
          l.auteur.id === filtre.personneId ||
          (l.cible.type === "personne" && l.cible.id === filtre.personneId) ||
          l.validePar?.superviseurId === filtre.personneId,
      )
      .filter(
        (l) =>
          filtre.sessionId === undefined ||
          (l.cible.type === "session" && l.cible.id === filtre.sessionId),
      )
      .filter((l) => filtre.jour === undefined || jourDouala(l.at) === filtre.jour)
      .filter((l) => filtre.avantSeq === undefined || l.seq < filtre.avantSeq)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, filtre.limite)
      .map((l) => structuredClone(l));
  }

  async chaine(chaine: string): Promise<EntreeJournalStockee[]> {
    return this.lignes.filter((l) => l.chaine === chaine).map((l) => structuredClone(l));
  }
}

export class EvenementsTraitesMemoire extends EvenementsTraites {
  readonly durable = false;
  private readonly lignes = new Map<
    string,
    { etat: "en_cours" } | { etat: "termine"; resultat: unknown; recuA: string }
  >();

  async commencer(evenementId: string): Promise<EtatTraitement<unknown>> {
    const existant = this.lignes.get(evenementId);
    if (!existant) {
      this.lignes.set(evenementId, { etat: "en_cours" });
      return { etat: "nouveau" };
    }
    if (existant.etat === "en_cours") return { etat: "en_cours" };
    return {
      etat: "termine",
      resultat: structuredClone(existant.resultat),
      recuA: existant.recuA,
    };
  }

  async terminer(evenementId: string, resultat: unknown, recuA: string): Promise<void> {
    // Passage par JSON : ce qui est rejoué est exactement ce que la base relirait.
    this.lignes.set(evenementId, {
      etat: "termine",
      resultat: JSON.parse(JSON.stringify(resultat)) as unknown,
      recuA,
    });
  }

  async abandonner(evenementId: string): Promise<void> {
    if (this.lignes.get(evenementId)?.etat === "en_cours") this.lignes.delete(evenementId);
  }

  /** Test : combien d'événements ont été traités jusqu'au bout. */
  nombreTermines(): number {
    return [...this.lignes.values()].filter((l) => l.etat === "termine").length;
  }
}
