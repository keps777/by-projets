// Au lancement : les comptes suspendus « pour la journée » reprennent le lendemain.
import { leverSuspensions } from './actions.ts';
export default function demarrage() { leverSuspensions(); }
