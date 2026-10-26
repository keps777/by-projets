// Nommer le voyageur : saisie, validation et construction du `Voyageur` transmis à la compagnie. Fonctions pures.
import type { Compte, Voyageur } from '../../domain/types.ts';

export type Qui = 'moi' | 'proche' | 'nouveau';
export type Genre = '' | 'F' | 'M' | 'X';
export interface SaisieVoyageur { nom: string; prenom: string; naissance: string; genre: Genre; document: string }
export interface ErreursVoyageur { nom?: string; prenom?: string; naissance?: string; document?: string; proche?: string }
export const SAISIE_VIDE: SaisieVoyageur = { nom: '', prenom: '', naissance: '', genre: '', document: '' };
export const GENRES: { valeur: Genre; libelle: string }[] = [{ valeur: '', libelle: 'Choisir' }, { valeur: 'F', libelle: 'Féminin' }, { valeur: 'M', libelle: 'Masculin' }, { valeur: 'X', libelle: 'X — si accepté' }];

/** Les données de profil du compte, à vérifier : prénom et nom (la date de naissance n'est pas connue du profil). */
export const saisieDuCompte = (c: Pick<Compte, 'prenom' | 'nom'>): SaisieVoyageur => ({ ...SAISIE_VIDE, prenom: c.prenom, nom: c.nom });

const jourIso = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function erreurNaissance(s: string, maintenant: number): string {
  if (!s.trim()) return 'Indiquez la date de naissance.';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim()); if (!m) return 'Date de naissance invalide.';
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])], d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j || a < 1900) return 'Date de naissance invalide.';
  return s.trim() > jourIso(maintenant) ? 'La date de naissance ne peut pas être dans le futur.' : '';
}
/** Numéro de document : facultatif (« si exigé »), mais 6 à 12 lettres ou chiffres s'il est donné. */
export const erreurDocument = (s: string): string => (!s.trim() || /^[A-Za-z0-9]{6,12}$/.test(s.replace(/[\s-]/g, '')) ? '' : 'Numéro invalide : 6 à 12 lettres ou chiffres.');
/** Un nom ou prénom de passeport : au moins une lettre, ni chiffre ni symbole inattendu. */
const nomValide = (s: string) => /^[\p{L}][\p{L}\s'’.-]*$/u.test(s.trim());
export function erreursVoyageur(qui: Qui, s: SaisieVoyageur, procheChoisi: string | null, maintenant: number): ErreursVoyageur {
  if (qui === 'proche') return procheChoisi ? {} : { proche: 'Choisissez le proche qui voyage.' };
  const e: ErreursVoyageur = {};
  if (!s.nom.trim()) e.nom = 'Indiquez le nom tel qu’inscrit sur le passeport.'; else if (!nomValide(s.nom)) e.nom = 'Le nom ne peut contenir que des lettres.';
  if (!s.prenom.trim()) e.prenom = 'Indiquez le ou les prénoms tels qu’inscrits sur le passeport.'; else if (!nomValide(s.prenom)) e.prenom = 'Le prénom ne peut contenir que des lettres.';
  const n = erreurNaissance(s.naissance, maintenant); if (n) e.naissance = n;
  const d = erreurDocument(s.document); if (d) e.document = d;
  return e;
}
/** Le voyageur tel que transmis (« pour soi » si c'est le détenteur lui-même). `proche` : le compte du proche choisi. */
export function construireVoyageur(qui: Qui, s: SaisieVoyageur, moi: Pick<Compte, 'id' | 'prenom' | 'nom'>, proche?: Pick<Compte, 'id' | 'prenom' | 'nom'>): Voyageur {
  if (qui === 'proche' && proche) return { prenom: proche.prenom.trim(), nom: proche.nom.trim(), pourSoi: false, compteId: proche.id };
  const v: Voyageur = { prenom: s.prenom.trim(), nom: s.nom.trim(), pourSoi: qui === 'moi' };
  if (s.naissance.trim()) v.naissance = s.naissance.trim(); if (s.genre) v.genre = s.genre; if (s.document.trim()) v.document = s.document.replace(/\s+/g, '').toUpperCase();
  if (qui === 'moi') v.compteId = moi.id;
  return v;
}
/** « ALEX TREMBLAY » : le nom tel qu'il apparaît sur la carte d'embarquement (prénom puis nom, en capitales). */
export const nomEnCapitales = (v: Pick<Voyageur, 'prenom' | 'nom'>): string => `${v.prenom} ${v.nom}`.trim().toUpperCase();
/** La ligne « Voyageur transmis » du pied de page. */
export function ligneVoyageur(qui: Qui, s: SaisieVoyageur, procheChoisi?: Pick<Compte, 'prenom' | 'nom'>): string {
  if (qui === 'proche') return procheChoisi ? nomEnCapitales(procheChoisi) : 'À choisir';
  const l = nomEnCapitales(s); return l ? l : 'À compléter';
}
/** Les proches enregistrés du compte (comptes existants), dans l'ordre de `compte.proches`. */
export function procheDe(compte: Pick<Compte, 'proches'>, comptes: Compte[]): Compte[] {
  return compte.proches.map((id) => comptes.find((c) => c.id === id)).filter((c): c is Compte => !!c && c.actif);
}
