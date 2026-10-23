// Prix du Pass pour un membre : prix du Pass moins la part payée par l'employeur, plafonnée.
// Deux sources existent pour cette part : le portail entreprise (employeur partenaire validé, voir `partEmployeurDuPass`) et le code
// employeur saisi à l'inscription. Le portail fait foi dès qu'il connaît l'employeur du compte ; sinon on retombe sur le code.
import type { Compte, Pass } from '../../data/types.ts';
import { tarifPass, trouverEmployeur, type Facturation, type TarifPass } from '../../core/inscription.ts';
import { entrepriseDe, partEmployeurDuPass } from '../../portals/entreprise/etat.ts';

export function tarifPassMembre(compte: Compte, pass: Pass, facturation: Facturation, codeEmployeur: string): TarifPass {
  const t = tarifPass(pass, facturation, trouverEmployeur(codeEmployeur));
  if (!entrepriseDe(compte)) return t;
  const mois = facturation === 'annuel' ? 12 : 1;
  const employeur = Math.min(partEmployeurDuPass({ ...compte, pass }) * mois, t.total);
  return { ...t, employeur, membre: t.total - employeur };
}
