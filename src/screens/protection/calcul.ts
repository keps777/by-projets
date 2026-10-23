// Calculs purs de la protection famille (testés dans protection.test.ts).
import { prime, type Assure } from '../../core/protection.ts';
import { PLAFOND_CAPITAL, primeParAge, verifierAge } from '../../core/services.ts';
import type { Niveau } from '../../core/credit.ts';
import type { AssureP, EtatProtection, Sinistre, Souscription } from './etat.ts';

export const sousTitre = (a: AssureP) => (a.age === null ? 'Âge à renseigner' : `${a.age} ans${a.lien === 'vous' ? ' · inclus' : ''}${a.ville && a.lien !== 'vous' ? ` · ${a.ville}` : ''}`);
/** Assuré au format du noyau de calcul (le souscripteur est inclus dans la base : prime 0). */
export const versNoyau = (a: AssureP): Assure => ({ id: a.id, nom: a.nom, sous: sousTitre(a), age: a.age ?? 0, prime: a.lien === 'vous' ? 0 : primeParAge(a.age ?? 0) });

export const couverts = (e: Pick<EtatProtection, 'assures'>) => e.assures.filter((a) => a.couvert && !a.dossier);
export const primeSelection = (e: Pick<EtatProtection, 'assures' | 'capital'>) => prime(couverts(e).map(versNoyau), e.capital);
export const primeDe = (assures: AssureP[], ids: string[], capital: number) => prime(assures.filter((a) => ids.includes(a.id)).map(versNoyau), capital);

/** Message d'erreur si la sélection ne peut pas être souscrite. */
export function verifierSouscription(e: EtatProtection, niveau: Niveau): string | null {
  const moi = e.assures.find((a) => a.lien === 'vous');
  if (!moi || moi.age === null) return 'Renseignez votre âge pour activer la protection.';
  for (const a of couverts(e)) { const v = verifierAge(a.age); if (!v.ok) return `${a.nom} : ${v.erreur}`; }
  if (e.capital > PLAFOND_CAPITAL[niveau]) return `Capital limité à ${PLAFOND_CAPITAL[niveau].toLocaleString('fr-FR')} FCFA à votre niveau.`;
  return null;
}
/** La sélection diffère-t-elle de la souscription en vigueur ? */
export function aChange(e: EtatProtection): boolean {
  const s = e.souscription; if (!s) return true;
  const ids = couverts(e).map((a) => a.id).sort();
  return s.capital !== e.capital || ids.join() !== [...s.assureIds].sort().join();
}
export const couvertsDeSouscription = (e: EtatProtection, s: Souscription | null = e.souscription) => (s ? e.assures.filter((a) => s.assureIds.includes(a.id)) : []);

export function verifierDeclaration(ville: string): string | null { return ville.trim().length < 2 ? 'Indiquez la ville du décès.' : ville.length > 24 ? 'Ville trop longue (24 caractères).' : null; }

export interface EtapeSinistre { titre: string; sous: string; atteinte: boolean }
export function etapesSinistre(s: Sinistre, now: number): EtapeSinistre[] {
  return [
    { titre: 'Déclaration reçue', sous: `Dossier ${s.numero}`, atteinte: true },
    { titre: 'Un conseiller vous rappelle', sous: 'dans l\'heure', atteinte: now >= s.ts + 3_600_000 },
    { titre: 'Capital versé', sous: `${s.capital.toLocaleString('fr-FR')} FCFA sur votre compte, sous 48 h`, atteinte: s.verse || now >= s.versementPrevu }
  ];
}
