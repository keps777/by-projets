// Démarrage du siège : ajoute (une fois) les données de démonstration du rapprochement et du journal.
import { injecterDemo } from './demo.ts';
export default function demarrer() { try { injecterDemo(); } catch { /* le siège reste utilisable sans ces données */ } }
