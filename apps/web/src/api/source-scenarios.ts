import { ecrans } from "@afrimove/fixtures";
import {
  SCENARIO_PAR_DEFAUT,
  agence,
  colis,
  modules,
  patron,
  voyageur,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";

/**
 * Composeur central du mock : pour une planche donnée, concatène les opérations et les flux de
 * chaque domaine (voyageur, colis, agence, patron) à partir du scénario de la planche dans
 * `@afrimove/fixtures`. Ce module est chargé à la demande (voir `fournisseur.tsx`) pour ne pas
 * alourdir le bundle quand l'application tourne contre le vrai serveur.
 */
type EcranFixtures = (typeof ecrans)[keyof typeof ecrans];

export function composerScenario(nom: string, donnees: EcranFixtures): Scenario {
  const operations: Scenario["operations"][number][] = [];
  const flux: NonNullable<Scenario["flux"]>[number][] = [];

  if (voyageur.estPlancheVoyageur(nom)) {
    const s = voyageur.installerMockVoyageur(nom, donnees as never);
    operations.push(...s.operations);
    flux.push(...(s.flux ?? []));
  }

  const enConstruction = { nom, operations: [] as typeof operations, flux: [] as typeof flux };
  colis.installerMockColis(enConstruction as never, donnees as never);
  agence.installerMockAgence(enConstruction as never, donnees as never);
  operations.push(...enConstruction.operations);
  flux.push(...enConstruction.flux);

  // Le client prend la première implémentation d'une opération : les modules passent avant le patron,
  // pour partager l'état avec la lecture des réglages (README du client des modules).
  const m = modules.installerMockModules();
  operations.push(...m.operations);
  flux.push(...(m.flux ?? []));

  const p = patron.installerMockPatron(nom, donnees as never);
  operations.push(...p.operations);
  flux.push(...(p.flux ?? []));

  return { nom, operations, flux };
}

/** Source des scénarios du mock : un scénario par planche, plus « defaut » (accueil voyageur). */
export function sourceScenariosFixtures(): SourceScenarios {
  const parNom = ecrans as Record<string, EcranFixtures>;
  const cleDe = (nom: string) => (nom === SCENARIO_PAR_DEFAUT ? "Main" : nom);
  return {
    noms: () => [SCENARIO_PAR_DEFAUT, ...Object.keys(parNom)],
    instantInitial: (nom) => parNom[cleDe(nom)]?.maintenant,
    charger(nom) {
      const propre = cleDe(nom);
      const donnees = parNom[propre];
      if (!donnees) return { nom, operations: [] };
      const scenario = composerScenario(nom, donnees);
      // Le client prend la première implémentation d'une opération : celles de la planche demandée
      // priment, puis toutes les autres planches répondent, pour que la navigation de démonstration
      // (une planche ouverte avec `?scenario=` d'une autre) ne tombe jamais sur « non implémenté ».
      const operations = [...scenario.operations];
      const flux = [...(scenario.flux ?? [])];
      for (const [autre, autresDonnees] of Object.entries(parNom)) {
        if (autre === propre) continue;
        try {
          const s = composerScenario(autre, autresDonnees);
          operations.push(...s.operations);
          flux.push(...(s.flux ?? []));
        } catch {
          // une planche dont le mock n'est pas installable n'empêche pas les autres
        }
      }
      return { nom, operations, flux };
    },
  };
}
