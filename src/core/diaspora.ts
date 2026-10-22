// Diaspora : payer depuis l'étranger, en euros, directement chez le prestataire du proche.
import { EUR_FCFA } from './money.ts';
export const FRAIS_DIASPORA_EUR = 0;
export type MoyenPaiement = 'visa' | 'applepay' | 'sepa';
export const MOYENS: Record<MoyenPaiement, { nom: string; court: string }> = { visa: { nom: 'Visa 4410', court: 'carte' }, applepay: { nom: 'Apple Pay', court: 'Apple Pay' }, sepa: { nom: 'Virement', court: 'virement SEPA' } };
export const totalEuro = (fcfa: number) => fcfa / EUR_FCFA + FRAIS_DIASPORA_EUR;
export interface EtapePaiement { titre: string; sous: string; heure: string }
/** Les 4 étapes d'un paiement depuis l'étranger, avec l'heure de chacune (la clinique signe quelques minutes après). */
export function etapes(partenaire: string, moyenLibelle: string, ville: string, debut: number, delaiSigne = 29 * 60_000): EtapePaiement[] {
  const h = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  return [
    { titre: 'Carte débitée', sous: `${moyenLibelle} · ${ville}`, heure: h(debut) },
    { titre: 'Reçu par AssureMe', sous: 'Change au taux fixe, 0 frais', heure: h(debut) },
    { titre: `Versé à ${partenaire}`, sous: 'Compte du partenaire', heure: h(debut + 60_000) },
    { titre: `Reçu signé par ${partenaire}`, sous: 'Proche prévenu par SMS', heure: h(debut + delaiSigne) }
  ];
}
