// Attestation de salaire délivrée par l'employeur : texte à imprimer ou joindre à un dossier de crédit.
import { jourLong, type Jour } from './dates.ts';
import { fcfaUnite } from './money.ts';

export interface EntreeAttestation {
  numero: string; employeur: string; ville: string; signataire: string; fonction: string;
  salarie: string; matricule: string; salaire: number; jourPaie: number; anciennete?: string; date: Jour;
}
/** Les paragraphes de l'attestation (un élément = un paragraphe). */
export function texteAttestation(e: EntreeAttestation): string[] {
  const depuis = e.anciennete ? ` et fait partie de ses effectifs depuis ${e.anciennete}` : '';
  return [
    `Je soussigné(e) ${e.signataire}, ${e.fonction} de ${e.employeur}, atteste que ${e.salarie} (matricule ${e.matricule}) est employé(e) par notre entreprise${depuis}.`,
    `Son salaire net mensuel est de ${fcfaUnite(e.salaire)}, versé le ${e.jourPaie} de chaque mois.`,
    `Cette attestation est délivrée pour servir et valoir ce que de droit, notamment auprès d'AssureMe.`,
    `Fait à ${e.ville}, le ${jourLong(e.date)}.`
  ];
}
