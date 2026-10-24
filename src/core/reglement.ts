// Règlement : logique pure du tunnel de réservation (numéros, carte, chrono), du plan de sièges (choix rapide),
// de la cagnotte « bus entier » et des messages WhatsApp. Aucun accès au monde : tout est testable.
import { ajouterJours, type Jour } from './dates.ts';
import type { Siege } from './sieges.ts';

// ------------------------------------------------------------------ numéros de téléphone (Cameroun)
export const chiffres = (s: string) => s.replace(/\D/g, '');
/** Numéro national à 9 chiffres (retire +237 / 237). */
export function normaliserTel(s: string): string { let d = chiffres(s); if (d.startsWith('237') && d.length === 12) d = d.slice(3); return d; }
/** Mobile camerounais : 9 chiffres commençant par 6. */
export const telValide = (s: string) => /^6\d{8}$/.test(normaliserTel(s));
/** « 691221008 » → « 6 91 22 10 08 ». */
export function formaterTel(s: string): string {
  const d = normaliserTel(s); return d.length === 9 ? `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : s;
}
export const MOTIF_SOLDE = 'Solde insuffisant';
/** Règle de la démonstration : un numéro qui se termine par 00 est refusé par l'opérateur. */
export const refusAutomatique = (tel: string): string | null => (normaliserTel(tel).endsWith('00') ? MOTIF_SOLDE : null);

// ------------------------------------------------------------------ moyens de paiement
export type MoyenChoisi = 'momo' | 'om' | 'carte' | 'visage';
export interface Operateur { nom: string; court: string; operateur: string; abrev: string; couleur: string; ussd: string | null; delai: string }
export const OPERATEURS: Record<MoyenChoisi | 'proche' | 'especes', Operateur> = {
  momo: { nom: 'MTN MoMo', court: 'MoMo', operateur: 'MTN', abrev: 'MoMo', couleur: '#FFCC00', ussd: '*126#', delai: 'instantané' },
  om: { nom: 'Orange Money', court: 'Orange Money', operateur: 'Orange', abrev: 'OM', couleur: '#FF7900', ussd: '#150#', delai: 'instantané' },
  carte: { nom: 'Carte bancaire', court: 'carte', operateur: 'ta banque', abrev: 'VISA', couleur: '#7FB8FF', ussd: null, delai: '3-D Secure' },
  visage: { nom: 'Visage · Face ID', court: 'visage', operateur: 'MTN', abrev: 'ID', couleur: '#7CF0A6', ussd: '*126#', delai: 'sans code' },
  proche: { nom: 'Un proche paie', court: 'proche', operateur: 'MTN', abrev: 'PR', couleur: '#FF9BEA', ussd: '*126#', delai: 'lien WhatsApp' },
  especes: { nom: 'Espèces au guichet', court: 'espèces', operateur: 'le guichet', abrev: 'F', couleur: '#B3A8FF', ussd: null, delai: 'au guichet' }
};
/** Moyen « de l'autre côté » pour réessayer après un refus. */
export const autreMoyen = (m: MoyenChoisi | 'proche' | 'especes'): MoyenChoisi => (m === 'momo' || m === 'visage' ? 'om' : 'momo');

// ------------------------------------------------------------------ carte bancaire
export interface Carte { numero: string; expiration: string; cvc: string; titulaire: string }
export function luhn(numero: string): boolean {
  const d = chiffres(numero); if (d.length < 13 || d.length > 19) return false;
  let somme = 0, double = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = Number(d[i]); if (double) { n *= 2; if (n > 9) n -= 9; } somme += n; double = !double; }
  return somme % 10 === 0;
}
export const formaterNumeroCarte = (s: string) => (chiffres(s).slice(0, 19).match(/.{1,4}/g) ?? []).join(' ');
export function formaterExpiration(s: string): string { const d = chiffres(s).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; }
/** Erreurs par champ (objet vide = carte valide). `maintenant` : ms depuis l'époque. */
export function validerCarte(c: Carte, maintenant: number): Partial<Record<keyof Carte, string>> {
  const e: Partial<Record<keyof Carte, string>> = {};
  if (!luhn(c.numero)) e.numero = 'Numéro de carte invalide';
  const m = /^(\d{2})\/(\d{2})$/.exec(c.expiration);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiration = 'Date invalide (MM/AA)';
  else { const d = new Date(maintenant), fin = 2000 + Number(m[2]) * 1 , mois = Number(m[1]); if (fin < d.getFullYear() || (fin === d.getFullYear() && mois < d.getMonth() + 1)) e.expiration = 'Carte expirée'; }
  const amex = /^3[47]/.test(chiffres(c.numero));
  if (chiffres(c.cvc).length !== (amex ? 4 : 3)) e.cvc = amex ? '4 chiffres' : '3 chiffres';
  if (c.titulaire.trim().length < 3) e.titulaire = 'Nom du titulaire';
  return e;
}

// ------------------------------------------------------------------ chrono
/** « 9:48 » ; jamais négatif. */
export function chrono(ms: number): string { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ------------------------------------------------------------------ plan de sièges : choix rapide
export type CritereSiege = 'fenetre' | 'couloir' | 'devant';
/** Meilleur siège libre selon le critère (le plus en avant d'abord) ; null s'il n'y en a pas. */
export function meilleurSiege(plan: Siege[], indisponibles: Set<string>, critere: CritereSiege, exclus: string[] = []): string | null {
  const libres = plan.filter((s) => !indisponibles.has(s.id) && !exclus.includes(s.id));
  const ok = libres.filter((s) => (critere === 'fenetre' ? s.fenetre : critere === 'couloir' ? !s.fenetre : true));
  return ok[0]?.id ?? null;
}
/** Colonne de la grille à l'écran : on ménage le couloir (22 px) au milieu, 1 + 2 en VIP, 2 + 2 en Classique. */
export const colonneEcran = (classe: 'Classique' | 'VIP', colonne: number) => (classe === 'VIP' ? (colonne === 1 ? 1 : colonne + 1) : colonne);
export const MAX_PASSAGERS = 6;

// ------------------------------------------------------------------ cagnotte « bus entier »
export const TAILLES_BUS = [30, 50, 70] as const;
export type TailleBus = (typeof TAILLES_BUS)[number];
export const FORFAIT_BUS = 60_000;
export const PRIX_PAR_PLACE_BUS = 4_000;
/** Tarif d'un bus entier : forfait de 60 000 F + 4 000 F par place (30 → 180 000 F, 50 → 260 000 F, 70 → 340 000 F). */
export const totalBusEntier = (places: number) => FORFAIT_BUS + PRIX_PAR_PLACE_BUS * places;
/** Part par personne, arrondie à 100 F au-dessus : la cagnotte pleine couvre toujours le total. */
export const partParPersonne = (total: number, places: number) => Math.ceil(total / places / 100) * 100;
export const pourcentPaye = (payes: number, places: number) => (places > 0 ? Math.min(100, Math.round((payes / places) * 100)) : 0);
/** La cagnotte incomplète est remboursée à J-2 du voyage. */
export const DELAI_REMBOURSEMENT_JOURS = 2;
export const limiteRemboursement = (jourVoyage: Jour): Jour => ajouterJours(jourVoyage, -DELAI_REMBOURSEMENT_JOURS);
export const echeanceAtteinte = (jourVoyage: Jour, aujourdhui: Jour) => aujourdhui >= limiteRemboursement(jourVoyage);

// ------------------------------------------------------------------ billet
/** « AM7F3K22 » → « AM-7F3K-22 ». */
export const codeAffiche = (code: string) => (code.length === 8 ? `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}` : code);
/** Signal sonore hors ligne : une fréquence (Hz) par caractère du code, 600 → 1 800 Hz. */
export function frequencesCode(code: string): number[] {
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return [...code.toUpperCase()].map((c) => { const i = A.indexOf(c); return 600 + (i < 0 ? 0 : i) * 38; });
}

// ------------------------------------------------------------------ messages WhatsApp / SMS
export interface InfosMessage { payeur: string; voyageur: string; trajet: string; quand: string; places: string; code: string; montant: string }
export type ModeProche = 'paie' | 'demande' | 'partage';
export function messageProche(mode: ModeProche, i: InfosMessage, destinataire: string): string {
  if (mode === 'paie') return `AfriMove : ${i.payeur} a payé ton billet ${i.trajet}, ${i.quand}, ${i.places}. Code ${i.code}. Montre ce message au quai. Bon voyage ${destinataire} !`;
  if (mode === 'demande') return `AfriMove : ${i.voyageur} te demande de payer son billet ${i.trajet} (${i.montant}). Touche le lien ou compose *123# → 5. Merci ${destinataire} !`;
  return `AfriMove : ${i.voyageur} te partage son billet ${i.trajet}, ${i.quand}, ${i.places}. Code ${i.code}. Bon voyage ${destinataire} !`;
}
