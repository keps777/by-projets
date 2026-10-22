import { rattraperPaies } from '../../data/paie.ts';
let fait = false;
/** Au premier passage connecté : rattrape les paies manquées. */
export default function demarrage() { if (fait) return; fait = true; rattraperPaies(); }
