import type { Instant, IsoDouala } from "./temps";
import { versIsoDouala } from "./temps";

/** Une transition demandée n'existe pas dans la machine d'états. */
export class TransitionInterdite extends Error {
  constructor(
    readonly machine: string,
    readonly de: string,
    readonly action: string,
  ) {
    super(`Transition interdite (${machine}) : « ${action} » depuis l'état « ${de} »`);
    this.name = "TransitionInterdite";
  }
}

export interface DefinitionMachine<E extends string, A extends string> {
  readonly nom: string;
  readonly etats: readonly E[];
  readonly actions: readonly A[];
  readonly initial: E;
  readonly transitions: Readonly<Record<E, Readonly<Partial<Record<A, E>>>>>;
}

/** Valide la cohérence de la table (états et actions connus) puis la renvoie. */
export function creerMachine<E extends string, A extends string>(
  def: DefinitionMachine<E, A>,
): DefinitionMachine<E, A> {
  if (!def.etats.includes(def.initial)) throw new Error(`${def.nom} : état initial inconnu`);
  for (const etat of def.etats) {
    const sorties = def.transitions[etat];
    if (!sorties) throw new Error(`${def.nom} : transitions manquantes pour « ${etat} »`);
    for (const [action, vers] of Object.entries(sorties) as [A, E][]) {
      if (!def.actions.includes(action))
        throw new Error(`${def.nom} : action inconnue « ${action} »`);
      if (!def.etats.includes(vers)) throw new Error(`${def.nom} : état cible inconnu « ${vers} »`);
    }
  }
  return def;
}

export function etatSuivant<E extends string, A extends string>(
  machine: DefinitionMachine<E, A>,
  etat: E,
  action: A,
): E {
  const vers = machine.transitions[etat]?.[action];
  if (vers === undefined) throw new TransitionInterdite(machine.nom, etat, action);
  return vers;
}

export function peutAppliquer<E extends string, A extends string>(
  machine: DefinitionMachine<E, A>,
  etat: E,
  action: A,
): boolean {
  return machine.transitions[etat]?.[action] !== undefined;
}

export function actionsPossibles<E extends string, A extends string>(
  machine: DefinitionMachine<E, A>,
  etat: E,
): A[] {
  return Object.keys(machine.transitions[etat] ?? {}) as A[];
}

export function estTerminal<E extends string, A extends string>(
  machine: DefinitionMachine<E, A>,
  etat: E,
): boolean {
  return actionsPossibles(machine, etat).length === 0;
}

/** Trace d'une transition : on n'efface rien, on ajoute. */
export interface EntreeHistorique<E extends string, A extends string> {
  readonly action: A;
  readonly de: E;
  readonly vers: E;
  readonly at: IsoDouala;
  readonly par?: string;
  readonly motif?: string;
}

export interface MetaTransition {
  readonly at: Instant;
  readonly par?: string;
  readonly motif?: string;
}

export interface Historise<E extends string, A extends string> {
  readonly etat: E;
  readonly historique: readonly EntreeHistorique<E, A>[];
}

/** Applique une action : renvoie une nouvelle entité, l'ancienne n'est pas modifiée. */
export function appliquerAction<E extends string, A extends string, T extends Historise<E, A>>(
  machine: DefinitionMachine<E, A>,
  entite: T,
  action: A,
  meta: MetaTransition,
): T {
  const vers = etatSuivant(machine, entite.etat, action);
  const entree: EntreeHistorique<E, A> = {
    action,
    de: entite.etat,
    vers,
    at: versIsoDouala(meta.at),
    ...(meta.par !== undefined ? { par: meta.par } : {}),
    ...(meta.motif !== undefined ? { motif: meta.motif } : {}),
  };
  return { ...entite, etat: vers, historique: [...entite.historique, entree] };
}
