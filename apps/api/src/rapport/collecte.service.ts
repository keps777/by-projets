import { Injectable, Logger } from "@nestjs/common";
import { analyserRemplissage, compterVentes, type EntreesRapport } from "./calcul";
import type { CompagnieRapport } from "./modele";
import {
  ActiviteColis,
  AnnulationsDuJour,
  AssistantRapport,
  CaissesDuJour,
  ControlesEnRoute,
  DepartsDuJour,
  ReferentielRapport,
  TrousNumerotation,
  VentesBillets,
} from "./ports";
import { decalerJour } from "./temps";

/**
 * Rassemble les faits d'une compagnie pour un jour : une lecture par port, rien de plus.
 *
 * - Les ventes de billets et le référentiel sont **indispensables** : sans eux le rapport serait
 *   faux, l'erreur remonte (le planificateur réessaie au passage suivant).
 * - Tout le reste est **complémentaire** : si une source est en panne à 21 h, le rapport part quand
 *   même, avec la phrase « <source> : données indisponibles » dans les remarques de la première gare.
 *   Un rapport qui part sans une information, en le disant, vaut mieux qu'un rapport qui ne part pas.
 */
@Injectable()
export class CollecteRapportService {
  private readonly logger = new Logger("RapportCollecte");

  constructor(
    private readonly referentiel: ReferentielRapport,
    private readonly ventes: VentesBillets,
    private readonly departs: DepartsDuJour,
    private readonly colis: ActiviteColis,
    private readonly caisses: CaissesDuJour,
    private readonly annulations: AnnulationsDuJour,
    private readonly trous: TrousNumerotation,
    private readonly controles: ControlesEnRoute,
    private readonly assistant: AssistantRapport,
  ) {}

  async collecter(
    compagnie: CompagnieRapport,
    jour: string,
    arreteA: Date,
  ): Promise<EntreesRapport> {
    const veille = decalerJour(jour, -1);
    const [gares, billets, billetsVeille] = await Promise.all([
      this.referentiel.gares(compagnie.id),
      this.ventes.duJour(compagnie.id, jour),
      this.ventes.duJour(compagnie.id, veille),
    ]);

    const incidents: string[] = [];
    const complement = async <T>(source: string, defaut: T, lire: () => Promise<T>): Promise<T> => {
      try {
        return await lire();
      } catch (e) {
        this.logger.warn(
          `Rapport ${jour} (${compagnie.id}) : source « ${source} » indisponible ` +
            `(${e instanceof Error ? e.name : "erreur"})`,
        );
        incidents.push(`${source} : données indisponibles`);
        return defaut;
      }
    };

    const [colis, litiges, caisses, departs, annulations, trous, controles] = await Promise.all([
      complement("colis", [], () => this.colis.enregistresLe(compagnie.id, jour)),
      complement("litiges", 0, () => this.colis.litigesOuvertsLe(compagnie.id, jour)),
      complement("caisses", [], () => this.caisses.duJour(compagnie.id, jour)),
      complement("départs", [], () => this.departs.duJour(compagnie.id, jour)),
      complement("annulations", [], () => this.annulations.duJour(compagnie.id, jour)),
      complement("numérotation", [], () => this.trous.duJour(compagnie.id, jour)),
      complement("contrôles en route", [], () => this.controles.duJour(compagnie.id, jour)),
    ]);

    // Les lectures partent en parallèle : on trie les phrases pour que le rapport soit toujours le même.
    incidents.sort();

    const remplissage = analyserRemplissage(departs, compagnie.nom);
    const question = await complement("question suggérée", null, () =>
      this.assistant.suggerer({
        compagnieId: compagnie.id,
        jour,
        departFaible: remplissage.departFaible,
      }),
    );
    // La question suggérée est un plus : son absence ne s'annonce pas dans le rapport.
    const sansQuestion = incidents.filter((i) => !i.startsWith("question suggérée"));

    return {
      compagnie,
      jour,
      arreteA,
      gares,
      billets,
      nbBilletsVeille: compterVentes(billetsVeille, veille),
      colis,
      litiges,
      caisses,
      departs,
      annulations,
      trous,
      controles,
      question,
      incidents: sansQuestion,
    };
  }
}
