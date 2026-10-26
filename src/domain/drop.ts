// Drops membres : un petit lot de billets à prix réduit, réservé aux membres du Pass NexG, attribué au premier arrivé.
// Règles : Pass actif requis, une place par membre et par drop, `restantes` décrémenté à l'achat, droit d'origine « drop » avec maillon « drop ». Paiement simulé.
import { app, nouvelId, maintenant } from '../data/store.svelte.ts';
import { peutEchanger, refAleatoire } from '../core/regles.ts';
import { compteDe, notifier } from './compte.ts';
import { departDuVol, ecrire, totalAPayer, volDe, type MoyenPaiement } from './marche.ts';
import type { Droit, Drop, DropAVenir } from './types.ts';
import { fmt } from '../core/argent.ts';

export type CodeErreurDrop = 'compte' | 'pass' | 'drop' | 'pas_ouvert' | 'termine' | 'epuise' | 'deja' | 'echeance' | 'solde';
export class ErreurDrop extends Error { constructor(public code: CodeErreurDrop, message: string) { super(message); } }

export const dropDe = (id: string): Drop | undefined => app.monde.drops.find((d) => d.id === id);
export type EtatDrop = 'avenir' | 'direct' | 'epuise' | 'termine';
/** Où en est un drop : pas encore ouvert, en direct, épuisé (plus de place) ou terminé (fin atteinte, des places restent). */
export function etatDrop(d: Drop, now: number = maintenant()): EtatDrop {
  if (d.restantes <= 0) return 'epuise'; if (now >= d.fin) return 'termine'; return now < d.ouvre ? 'avenir' : 'direct';
}
/** Le drop à montrer sur `/drops` : celui en direct ; sinon le dernier ouvert (épuisé ou terminé). `undefined` si aucun drop n'a encore ouvert. */
export function dropAffiche(now: number = maintenant()): Drop | undefined {
  const ouverts = app.monde.drops.filter((d) => d.ouvre <= now);
  return ouverts.find((d) => etatDrop(d, now) === 'direct') ?? [...ouverts].sort((a, b) => b.ouvre - a.ouvre)[0];
}
/** Les prochains drops, du plus proche au plus lointain (destination masquée jusqu'à l'ouverture). */
export const prochainsDrops = (now: number = maintenant()): DropAVenir[] => app.monde.dropsAVenir.filter((d) => d.ouvre > now).sort((a, b) => a.ouvre - b.ouvre);
export const prochainDrop = (now: number = maintenant()): DropAVenir | undefined => prochainsDrops(now)[0];
/** Durée simulée (ms) entre l'ouverture et la dernière place attribuée : une fraction de seconde, stable pour un drop donné (0,8 s pour le n° 128). */
export const dureeEpuisement = (d: Pick<Drop, 'n'>): number => (((d.n * 7) % 9) + 3) * 100;
/** Places déjà prises, pour la jauge (une case par place). */
export const prises = (d: Pick<Drop, 'places' | 'restantes'>): number => Math.max(0, d.places - Math.max(0, d.restantes));

/** M'alerter à l'ouverture d'un prochain drop (idempotent). Renvoie vrai si l'alerte est active après l'appel. */
export function alerterDrop(dropAVenirId: string, compteId: string): boolean {
  const d = app.monde.dropsAVenir.find((x) => x.id === dropAVenirId); if (!d || !compteDe(compteId)) return false;
  if (!d.alerteIds.includes(compteId)) d.alerteIds.push(compteId); return true;
}
export function retirerAlerteDrop(dropAVenirId: string, compteId: string): void {
  const d = app.monde.dropsAVenir.find((x) => x.id === dropAVenirId); if (d) d.alerteIds = d.alerteIds.filter((x) => x !== compteId);
}
export const estAlerte = (d: Pick<DropAVenir, 'alerteIds'>, compteId: string | null | undefined): boolean => !!compteId && d.alerteIds.includes(compteId);

const pnr = (): string => refAleatoire(maintenant() + app.monde.droits.length * 7919).slice(4).padEnd(6, 'K') + '9';
const refUnique = (): string => { let n = app.monde.droits.length * 31 + Math.floor(maintenant() / 1000); let r = refAleatoire(n); while (app.monde.droits.some((d) => d.ref === r)) r = refAleatoire(++n); return r; };

/** Réserve une place du drop pour un membre du Pass : la place est attribuée à la fin du paiement (simulé), dans l'ordre d'arrivée. Crée le droit « drop » au prix membre. */
export function acheterDrop(dropId: string, compteId: string, moyen: MoyenPaiement = 'carte'): Droit {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurDrop('compte', 'Connectez-vous pour réserver une place.');
  const dr = dropDe(dropId); if (!dr) throw new ErreurDrop('drop', 'Ce drop n’existe pas.');
  if (!c.pass.actif) throw new ErreurDrop('pass', 'Les drops sont réservés aux membres du Pass NexG.');
  const now = maintenant(), v = volDe(dr.volId); if (!v) throw new ErreurDrop('drop', 'Le vol de ce drop n’existe plus.');
  if (dr.servis.includes(compteId)) throw new ErreurDrop('deja', 'Une place par membre et par drop : vous avez déjà la vôtre.');
  if (now < dr.ouvre) throw new ErreurDrop('pas_ouvert', 'Ce drop n’est pas encore ouvert.');
  if (dr.restantes <= 0) throw new ErreurDrop('epuise', 'Ce drop est épuisé : les places ont été attribuées dans l’ordre d’arrivée.');
  if (now >= dr.fin) throw new ErreurDrop('termine', 'Ce drop est terminé.');
  if (!peutEchanger(departDuVol(v), now)) throw new ErreurDrop('echeance', 'L’échéance de ce vol est passée : plus aucune transaction n’est possible.');
  const total = totalAPayer(dr.prixMembre);
  if (moyen === 'solde' && c.solde < total) throw new ErreurDrop('solde', 'Solde NexG insuffisant.');
  dr.restantes -= 1; dr.servis.push(compteId);
  const droit: Droit = { id: nouvelId('d'), ref: refUnique(), pnr: pnr(), volId: v.id, detenteurId: compteId, statut: 'detenu', prixPaye: dr.prixMembre, origine: 'drop', dropId: dr.id, bagagesInclus: 2,
    chaine: [{ id: nouvelId('m'), quand: now, type: 'drop', de: 'nexgtt', vers: compteId, prix: dr.prixMembre, note: `Drop n° ${dr.n}` }] };
  app.monde.droits.push(droit);
  if (moyen === 'solde') ecrire(compteId, 'achat', `Drop n° ${dr.n} · ${v.de} → ${v.vers}`, -total, { sous: `Vol ${v.numero}`, droitId: droit.id });
  notifier(compteId, { type: 'drop', titre: `Drop n° ${dr.n} : votre place est confirmée`, sous: `${v.de} → ${v.vers} · ${fmt(dr.prixMembre)}`, essentielle: true, lien: `/droit/${droit.id}` });
  return droit;
}
