// Démarrage du patron : crée ses tranches d'état, charge l'historique de démonstration si le monde est vide et coupe la session d'une personne suspendue.
import { app } from '../../data/store.svelte.ts';
import { deconnecter } from '../../domain/actions.ts';
import { assurerHistorique } from './actions.ts';
import { etatAssistant, etatFinancement, etatInterAgences, etatPatron } from './etat.ts';

export default function demarrage() {
  etatPatron(); etatAssistant(); etatFinancement(); etatInterAgences();
  assurerHistorique();
  const id = app.session.personneId;
  if (id && app.monde.personnes.find((p) => p.id === id)?.actif === false) deconnecter();
}
