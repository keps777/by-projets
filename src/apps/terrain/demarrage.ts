// Au démarrage de l'application : crée les tranches du terrain et confie les départs de démonstration à Émile (chauffeur) et Youssouf (convoyeur).
import { affecterEquipages } from './route.ts';
import { convoyeurEtat, terrain } from './etat.ts';
export default function demarrerTerrain() { terrain(); convoyeurEtat(); affecterEquipages(); }
