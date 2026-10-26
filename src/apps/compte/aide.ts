// Aide et assistance : questions fréquentes, recherche (sans accents ni casse) et formulaire de contact simulé (aucun message n'est réellement envoyé).
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { refAleatoire, TAUX_COMMISSION, TAUX_COMMISSION_PASS } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { pct } from './pass.ts';

export interface Question { id: string; theme: string; q: string; a: string; lien?: { texte: string; chemin: string } }
export const THEMES = [{ id: 't1', titre: 'Droits de voyage' }, { id: 't2', titre: 'Revendre et argent' }, { id: 't3', titre: 'Bagages' }, { id: 't4', titre: 'Notifications et compte' }];
export const FAQ: Question[] = [
  { id: 'q1', theme: 't1', q: 'Qu’est-ce qu’un droit de voyage ?', a: 'C’est le droit de voyager sur un vol. Vous le détenez, vous pouvez le revendre à prix encadré ou le transférer, puis vous nommez le voyageur avant l’échéance.' },
  { id: 'q2', theme: 't1', q: 'Que se passe-t-il si je ne nomme personne ?', a: 'À l’échéance de nommage, vous êtes nommé voyageur par défaut. Le droit reste utilisable : c’est vous qui voyagez. Après l’échéance, plus aucune revente ni aucun transfert.' },
  { id: 'q3', theme: 't2', q: 'Combien coûte une revente ?', a: `La commission est de ${pct(TAUX_COMMISSION)} sans le Pass et de ${pct(TAUX_COMMISSION_PASS)} avec le Pass. Elle est affichée avec votre net avant toute confirmation.` },
  { id: 'q4', theme: 't2', q: 'À quoi sert la vérification d’identité ?', a: 'Elle n’est demandée que lorsqu’elle est nécessaire : pour revendre un billet et recevoir vos versements (à valider).' },
  { id: 'q5', theme: 't3', q: 'Mon bagage acheté est-il garanti ?', a: 'Pas avant la confirmation de la compagnie : l’achat est « sous réserve d’acceptation par la compagnie ». En cas de refus, vous n’êtes pas débité ou vous êtes remboursé intégralement.' },
  { id: 'q6', theme: 't4', q: 'Comment régler mes notifications ?', a: 'Dans Compte › Notifications, choisissez Tout, L’essentiel ou Rien, puis les canaux. Si rien n’arrive, vérifiez aussi l’autorisation de votre téléphone.', lien: { texte: 'Ouvrir les préférences', chemin: '/notifications/preferences' } }
];
/** Minuscules sans accents, pour comparer. */
export const lisse = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const correspond = (f: Question, q: string): boolean => { const r = lisse(q.trim()); return r === '' || lisse(`${f.q} ${f.a}`).includes(r); };
export interface GroupeFaq { id: string; titre: string; questions: Question[] }
/** Questions regroupées par thème, filtrées par la recherche ; les thèmes sans résultat disparaissent. */
export const grouperFaq = (q: string): GroupeFaq[] => THEMES.map((t) => ({ id: t.id, titre: t.titre, questions: FAQ.filter((f) => f.theme === t.id && correspond(f, q)) })).filter((g) => g.questions.length > 0);

export type Sujet = 'billet' | 'paiement' | 'bagage' | 'compte' | 'autre';
export const SUJETS: { id: Sujet; label: string }[] = [{ id: 'billet', label: 'Billet' }, { id: 'paiement', label: 'Paiement ou versement' }, { id: 'bagage', label: 'Bagage' }, { id: 'compte', label: 'Compte' }, { id: 'autre', label: 'Autre' }];
export interface BrouillonContact { sujet: Sujet | null; reference: string; message: string }
export interface Demande { id: string; numero: string; compteId: string; quand: number; sujet: Sujet | null; reference: string; message: string }
interface EtatAide { brouillon: BrouillonContact; demandes: Demande[] }
const vide = (): BrouillonContact => ({ sujet: null, reference: '', message: '' });
/** Tranche `aide` : brouillon conservé sur l'appareil (même hors ligne) et demandes simulées. */
export const etat = (): EtatAide => tranche<EtatAide>('aide', () => ({ brouillon: vide(), demandes: [] }));
export function majBrouillon(patch: Partial<BrouillonContact>): void { Object.assign(etat().brouillon, patch); }
export const viderBrouillon = (): void => { etat().brouillon = vide(); };
export const MESSAGE_MAX = 2000;
export function validerMessage(b: Pick<BrouillonContact, 'message'>): { message?: string } {
  if (!b.message.trim()) return { message: 'Écrivez votre message.' };
  if (b.message.length > MESSAGE_MAX) return { message: `Votre message dépasse ${MESSAGE_MAX} caractères.` };
  return {};
}
export type ResultatEnvoi = { ok: true; demande: Demande } | { ok: false; erreurs: { message?: string }; code?: 'compte' };
/** Enregistre la demande (simulée), notifie le compte et vide le brouillon. Aucun envoi réel. */
export function envoyerMessage(compteId: string, b: BrouillonContact): ResultatEnvoi {
  if (!compteDe(compteId)) return { ok: false, erreurs: {}, code: 'compte' };
  const erreurs = validerMessage(b); if (erreurs.message) return { ok: false, erreurs };
  const e = etat(), now = maintenant();
  const numero = `AS-${refAleatoire(now + e.demandes.length * 7919 + app.monde.notifications.length).slice(4)}`;
  const demande: Demande = { id: nouvelId('dem'), numero, compteId, quand: now, sujet: b.sujet, reference: b.reference.trim().slice(0, 40), message: b.message.trim() };
  e.demandes.push(demande); viderBrouillon();
  notifier(compteId, { type: 'systeme', titre: 'Message envoyé à l’assistance (démo)', sous: `Demande ${numero} · aucun message n’est réellement envoyé.`, essentielle: true, lien: '/aide' });
  return { ok: true, demande };
}
