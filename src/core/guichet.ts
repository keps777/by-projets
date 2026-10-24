// Guichet : règles pures (plan du bus en grille, mode cadence, formats de codes et de téléphones, rendu de monnaie, attendu de caisse).
import { planSieges } from './sieges.ts';
import { TAILLES, prixColis } from './colis.ts';
import type { ClasseBus } from '../domain/types.ts';

// ------------------------------------------------------------------ mode cadence
/** Heures de pointe (minutes depuis minuit) : matin 05 h 30 – 09 h 30, soir 16 h 00 – 19 h 30. */
export const FENETRES_POINTE: [number, number][] = [[5 * 60 + 30, 9 * 60 + 30], [16 * 60, 19 * 60 + 30]];
export const estPointe = (minutesDuJour: number) => FENETRES_POINTE.some(([a, b]) => minutesDuJour >= a && minutesDuJour <= b);
/** Cadence de vente : billets par minute depuis la première vente (au moins 1 minute pour ne pas diviser par zéro). */
export const cadenceParMinute = (billets: number, minutesEcoulees: number) => (billets <= 0 ? 0 : Math.round((billets / Math.max(1, minutesEcoulees)) * 10) / 10);
export type EtatMontee = { texte: string; ton: 'ok' | 'er' | 'inf' };
/** Comptage au quai : montés comparés aux vendus et à la capacité. */
export function etatMontee(montes: number, vendus: number, capacite: number): EtatMontee & { ecart: number; message: string } {
  const ecart = vendus - montes;
  const message = ecart > 0 ? `${ecart} pas encore monté${ecart > 1 ? 's' : ''}` : ecart === 0 ? 'tout le monde est là' : `${-ecart} de trop · vérifier`;
  if (montes >= capacite && ecart >= 0) return { texte: 'complet', ton: 'ok', ecart, message };
  if (montes > vendus) return { texte: 'écart', ton: 'er', ecart, message };
  return { texte: 'en cours', ton: 'inf', ecart, message };
}

// ------------------------------------------------------------------ plan du bus en grille (avec couloir)
export interface CaseSiege { id: string; rang: number; col: number }
/** Classique : 2 + couloir + 2 ; VIP : 1 + couloir + 2. `colonnes` compte le couloir. */
export function grilleBus(classe: ClasseBus, capacite: number): { colonnes: number; rangs: number; cases: CaseSiege[] } {
  const plan = planSieges(classe, capacite), vip = classe === 'VIP';
  const cases = plan.map((s) => ({ id: s.id, rang: s.rang, col: vip ? [1, 3, 4][s.colonne - 1] : s.colonne }));
  return { colonnes: vip ? 4 : 5, rangs: cases.reduce((m, c) => Math.max(m, c.rang), 0), cases };
}

// ------------------------------------------------------------------ formats
/** AM7F3K22 → AM-7F3K-22 (lisible à voix haute au guichet). */
export const formaterCode = (code: string) => (/^AM[A-Z0-9]{6}$/.test(code) ? `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}` : code);
/** 691221008 → 6 91 22 10 08 */
export const formaterTel = (tel: string) => (/^\d{9}$/.test(tel) ? `${tel[0]} ${tel.slice(1, 3)} ${tel.slice(3, 5)} ${tel.slice(5, 7)} ${tel.slice(7)}` : tel);
/** Numéro camerounais à 9 chiffres (indicatif 237 et espaces tolérés) ; null si illisible. */
export function normaliserTel(texte: string): string | null {
  let t = texte.replace(/[^\d]/g, '');
  if (t.length === 12 && t.startsWith('237')) t = t.slice(3);
  return /^[62]\d{8}$/.test(t) ? t : null;
}
/** « am-c-9q2 », « AMC9Q2 » ou « 9q2 » → AM-C-9Q2 ; null si ce n'est pas un code de colis. */
export function normaliserCodeColis(texte: string): string | null {
  let t = texte.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith('AMC')) t = t.slice(3);
  return /^[A-Z0-9]{3}$/.test(t) ? `AM-C-${t}` : null;
}
/** Extrait un code de billet d'un QR (`code.sceau`) ou d'une saisie libre (« am-7f3k-22 »). */
export function codeBilletSaisi(texte: string): string {
  const brut = texte.trim().toUpperCase(), avantPoint = brut.includes('.') ? brut.split('.')[0] : brut;
  return avantPoint.replace(/[^A-Z0-9]/g, '');
}

// ------------------------------------------------------------------ monnaie
/** Monnaie à rendre ; null si le montant reçu ne couvre pas le dû. */
export const rendu = (recu: number, du: number) => (recu >= du ? recu - du : null);
/** Montants proposés en un geste : le juste prix puis les grosses coupures utiles. */
export const montantsRapides = (du: number) => [du, ...[5000, 10000, 20000, 50000].filter((m) => m > du)].slice(0, 4);

// ------------------------------------------------------------------ colis : taille réelle
const RANG = { S: 0, M: 1, L: 2 } as const;
/** Supplément à encaisser quand le colis est plus gros que déclaré (0 si identique ou plus petit : jamais de remboursement au dépôt). */
export function supplementTaille(declaree: keyof typeof TAILLES, reelle: keyof typeof TAILLES, o = { moto: false, assurance: false }) {
  return RANG[reelle] > RANG[declaree] ? prixColis(reelle, o) - prixColis(declaree, o) : 0;
}

// ------------------------------------------------------------------ caisse
export interface PiecesCaisse { fond: number; billetsEspeces: number; colisEspeces: number; supplements: number; remboursements: number }
/** Espèces attendues : fond + billets et colis encaissés (y compris ceux remboursés ensuite) + suppléments − espèces rendues. */
export const attenduGuichet = (p: PiecesCaisse) => p.fond + p.billetsEspeces + p.colisEspeces + p.supplements - p.remboursements;

// ------------------------------------------------------------------ messages d'erreur du domaine
const MESSAGES: Record<string, string> = {
  depart_inconnu: 'Départ introuvable', depart_ferme: 'Ce départ est fermé', demande_invalide: 'Demande incomplète', siege_double: 'Une place est choisie deux fois',
  siege_pris: 'Cette place vient d’être prise : choisis-en une autre', complet: 'Départ complet', caisse_fermee: 'Ouvre ta caisse avant de vendre', hors_ligne: 'Hors ligne : espèces seulement',
  recu_insuffisant: 'Le montant reçu ne couvre pas le prix', droit_refuse: 'Réservé à l’agent de guichet', cadence_desactivee: 'Le mode cadence est désactivé par le patron',
  justification_requise: 'Explique l’écart avant de clôturer', bordereau_requis: 'Photographie le bordereau de dépôt avant de clôturer', caisse_non_ouverte: 'Cette caisse n’est pas ouverte',
  fond_invalide: 'Fond de caisse invalide (0 à 500 000 F)', destinataire_invalide: 'Nom et numéro du destinataire à renseigner', colis_inconnu: 'Colis introuvable', billet_inconnu: 'Billet introuvable'
};
export const libelleErreur = (e: unknown) => { const code = e instanceof Error ? e.message : String(e); return MESSAGES[code] ?? 'Action impossible, réessaie'; };
