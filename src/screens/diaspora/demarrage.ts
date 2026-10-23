import { avancer } from './actions.ts';
let fait = false;
/** À la connexion : signe les reçus échus, puis surveille toutes les 20 s. */
export default function demarrage() {
  if (fait) return; fait = true;
  avancer();
  setInterval(avancer, 20_000);
}
