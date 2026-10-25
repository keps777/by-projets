// Moment de marque de l'accueil : la première ligne alterne, de temps en temps, entre la salutation et un court « jingle » visuel et sonore d'AfriMove.
// Logique pure (aucun accès au navigateur) : message suivant, planning, autorisations. Les composants ne font que l'appliquer.

export type Moment = 'salut' | 'marque';
export type ModeEntete = 'normal' | 'rapide';

/** Durée du moment de marque (logo qui pulse, mot lettre par lettre, promesse). */
export const MARQUE_MS = 1600;
/** Nombre maximal de changements de la première ligne (aller-retour compris) : la rotation s'arrête ensuite, sur la salutation. */
export const MAX_CHANGEMENTS = 10;
export const PROMESSE = 'Tout le transport, dans ta poche.';
export const MOT_MARQUE = 'AfriMove';

export interface EtatEntete { moment: Moment; changements: number }
export const enteteInitial = (): EtatEntete => ({ moment: 'salut', changements: 0 });

export interface Rythme { premier: number; intervalle: number; marque: number }
/** `normal` : premier changement à ~4 s puis toutes les ~8 s ; `rapide` (`?entete=rapide`) : pour les démonstrations et les tests. */
export const rythme = (mode: ModeEntete = 'normal'): Rythme => (mode === 'rapide' ? { premier: 600, intervalle: 2000, marque: MARQUE_MS } : { premier: 4000, intervalle: 8000, marque: MARQUE_MS });

/** Attente avant le prochain changement, ou `null` quand la rotation est terminée. */
export function delaiAvant(e: EtatEntete, r: Rythme = rythme()): number | null {
  if (e.moment === 'marque') return r.marque; // le retour à la salutation est toujours accordé
  if (e.changements >= MAX_CHANGEMENTS) return null;
  return e.changements === 0 ? r.premier : r.intervalle;
}
/** Le changement suivant : salutation ↔ marque. */
export const suivant = (e: EtatEntete): EtatEntete => ({ moment: e.moment === 'salut' ? 'marque' : 'salut', changements: e.changements + 1 });
/** Une pause pendant le moment de marque ramène tout de suite à la salutation (sans compter un tour de plus). */
export const interrompre = (e: EtatEntete): EtatEntete => (e.moment === 'marque' ? { moment: 'salut', changements: e.changements } : e);

export interface ContexteRotation { visible: boolean; ecranVisible: boolean; fenetreOuverte: boolean; appui: boolean; horsEcran: boolean; mouvementReduit: boolean }
/** La rotation ne tourne que si rien ne la gêne : onglet visible, aucune fenêtre ouverte, pas d'appui, entête à l'écran, animations permises. */
export const rotationEnPause = (c: ContexteRotation): boolean => !c.visible || !c.ecranVisible || c.fenetreOuverte || c.appui || c.horsEcran || c.mouvementReduit;

/** Animations de l'accueil permises ? `?entete=anime|rapide` (ou `?bandeau=anime`) les réveille sous automatisation ; le mouvement réduit les coupe toujours. */
export function animationsPermises(o: { automatise: boolean; parametre: string | null; mouvementReduit: boolean }): boolean {
  if (o.mouvementReduit) return false;
  if (o.parametre === 'anime' || o.parametre === 'rapide') return true;
  return !o.automatise;
}
export const modeDe = (parametre: string | null): ModeEntete => (parametre === 'rapide' ? 'rapide' : 'normal');

/** Le sting ne joue que si la personne a déjà touché la page (jamais de son au chargement) ET que « Sons et jingle » est actif. */
export const sonPermis = (o: { aInteragi: boolean; sonsActifs: boolean }): boolean => o.aInteragi && o.sonsActifs;

/** Lettres du mot de marque, avec le retard d'entrée de chacune (cascade). */
export const lettres = (mot: string = MOT_MARQUE, pasMs = 55): { c: string; retard: number }[] => [...mot].map((c, i) => ({ c, retard: 140 + i * pasMs }));
