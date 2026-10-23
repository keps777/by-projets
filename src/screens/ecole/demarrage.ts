// Prélèvement des mensualités du crédit école sur salaire (moteur de paie, voir data/paie.ts).
import { fournirPrelevements } from '../../data/paie.ts';
import { appliquerMensualite, creditsEcoleDus, reporterMensualite } from './actions.ts';

fournirPrelevements('ecole', (paie) =>
  creditsEcoleDus(paie).map((ech) => ({
    id: `ecole-${ech.credit.id}`, type: 'credit' as const,
    libelle: `Mensualité école ${ech.credit.payees + 1} / ${ech.credit.duree}`, detail: ech.credit.libelle, montant: ech.credit.mensualite,
    appliquer: () => appliquerMensualite(ech), reporter: () => reporterMensualite(ech)
  })));

let fait = false;
/** Rien à lancer : l'enregistrement se fait à l'import (le moteur de paie appelle le fournisseur). */
export default function demarrage() { if (fait) return; fait = true; }
