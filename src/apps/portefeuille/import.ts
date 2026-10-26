// Import d'un billet acheté ailleurs : le registre simulé des réservations des compagnies, les compagnies partenaires de la phase pilote et la vérification d'éligibilité.
// Démo : aucune donnée n'est transmise à une compagnie et aucun billet réel n'est transféré. Fonctions pures sur le monde (aucune écriture).
import { arrondi } from '../../core/argent.ts';
import { departDe, peutEchanger } from '../../core/regles.ts';
import type { Monde, Vol } from '../../domain/types.ts';

export type CompagnieImport = 'aerolys' | 'nordelle' | 'autre';
export const COMPAGNIES_IMPORT: { id: CompagnieImport; nom: string }[] = [{ id: 'aerolys', nom: 'Aérolys' }, { id: 'nordelle', nom: 'Nordelle' }, { id: 'autre', nom: 'Autre compagnie' }];
/** Compagnies partenaires de la phase pilote (hypothèse) : seules leurs réservations peuvent être confiées à NexG-TT. */
export const PARTENAIRES_PILOTE: CompagnieImport[] = ['aerolys'];
/** Prix payé : borne haute acceptée à la saisie (garde-fou, le prix est déclaratif et jamais vérifié). */
export const PRIX_MAX = 20_000;
/** Délai simulé de la vérification auprès de la compagnie (ms). */
export const DELAI_VERIFICATION = 1400;

export interface ReservationExterne { pnr: string; nom: string; compagnie: CompagnieImport; volId: string; transferable: boolean }
/** Les réservations « chez les compagnies » que la démo sait retrouver. Q7RT2M / EXEMPLE est l'exemple affiché dans le formulaire. */
export const RESERVATIONS_EXTERNES: ReservationExterne[] = [
  { pnr: 'Q7RT2M', nom: 'EXEMPLE', compagnie: 'aerolys', volId: 'v-ae822', transferable: true },
  { pnr: 'K4D8NW', nom: 'TREMBLAY', compagnie: 'aerolys', volId: 'v-ae563', transferable: true },
  { pnr: 'T9R2NF', nom: 'DURAND', compagnie: 'aerolys', volId: 'v-ae202', transferable: false },
  { pnr: 'N5X7PC', nom: 'EXEMPLE', compagnie: 'nordelle', volId: 'v-no620', transferable: true }
];
export interface DemandeImport { compagnie: CompagnieImport | ''; pnr: string; nom: string; /** Texte saisi du prix payé. */ prix: string }
export type ErreursImport = Partial<Record<keyof DemandeImport, string>>;
export const nomCompagnie = (c: CompagnieImport | ''): string => COMPAGNIES_IMPORT.find((x) => x.id === c)?.nom ?? '';
/** Normalise la référence : majuscules, lettres et chiffres, 6 caractères au plus. */
export const normaliserPnr = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
/** Compare des noms sans tenir compte des accents, de la casse ni des espaces. */
export const memeNom = (a: string, b: string): boolean => { const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, ''); return n(a) !== '' && n(a) === n(b); };
/** « 1 250 », « 1250,50 $ » → 1250 / 1250.5 ; NaN si illisible. */
export function lirePrix(s: string): number { const t = s.replace(/[\s $]/g, '').replace(',', '.'); return /^\d+(\.\d{1,2})?$/.test(t) ? arrondi(Number(t)) : NaN; }

/** Erreurs de saisie, champ par champ (messages du formulaire). */
export function valider(d: DemandeImport): ErreursImport {
  const e: ErreursImport = {};
  if (!d.compagnie) e.compagnie = 'Choisissez la compagnie qui a émis le billet.';
  if (!/^[A-Z0-9]{6}$/.test(d.pnr)) e.pnr = 'La référence compte 6 lettres ou chiffres.';
  if (!d.nom.trim()) e.nom = 'Indiquez le nom tel qu’il figure sur la réservation.';
  const p = lirePrix(d.prix);
  if (!d.prix.trim()) e.prix = 'Indiquez le prix que vous avez payé.'; else if (!Number.isFinite(p) || p <= 0) e.prix = 'Indiquez un montant en dollars, par exemple 1 250.'; else if (p > PRIX_MAX) e.prix = `Le montant ne peut pas dépasser ${PRIX_MAX.toLocaleString('fr-CA')} $.`;
  return e;
}
export type MotifRefus = 'non_partenaire' | 'introuvable' | 'tarif' | 'echeance' | 'deja_importe';
export type Eligibilite = { ok: true; reservation: ReservationExterne; vol: Vol; compagnie: string } | { ok: false; motif: MotifRefus; titre: string; texte: string };
/** Vérifie l'éligibilité (simulation) : compagnie partenaire, réservation retrouvée avec le nom du passager, tarif transférable, échéance non passée, pas déjà importé. */
export function verifier(m: Monde, d: DemandeImport, now: number): Eligibilite {
  const cie = nomCompagnie(d.compagnie);
  if (!d.compagnie || !PARTENAIRES_PILOTE.includes(d.compagnie)) return { ok: false, motif: 'non_partenaire', titre: 'Compagnie pas encore partenaire', texte: 'On vous prévient dès que l’import est possible. Votre billet reste géré par la compagnie, sans changement.' };
  const r = RESERVATIONS_EXTERNES.find((x) => x.compagnie === d.compagnie && x.pnr === d.pnr && memeNom(x.nom, d.nom));
  if (!r) return { ok: false, motif: 'introuvable', titre: 'Réservation introuvable', texte: `${cie} ne retrouve pas cette référence avec ce nom de passager. Vérifiez les six caractères et le nom tel qu’inscrit sur la confirmation.` };
  const vol = m.vols.find((v) => v.id === r.volId);
  if (!vol) return { ok: false, motif: 'introuvable', titre: 'Vol introuvable', texte: 'Le vol de cette réservation n’est plus au programme.' };
  if (m.droits.some((x) => x.pnr === r.pnr)) return { ok: false, motif: 'deja_importe', titre: 'Billet déjà dans NexG-TT', texte: 'Cette réservation est déjà inscrite au registre : un billet ne peut être importé qu’une fois.' };
  if (!r.transferable) return { ok: false, motif: 'tarif', titre: 'Tarif non transférable', texte: 'Certaines conditions tarifaires interdisent toute cession ; le billet reste chez la compagnie, sans changement.' };
  if (!peutEchanger(departDe(vol.jour, vol.heureDepart), now)) return { ok: false, motif: 'echeance', titre: 'Échéance passée', texte: 'Ce vol part dans moins de 24 h : plus aucune transaction n’est possible, le billet reste chez la compagnie.' };
  return { ok: true, reservation: r, vol, compagnie: cie };
}
