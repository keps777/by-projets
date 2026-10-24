import { maintenant } from '../../data/store.svelte.ts';
import { etat } from './etat.ts';

/** Au lancement : crée la tranche du guichet (jamais depuis un `$derived`). */
export default function demarrerGuichet() { const e = etat(); if (!e.derniereSync) e.derniereSync = maintenant(); }
