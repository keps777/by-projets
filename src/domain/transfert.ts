// Transfert d'un droit de voyage à un proche (sans vente) : recherche exacte du proche, invitation simulée, transfert et brouillon.
// Règles : droit « détenu » du compte (ni en vente, ni nommé), avant l'échéance (bloqué dès la phase « fermé »), averti en phase « avertissement »,
// jamais vers soi-même, destinataire avec un compte actif. Frais de transfert : hypothèse (`FRAIS_TRANSFERT`). Aucun paiement réel.
import { app, nouvelId, maintenant, tranche } from '../data/store.svelte.ts';
import { arrondi } from '../core/argent.ts';
import { echeanceDe, FRAIS_TRANSFERT, phase, type Phase } from '../core/regles.ts';
import { compteDe, courrielValide, notifier } from './compte.ts';
import { departDuVol, droitDe, ecrire, volDe } from './marche.ts';
import type { Compte, Droit, Maillon, Transfert } from './types.ts';

export type CodeErreurTransfert = 'compte' | 'droit' | 'echeance' | 'soi_meme' | 'destinataire' | 'solde' | 'courriel' | 'existe';
export class ErreurTransfert extends Error { constructor(public code: CodeErreurTransfert, message: string) { super(message); } }

/** Cas d'échec d'un transfert (écran d'erreur) : la raison, pas seulement « une erreur ». */
export type CasErreur = 'technique' | 'vendu' | 'echeance' | 'destinataire' | 'reseau' | 'solde';
/** Pourquoi un droit ne peut pas (ou plus) être transféré. */
export type Motif = 'detenteur' | 'en_vente' | 'nomme' | 'gele' | 'vendu' | 'autre' | 'echeance';

// ─── Proches : ce qu'on montre d'un autre compte (prénom et initiale du nom seulement) ───
export interface Proche { id: string; /** « Léa A. » */ nom: string; /** « LA » */ ini: string; /** « @lea.ailleurs » */ ident: string }
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const jeton = (s: string) => sansAccent(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Identifiant public d'un compte : « @prenom.nom » sans accents ni espaces. */
export const identifiantPublic = (c: Pick<Compte, 'prenom' | 'nom'>): string => `@${[jeton(c.prenom), jeton(c.nom)].filter(Boolean).join('.')}`;
/** « Léa A. » : le prénom et l'initiale du nom, rien de plus. */
export const nomCourt = (c: Pick<Compte, 'prenom' | 'nom'>): string => `${c.prenom}${c.nom ? ` ${c.nom[0].toLocaleUpperCase('fr-CA')}.` : ''}`.trim();
export const initialesDe = (c: Pick<Compte, 'prenom' | 'nom'>): string => `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toLocaleUpperCase('fr-CA');
export const procheDe = (c: Compte): Proche => ({ id: c.id, nom: nomCourt(c), ini: initialesDe(c), ident: identifiantPublic(c) });
const recevable = (c: Compte | undefined): c is Compte => !!c && c.actif && c.role === 'voyageur';

/** Recherche exacte d'un compte actif par identifiant (« @lea.ailleurs » ou « lea.ailleurs »), courriel ou numéro de compte. Aucune recherche approchée : on ne devine pas un proche. */
export function rechercherProche(identifiant: string): Proche | undefined {
  const q = identifiant.trim().toLowerCase(); if (!q) return undefined;
  const actifs = app.monde.comptes.filter(recevable);
  const trouve = q.includes('@') && !q.startsWith('@') ? actifs.find((c) => c.email.trim().toLowerCase() === q)
    : actifs.find((c) => identifiantPublic(c) === (q.startsWith('@') ? q : `@${q}`) || c.id.toLowerCase() === q);
  return trouve ? procheDe(trouve) : undefined;
}
/** Les proches enregistrés du compte qui ont un compte actif. */
export const prochesEnregistres = (compteId: string): Proche[] => (compteDe(compteId)?.proches ?? []).map(compteDe).filter(recevable).map(procheDe);

// ─── Tranche « transferts » : brouillon du transfert en cours, proches sans compte, invitations ───
export interface ProcheSansCompte { id: string; compteId: string; /** « Marc T. » */ nom: string; courriel?: string; invite?: number }
export interface Invitation { id: string; compteId: string; courriel: string; quand: number; nom?: string }
export interface Brouillon {
  droitId: string; /** Le proche choisi (compte actif). */ versId?: string; /** Le proche sans compte pour qui l'on prépare l'invitation. */ sansCompte?: { id?: string; nom: string; courriel?: string };
  erreur?: { cas: CasErreur; motif?: Motif; incident?: string; versNom?: string; quand: number }
}
export interface TrancheTransferts { brouillon?: Brouillon; sansCompte: ProcheSansCompte[]; invitations: Invitation[] }
/** Les proches sans compte de départ : Alex a nommé Marc T. comme voyageur, il n'a pas encore de compte NexG-TT (monde de démonstration). */
const defaut = (): TrancheTransferts => ({ sansCompte: [{ id: 'sc-marc', compteId: 'ACC-0412', nom: 'Marc T.' }], invitations: [] });
/** À appeler depuis une action ou un composant : jamais dans un `$derived` si la tranche peut ne pas exister (la lecture rend alors la valeur par défaut, non enregistrée). */
export const trancheTransferts = (): TrancheTransferts => tranche<TrancheTransferts>('transferts', defaut);
export const prochesSansCompte = (compteId: string): ProcheSansCompte[] => trancheTransferts().sansCompte.filter((p) => p.compteId === compteId);
export const brouillonDe = (droitId: string): Brouillon | undefined => { const b = trancheTransferts().brouillon; return b && b.droitId === droitId ? b : undefined; };
/** Ouvre ou met à jour le brouillon du droit (un seul brouillon à la fois : changer de droit repart de zéro). */
export function majBrouillon(droitId: string, patch: Partial<Omit<Brouillon, 'droitId'>>): Brouillon {
  const t = trancheTransferts(); const b: Brouillon = t.brouillon && t.brouillon.droitId === droitId ? t.brouillon : { droitId };
  t.brouillon = { ...b, ...patch, droitId }; return t.brouillon;
}
export function effacerBrouillon(): void { const t = trancheTransferts(); delete t.brouillon; }

// ─── Invitation d'un proche sans compte (simulée : aucun courriel réel) ───
/** Enregistre une invitation à créer un compte NexG-TT. Elle ne mentionne ni le droit ni le vol. Rien n'est mis en attente : le droit reste à l'expéditeur. */
export function inviterProche(courriel: string, opts: { compteId?: string; procheId?: string; nom?: string } = {}): Invitation {
  const c = courriel.trim();
  if (!courrielValide(c)) throw new ErreurTransfert('courriel', 'Saisissez une adresse courriel valide.');
  if (app.monde.comptes.some((x) => x.email.trim().toLowerCase() === c.toLowerCase())) throw new ErreurTransfert('existe', 'Un compte existe déjà pour ce courriel : cherchez ce proche par son courriel ou son identifiant.');
  const t = trancheTransferts(); const inv: Invitation = { id: nouvelId('inv'), compteId: opts.compteId ?? app.session.compteId ?? '', courriel: c, quand: maintenant(), ...(opts.nom ? { nom: opts.nom } : {}) };
  t.invitations.push(inv);
  const p = opts.procheId ? t.sansCompte.find((x) => x.id === opts.procheId) : undefined; if (p) { p.courriel = c; p.invite = inv.quand; }
  return inv;
}

// ─── Faisabilité ───
export interface Faisabilite { ok: boolean; motif?: Motif; /** Message prêt à afficher quand `ok` est faux. */ raison?: string; phase: Phase; /** Échéance proche : le proche aura peu de temps pour nommer le voyageur. */ avertissement: boolean; depart: number; echeance: number; msRestant: number }
const RAISONS: Record<Exclude<Motif, 'echeance'>, string> = {
  detenteur: 'Ce droit n’est pas dans votre portefeuille.', en_vente: 'Ce droit est en vente : retirez d’abord l’annonce pour le transférer.', nomme: 'Le voyageur est déjà nommé : le billet est nominatif et ne peut plus être transféré.',
  gele: 'Ce droit est gelé : aucune transaction n’est possible pour le moment.', vendu: 'Ce droit n’est plus à vous : il a été vendu ou cédé.', autre: 'Seul un droit détenu, non nommé et avant l’échéance peut être transféré.'
};
/** Ce qu'on peut faire de ce droit pour ce compte, à l'instant `now` : transférable, transférable avec avertissement, ou non (avec la raison). */
export function etatTransfert(droitId: string, compteId: string, now: number = maintenant()): Faisabilite {
  const d = droitDe(droitId), v = d ? volDe(d.volId) : undefined;
  const depart = v ? departDuVol(v) : now, ech = echeanceDe(depart), ph = phase(depart, now), msRestant = Math.max(0, ech - now);
  const base = { phase: ph, depart, echeance: ech, msRestant, avertissement: ph === 'avertissement' };
  const non = (motif: Exclude<Motif, 'echeance'>): Faisabilite => ({ ok: false, motif, raison: RAISONS[motif], ...base, avertissement: false });
  if (!d || !v) return non('detenteur'); if (d.detenteurId !== compteId) return non(d.chaine.some((m) => m.de === compteId) ? 'vendu' : 'detenteur');
  if (d.statut !== 'detenu') return non(d.statut === 'en_vente' ? 'en_vente' : d.statut === 'nomme' || d.statut === 'voyage' ? 'nomme' : d.statut === 'gele' ? 'gele' : d.statut === 'vendu' || d.statut === 'transfere' || d.statut === 'rachete' ? 'vendu' : 'autre');
  if (ph === 'ferme' || ph === 'parti') return { ok: false, motif: 'echeance', raison: 'L’échéance est passée : plus aucune transaction n’est possible sur ce billet.', ...base, avertissement: false };
  return { ok: true, ...base };
}
/** Frais de transfert (hypothèse, 0 $ dans la démo). */
export const fraisTransfert = (): number => arrondi(FRAIS_TRANSFERT);

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const p2 = (n: number) => String(n).padStart(2, '0');
/** « 13 déc. 18:05 » */
export const jourHeure = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 6 h 45 » à partir de millisecondes (minutes arrondies vers le bas) ; « 45 min » sous l'heure ; « 3 j 4 h » au-delà de 48 h. */
export function delaiHM(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000)); if (min >= 48 * 60) return `${Math.floor(min / 1440)} j ${Math.floor((min % 1440) / 60)} h`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${p2(min % 60)}`;
}

// ─── Le transfert ───
/** Le message reçu par le proche : « Alex T. vous a transféré YUL → CDG. Nommez le voyageur avant le 13 déc. 18:05. » ; `msAvertissement` : le temps qui reste si l'échéance est proche. */
export const messageRecu = (deNom: string, trajet: string, echeance: number, msAvertissement?: number): string =>
  `${deNom} vous a transféré ${trajet}. Nommez le voyageur avant le ${jourHeure(echeance)}.${msAvertissement !== undefined ? ` Échéance proche : il reste ${delaiHM(msAvertissement)}.` : ''}`;
/** Transfère le droit de `deId` à `versId`, sans vente : chaîne « transfert », statut du droit inchangé pour le nouveau détenteur, Transfert enregistré, notifications aux deux, frais éventuels au solde de l'expéditeur. */
export function transferer(droitId: string, deId: string, versId: string): Transfert {
  const de = compteDe(deId), vers = compteDe(versId);
  if (!de || !de.actif) throw new ErreurTransfert('compte', 'Connectez-vous pour transférer ce droit.');
  const d = droitDe(droitId) as Droit | undefined; const v = d ? volDe(d.volId) : undefined;
  if (!d || !v || d.detenteurId !== deId) throw new ErreurTransfert('droit', RAISONS.detenteur);
  if (deId === versId) throw new ErreurTransfert('soi_meme', 'Vous ne pouvez pas vous transférer ce droit à vous-même.');
  const f = etatTransfert(droitId, deId);
  if (!f.ok) throw new ErreurTransfert(f.motif === 'echeance' ? 'echeance' : 'droit', f.raison ?? RAISONS.autre);
  if (!recevable(vers)) throw new ErreurTransfert('destinataire', 'Ce proche n’a pas de compte NexG-TT actif : le droit ne peut pas lui être transféré.');
  const frais = fraisTransfert(); if (frais > 0 && de.solde < frais) throw new ErreurTransfert('solde', 'Solde NexG insuffisant pour les frais de transfert.');
  const quand = maintenant(); const trajet = `${v.de} → ${v.vers}`;
  if (frais > 0) ecrire(deId, 'transfert', `Frais de transfert ${trajet}`, -frais, { sous: `Vol ${v.numero} · à ${nomCourt(vers)}`, droitId: d.id, hypothese: true });
  const m: Maillon = { id: nouvelId('m'), quand, type: 'transfert', de: deId, vers: versId, prix: 0, note: 'Transfert sans vente' };
  d.chaine.push(m); d.detenteurId = versId; d.statut = 'detenu'; d.origine = 'transfert'; delete d.annonce;
  const t: Transfert = { id: nouvelId('t'), droitId, de: deId, vers: versId, quand, statut: 'fait', ...(f.avertissement ? { note: 'Échéance proche' } : {}) };
  app.monde.transferts.push(t);
  if (!de.proches.includes(versId)) de.proches.push(versId);
  notifier(versId, { type: 'transfert', titre: 'Droit de voyage reçu', sous: messageRecu(nomCourt(de), trajet, f.echeance, f.avertissement ? f.msRestant : undefined), essentielle: true, lien: `/droit/${d.id}` });
  notifier(deId, { type: 'transfert', titre: `Droit transféré à ${nomCourt(vers)}`, sous: `${trajet} · vol ${v.numero} · statut « Cédé ».`, essentielle: true, lien: '/portefeuille' });
  return t;
}
/** Le dernier transfert fait de ce droit par ce compte (écran « Transfert effectué »). */
export const dernierTransfert = (droitId: string, deId: string): Transfert | undefined => [...app.monde.transferts].reverse().find((t) => t.droitId === droitId && t.de === deId && t.statut === 'fait');
