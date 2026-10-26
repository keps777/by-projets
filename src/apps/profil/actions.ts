// Logique du parcours « profil » (étapes 2 à 4, carte, identité, écran prêt) : fonctions pures + écritures sur le compte courant.
// Mode démo : aucune donnée de carte n'est conservée en dehors des 4 derniers chiffres ; aucune vraie vérification d'identité.
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import { AEROPORTS } from '../../data/seed.ts';
import { majCompte, setPrefsNotif } from '../../domain/compte.ts';
import type { Aeroport, Compte, Prefs } from '../../domain/types.ts';

/* ---------- tranche « profil » : ce que le compte ne porte pas ---------- */
export type Permission = 'inconnue' | 'accordee' | 'refusee';
export interface TrancheProfil { interets: string[]; rappelsJ1: boolean; permission: Permission }
export const profilParDefaut = (): TrancheProfil => ({ interets: ['last', 'drops'], rappelsJ1: true, permission: 'inconnue' });
/** À appeler depuis une action ou l'initialisation d'un écran (jamais depuis un `$derived`). */
export const profil = (): TrancheProfil => tranche<TrancheProfil>('profil', profilParDefaut);

/* ---------- étape 2 : faisons connaissance ---------- */
export const INTERETS: { id: string; label: string }[] = [
  { id: 'family', label: 'Voyages en famille' }, { id: 'last', label: 'Dernière minute' }, { id: 'drops', label: 'Drops membres' },
  { id: 'resell', label: 'Revendre mes billets' }, { id: 'business', label: 'Voyages d’affaires' }, { id: 'bags', label: 'Bagages en plus' }
];
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const libelleAeroport = (a: Aeroport) => `${a.ville} (${a.code})`;
/** « Montréal (YUL) », « yul » ou « montreal » → l'aéroport ; texte vide → YUL ; inconnu → undefined. */
export function trouverAeroport(texte: string): Aeroport | undefined {
  const t = texte.trim(); if (!t) return AEROPORTS[0];
  const code = /\(([A-Za-z]{3})\)\s*$/.exec(t)?.[1] ?? (/^[A-Za-z]{3}$/.test(t) ? t : undefined);
  if (code) { const a = AEROPORTS.find((x) => x.code === code.toUpperCase()); if (a) return a; }
  const n = sansAccent(t.replace(/\s*\([^)]*\)\s*$/, ''));
  return AEROPORTS.find((x) => sansAccent(x.ville) === n);
}
export const phraseBonjour = (prenom: string) => (prenom.trim() ? `Nous vous dirons « Bonjour ${prenom.trim()} ».` : 'Facultatif : laissez vide si vous préférez.');
export const phraseChoix = (n: number) => (n === 0 ? 'Aucun choix pour l’instant : c’est permis.' : `${n} choix sélectionné${n > 1 ? 's' : ''} sur ${INTERETS.length}`);
export function basculerInteret(liste: string[], id: string): string[] { return liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]; }

export interface DonneesProfil { prenom: string; nom: string; aeroport: string; interets: string[] }
/** Enregistre le profil sur le compte courant et fait avancer le brouillon d'inscription (étape 3). Renvoie une erreur de champ si l'aéroport est inconnu. */
export function enregistrerProfil(compteId: string, d: DonneesProfil): { ok: true } | { ok: false; erreur: string } {
  const a = trouverAeroport(d.aeroport);
  if (!a) return { ok: false, erreur: 'Aéroport inconnu : choisissez-en un dans la liste (par exemple Montréal (YUL)).' };
  const prenom = d.prenom.trim(), nom = d.nom.trim();
  majCompte(compteId, { prenom, nom, aeroport: a.code, ville: a.ville });
  profil().interets = d.interets.filter((i) => INTERETS.some((x) => x.id === i));
  app.session.inscription = { ...app.session.inscription, prenom, nom, etape: 3 };
  return { ok: true };
}

/* ---------- étape 3 : choix de partage ---------- */
export interface ChoixPartage { alertes: boolean; rappelsJ1: boolean; partenaires: boolean; audience: boolean }
export function lirePartage(c: Compte | undefined): ChoixPartage { return { alertes: c?.partage.offres ?? true, rappelsJ1: profil().rappelsJ1, partenaires: c?.partage.partenaires ?? false, audience: c?.partage.analyses ?? false }; }
/** Alertes → `partage.offres`, mesure d'audience → `partage.analyses`, offres partenaires → `partage.partenaires` ; le rappel J-1 vit dans la tranche « profil ». */
export function enregistrerPartage(compteId: string, p: ChoixPartage): void {
  majCompte(compteId, { partage: { offres: p.alertes, analyses: p.audience, partenaires: p.partenaires } });
  profil().rappelsJ1 = p.rappelsJ1; app.session.inscription = { ...app.session.inscription, etape: 4 };
}
export function resumePartage(p: ChoixPartage): string {
  const n = [p.alertes, p.rappelsJ1, p.partenaires, p.audience].filter(Boolean).length;
  return `Activés : le nécessaire, plus ${n} réglage${n > 1 ? 's' : ''} facultatif${n > 1 ? 's' : ''} sur 4.`;
}
export const nbPartages = (c: Compte) => 1 + [c.partage.offres, c.partage.analyses, c.partage.partenaires].filter(Boolean).length;

/* ---------- étape 4 : notifications ---------- */
export const CHOIX_NOTIF: { id: Prefs; titre: string; sous: string }[] = [
  { id: 'tout', titre: 'Tout', sous: 'Échéances, drops, prix et ventes.' },
  { id: 'essentiel', titre: 'L’essentiel', sous: 'Seulement les dates limites et les ventes.' },
  { id: 'rien', titre: 'Rien', sous: 'Aucune notification.' }
];
export const libellePrefs = (p: Prefs) => CHOIX_NOTIF.find((c) => c.id === p)?.titre ?? p;
/** Enregistre la fréquence choisie et l'issue de la demande d'autorisation (simulée : on n'appelle jamais `Notification.requestPermission`). */
export function enregistrerNotifications(compteId: string, prefs: Prefs, permission: Permission): void {
  setPrefsNotif(compteId, prefs); profil().permission = permission; app.session.inscription = { ...app.session.inscription, etape: 4 };
}

/* ---------- carte de démonstration ---------- */
export const chiffresDe = (s: string) => s.replace(/\D/g, '');
/** Contrôle de Luhn sur une suite de chiffres. */
export function luhn(numero: string): boolean {
  const c = chiffresDe(numero); if (c.length < 2 || c !== numero.replace(/\s/g, '')) return false;
  let somme = 0;
  for (let i = 0; i < c.length; i++) { let n = Number(c[c.length - 1 - i]); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } somme += n; }
  return somme % 10 === 0;
}
export const numeroCarteValide = (s: string) => chiffresDe(s).length === 16 && luhn(chiffresDe(s));
/** « 4242424242424242 » → « 4242 4242 4242 4242 » (16 chiffres au plus). */
export const formaterNumeroCarte = (s: string) => chiffresDe(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
/** « 1228 » → « 12/28 ». */
export function formaterExpiration(s: string): string { const c = chiffresDe(s).slice(0, 4); return c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c; }
/** MM/AA valide et non échue (la carte vaut jusqu'à la fin du mois indiqué). */
export function expirationValide(s: string, now = maintenant()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(s.trim()); if (!m) return false;
  const mois = Number(m[1]), an = 2000 + Number(m[2]); if (mois < 1 || mois > 12) return false;
  return new Date(an, mois, 1).getTime() > now;
}
export const cvcValide = (s: string) => /^\d{3}$/.test(s.trim());
export const quatreDerniers = (numero: string) => chiffresDe(numero).slice(-4);
/** « •••• •••• •••• 4242 » : le seul affichage possible d'une carte enregistrée. */
export const masquerCarte = (carte4: string) => `•••• •••• •••• ${carte4}`;
export interface ErreursCarte { numero?: string; exp?: string; cvc?: string }
export function erreursCarte(d: { numero: string; exp: string; cvc: string }): ErreursCarte {
  const e: ErreursCarte = {};
  if (chiffresDe(d.numero).length !== 16) e.numero = 'Le numéro compte 16 chiffres.'; else if (!luhn(chiffresDe(d.numero))) e.numero = 'Ce numéro de carte n’est pas valide : vérifiez les chiffres.';
  if (!expirationValide(d.exp)) e.exp = 'Date invalide ou échue (format MM/AA).';
  if (!cvcValide(d.cvc)) e.cvc = 'Le code de sécurité compte 3 chiffres.';
  return e;
}
/** Valide puis ne retient que les 4 derniers chiffres : ni numéro complet, ni date, ni code, ni nom ne sont conservés. */
export function enregistrerCarte(compteId: string, d: { numero: string; exp: string; cvc: string }): { ok: true; carte4: string } | { ok: false; erreurs: ErreursCarte } {
  const erreurs = erreursCarte(d); if (Object.keys(erreurs).length) return { ok: false, erreurs };
  const carte4 = quatreDerniers(d.numero); majCompte(compteId, { carte4 }); return { ok: true, carte4 };
}
export const retirerCarte = (compteId: string) => majCompte(compteId, { carte4: undefined });

/* ---------- identité (simulation) ---------- */
export const DOCUMENTS = [{ id: 'passeport', label: 'Passeport' }, { id: 'permis', label: 'Permis de conduire' }] as const;
export type TypeDocument = (typeof DOCUMENTS)[number]['id'];
/** Numéro de document de démonstration : 6 à 12 caractères alphanumériques. */
export const numeroDocumentValide = (s: string) => /^[A-Za-z0-9]{6,12}$/.test(s.replace(/[\s-]/g, ''));
/** Résultat simulé : un numéro fait uniquement de zéros est refusé (« document illisible »), tout autre est accepté. */
export const resultatIdentite = (s: string): 'ok' | 'refuse' => (/^0+$/.test(s.replace(/[\s-]/g, '')) ? 'refuse' : 'ok');
export function verifierIdentite(compteId: string): void { majCompte(compteId, { identiteVerifiee: maintenant() }); }

/* ---------- écran « prêt » ---------- */
/** Chemin de retour demandé par `?retour=` : relatif au site seulement (jamais d'adresse externe). */
export function retourSur(param: string | null | undefined, defaut = '/pret'): string {
  if (!param || !param.startsWith('/') || param.startsWith('//') || param.includes('\\') || /[\u0000-\u001f]/.test(param)) return defaut;
  return param;
}
export interface LigneRecap { cle: 'compte' | 'notifications' | 'partage' | 'carte' | 'identite'; titre: string; valeur: string; fait: boolean }
export function recapitulatif(c: Compte): LigneRecap[] {
  const n = nbPartages(c);
  return [
    { cle: 'compte', titre: 'Compte', valeur: `${`${c.prenom} ${c.nom}`.trim() || 'Sans nom'} · ${c.aeroport}`, fait: true },
    { cle: 'notifications', titre: 'Notifications', valeur: libellePrefs(c.prefsNotif), fait: true },
    { cle: 'partage', titre: 'Partage', valeur: `${n} réglage${n > 1 ? 's' : ''} activé${n > 1 ? 's' : ''}`, fait: true },
    { cle: 'carte', titre: 'Carte', valeur: c.carte4 ? masquerCarte(c.carte4) : 'plus tard', fait: !!c.carte4 },
    { cle: 'identite', titre: 'Identité', valeur: c.identiteVerifiee ? 'vérifiée' : 'plus tard', fait: !!c.identiteVerifiee }
  ];
}
/** Clôt l'inscription : le brouillon repart de l'étape 1. */
export function terminerInscription(): void { app.session.inscription = { etape: 1 }; }
