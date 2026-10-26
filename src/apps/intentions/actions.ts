// Transactions des intentions d'achat : créer et réserver les fonds, retirer, expirer, recevoir / accepter / refuser / contre-proposer une proposition.
// Principe : les fonds sont RÉSERVÉS (jamais débités) jusqu'à l'accord ; à l'accord le prix convenu est pris sur la réserve, le reste est libéré ; au retrait ou à l'expiration tout est libéré.
// Accepter une proposition = vente immédiate du droit proposé via `acheter()` (revente) au prix convenu, puis accord. Paiement simulé.
import { app, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { arrondi, fmt } from '../../core/argent.ts';
import { echeanceDe, peutEchanger, refAleatoire, sousPlafond } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { acheter, departDuVol, droitDe, ecrire, offresDuVol, volDe, type MoyenPaiement } from '../../domain/marche.ts';
import type { Compte, Intention, Proposition } from '../../domain/types.ts';
import { billetsCompatibles, erreursBrouillon, totalReserve, type Critere } from './compat.ts';
import { PAS_PRIX, contreDe, detailDe, expirationDe, intentionDe, intentionsDe, montantReserve, propositionDe, trancheIntentions, valideJusqua, type Accord, type Brouillon, type DetailIntention, type MotifFin, type SourceFonds } from './modele.ts';

export type CodeErreurIntention = 'compte' | 'brouillon' | 'carte' | 'solde' | 'introuvable' | 'statut' | 'expiree' | 'plafond' | 'droit' | 'echeance' | 'soi_meme' | 'prix';
export class ErreurIntention extends Error { constructor(public code: CodeErreurIntention, message: string) { super(message); } }
const MOYEN: Record<SourceFonds, MoyenPaiement> = { carte: 'carte', wallet: 'wallet', solde: 'solde' };
const trajet = (i: Pick<Intention, 'de' | 'vers'>): string => `${i.de} → ${i.vers}`;
export const critereDe = (d: Pick<DetailIntention, 'de' | 'vers' | 'du' | 'au' | 'flexible'>): Critere => ({ de: d.de, vers: d.vers, du: d.du, au: d.au, flexible: d.flexible });

/** Garde le brouillon d'écran en écran (de « Dites votre prix » à « Réserver les fonds »). */
export function enregistrerBrouillon(b: Brouillon): void { trancheIntentions().brouillon = { ...b, retour: b.retour ? { ...b.retour } : undefined }; }
export function abandonnerBrouillon(): void { delete trancheIntentions().brouillon; }

function reserverSurSolde(c: Compte, montant: number, id: string): void {
  ecrire(c.id, 'fonds_reserves', `Fonds réservés · intention ${id}`, -montant, { sous: 'Mis de côté, non débités', hypothese: true });
  c.enAttente = arrondi(c.enAttente + montant);
}
function rendreAuSolde(c: Compte, montant: number, id: string, raison: string): void {
  if (montant <= 0) return;
  ecrire(c.id, 'fonds_reserves', `Fonds libérés · intention ${id}`, montant, { sous: raison, hypothese: true });
  c.enAttente = arrondi(Math.max(0, c.enAttente - montant));
}

/** Publie l'intention et réserve les fonds (prix maximum × voyageurs) sur la source choisie. Les billets déjà en vente à ce prix ou en dessous lui sont aussitôt proposés. */
export function creerIntention(compteId: string, b: Brouillon, source: SourceFonds): Intention {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurIntention('compte', 'Connectez-vous pour publier une intention.');
  const maintenantMs = maintenant(), erreurs = Object.values(erreursBrouillon(b, maintenantMs)); if (erreurs.length) throw new ErreurIntention('brouillon', erreurs[0]!);
  const expire = expirationDe(b.validite, b.du, maintenantMs); if (expire <= maintenantMs) throw new ErreurIntention('brouillon', 'La fenêtre commence trop tôt pour « jusqu’à J-3 » : choisissez 7 ou 30 jours.');
  const montant = totalReserve(b);
  if (source === 'carte' && !c.carte4) throw new ErreurIntention('carte', 'Aucune carte enregistrée : ajoutez-en une ou choisissez une autre source.');
  if (source === 'solde' && c.solde < montant) throw new ErreurIntention('solde', `Solde NexG insuffisant : il manque ${fmt(arrondi(montant - c.solde))}.`);
  let n = app.monde.intentions.length * 13 + Math.floor(maintenantMs / 1000), id = `INT-${refAleatoire(n).slice(4)}`; while (intentionDe(id)) id = `INT-${refAleatoire(++n).slice(4)}`;
  if (source === 'solde') reserverSurSolde(c, montant, id);
  const i: Intention = { id, compteId, de: b.de, vers: b.vers, budget: b.budget, fondsReserves: montant, creeLe: maintenantMs, statut: 'publiee', propositions: [] };
  app.monde.intentions.push(i);
  const t = trancheIntentions(); t.details[id] = { ...b, retour: b.retour ? { ...b.retour } : undefined, expire, source }; delete t.brouillon;
  notifier(compteId, { type: 'proposition', titre: `Intention publiée : ${trajet(i)}`, sous: `Prix maximum ${fmt(b.budget)} · ${fmt(montant)} réservés, non débités.`, essentielle: false, lien: '/intentions' });
  diffuser(i.id);
  return intentionDe(id)!;
}

/** Les billets en vente qui correspondent déjà (prix ≤ prix maximum) sont proposés à l'intention, comme si leurs vendeurs la voyaient. L'accord automatique conclut sur la moins chère. */
export function diffuser(intentionId: string): Proposition[] {
  const i = intentionDe(intentionId); if (!i || i.statut !== 'publiee') return [];
  const d = detailDe(i), reçues: Proposition[] = [];
  for (const b of billetsCompatibles(critereDe(d), i.compteId)) {
    if (b.prix > i.budget || intentionDe(intentionId)!.statut !== 'publiee') continue;
    const p = recevoirProposition(i.id, b.droit.id, b.prix); if (p) reçues.push(p);
  }
  return reçues;
}

/** Un vendeur propose son billet à l'intention. Au-dessus du prix maximum, seulement si l'acheteur l'a permis. Accord automatique si prix ≤ prix maximum et option active. */
export function recevoirProposition(intentionId: string, droitId: string, prix: number): Proposition | undefined {
  const i = intentionDe(intentionId); if (!i) throw new ErreurIntention('introuvable', 'Intention introuvable.');
  if (i.statut !== 'publiee') throw new ErreurIntention('statut', 'Cette intention n’est plus active.');
  const d = detailDe(i); if (d.expire <= maintenant()) throw new ErreurIntention('expiree', 'Cette intention a expiré.');
  const droit = droitDe(droitId); const v = droit ? volDe(droit.volId) : undefined;
  if (!droit || !v || droit.statut !== 'en_vente') throw new ErreurIntention('droit', 'Ce billet n’est pas en vente.');
  if (droit.detenteurId === i.compteId) throw new ErreurIntention('soi_meme', 'On ne répond pas à sa propre intention.');
  if (!billetsCompatibles(critereDe(d)).some((b) => b.droit.id === droitId)) throw new ErreurIntention('droit', 'Ce billet ne correspond pas au trajet ni à la fenêtre.');
  if (!(prix > 0) || !sousPlafond(prix, v.prixNeuf)) throw new ErreurIntention('plafond', `Le prix ne peut pas dépasser le prix équivalent neuf (${fmt(v.prixNeuf)}).`);
  if (prix > i.budget && !d.auDessus) return undefined;
  let p = i.propositions.find((x) => x.droitId === droitId && x.statut === 'recue');
  if (p) { p.prix = prix; p.quand = maintenant(); }
  else { p = { id: nouvelId('p'), intentionId, vendeurId: droit.detenteurId, droitId, prix, quand: maintenant(), statut: 'recue' }; i.propositions.push(p); }
  notifier(i.compteId, { type: 'proposition', titre: `Proposition à ${fmt(prix)} : ${trajet(i)}`, sous: prix > i.budget ? `${fmt(arrondi(prix - i.budget))} au-dessus de votre prix maximum · facultative.` : 'À votre prix ou en dessous.', essentielle: true, lien: `/intentions/${i.id}/proposition/${p.id}` });
  if (d.auto && prix <= i.budget) { try { accepterProposition(i.compteId, i.id, p.id); } catch { /* l'accord échoue (solde, échéance…) : la proposition reste ouverte */ } }
  return p;
}

function charger(compteId: string, intentionId: string, pid?: string): { i: Intention; c: Compte; p?: Proposition } {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurIntention('compte', 'Connectez-vous pour continuer.');
  const i = intentionDe(intentionId); if (!i || i.compteId !== compteId) throw new ErreurIntention('introuvable', 'Intention introuvable.');
  if (i.statut !== 'publiee') throw new ErreurIntention('statut', 'Cette intention n’est plus active.');
  if (pid === undefined) return { i, c };
  const p = propositionDe(i, pid); if (!p) throw new ErreurIntention('introuvable', 'Proposition introuvable.');
  if (p.statut !== 'recue') throw new ErreurIntention('statut', p.statut === 'expiree' ? 'Cette proposition a expiré.' : 'Cette proposition a déjà reçu une réponse.');
  if (valideJusqua(p) <= maintenant()) { p.statut = 'expiree'; throw new ErreurIntention('expiree', 'Cette proposition a expiré : le vendeur ne s’engage plus.'); }
  return { i, c, p };
}

/** Accepte une proposition : vente immédiate du droit via `acheter()` au prix convenu (les fonds réservés sont capturés, le reste libéré, la différence éventuelle débitée en plus), les autres propositions sont déclinées. */
export function accepterProposition(compteId: string, intentionId: string, pid: string): Accord {
  const { i, c, p } = charger(compteId, intentionId, pid); const prop = p!, d = detailDe(i);
  const droit = droitDe(prop.droitId), v = droit ? volDe(droit.volId) : undefined;
  if (!droit || !v || droit.statut !== 'en_vente' || !droit.annonce || droit.detenteurId !== prop.vendeurId) throw new ErreurIntention('droit', 'Ce billet vient d’être vendu ou retiré : la proposition tombe.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurIntention('echeance', 'L’échéance de ce vol est passée : plus aucune transaction n’est possible.');
  if (!sousPlafond(prop.prix, v.prixNeuf)) throw new ErreurIntention('plafond', `Le prix dépasse le plafond de revente (${fmt(v.prixNeuf)}).`);
  const reserve = i.fondsReserves, surSolde = d.source === 'solde';
  if (MOYEN[d.source] === 'solde' && c.solde + reserve < prop.prix) throw new ErreurIntention('solde', 'Solde NexG insuffisant pour cet accord.');
  if (surSolde) rendreAuSolde(c, reserve, i.id, 'Libérés pour conclure l’accord');
  const ancien = droit.annonce.prix; droit.annonce.prix = prop.prix; // le vendeur s'est engagé sur ce prix
  let obtenu;
  try { const offre = offresDuVol(v.id).find((o) => o.droitId === droit.id)!; obtenu = acheter(offre, compteId, MOYEN[d.source]); }
  catch (e) { droit.annonce.prix = ancien; if (surSolde) { ecrire(c.id, 'fonds_reserves', `Fonds réservés · intention ${i.id}`, -reserve, { hypothese: true }); c.enAttente = arrondi(c.enAttente + reserve); } throw e; }
  prop.statut = 'acceptee'; let refusees = 0;
  for (const autre of i.propositions) if (autre.statut === 'recue') {
    autre.statut = 'refusee'; refusees++;
    notifier(autre.vendeurId, { type: 'proposition', titre: 'Proposition non retenue', sous: `L’acheteur a conclu un accord sur ${trajet(i)}. Votre billet reste en vente.`, essentielle: false, lien: '/portefeuille' });
  }
  const accord: Accord = { droitId: obtenu.id, prix: prop.prix, quand: maintenant(), reserve, capture: Math.min(prop.prix, reserve), enPlus: arrondi(Math.max(0, prop.prix - reserve)), source: d.source, refusees };
  trancheIntentions().accords[i.id] = accord; i.statut = 'accord'; i.fondsReserves = 0;
  notifier(compteId, { type: 'proposition', titre: `Accord conclu : ${trajet(i)}`, sous: `${fmt(prop.prix)} · nommez le voyageur avant le ${new Date(echeanceDe(departDuVol(v))).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}.`, essentielle: true, lien: `/intentions/${i.id}/accord` });
  return accord;
}

/** Refuse une proposition : le vendeur en est informé, l'intention reste active. Renvoie le nombre d'autres propositions encore ouvertes. */
export function refuserProposition(compteId: string, intentionId: string, pid: string): number {
  const { i, p } = charger(compteId, intentionId, pid); p!.statut = 'refusee';
  notifier(p!.vendeurId, { type: 'proposition', titre: 'Proposition déclinée', sous: `L’acheteur a décliné votre proposition de ${fmt(p!.prix)} sur ${trajet(i)}. Votre billet reste en vente.`, essentielle: false, lien: '/portefeuille' });
  return i.propositions.filter((x) => x.statut === 'recue' && valideJusqua(x) > maintenant()).length;
}

/** Contre-propose un prix entre le prix maximum et la proposition (par pas de 10 $). Le vendeur a 48 h ; la proposition d'origine reste acceptable. */
export function contreProposer(compteId: string, intentionId: string, pid: string, prix: number) {
  const { i, p } = charger(compteId, intentionId, pid);
  if (!(prix >= i.budget && prix <= p!.prix) || (prix - i.budget) % PAS_PRIX !== 0) throw new ErreurIntention('prix', `Proposez entre ${fmt(i.budget)} et ${fmt(p!.prix)}, par pas de ${PAS_PRIX} $.`);
  const t = trancheIntentions(), existante = t.contres.find((x) => x.propositionId === pid);
  if (existante) { existante.prix = prix; existante.quand = maintenant(); } else t.contres.push({ propositionId: pid, prix, quand: maintenant() });
  notifier(p!.vendeurId, { type: 'proposition', titre: `Contre-proposition de ${fmt(prix)}`, sous: `Sur ${trajet(i)} : vous avez 48 h pour accepter ou refuser.`, essentielle: false, lien: '/portefeuille' });
  return contreDe(pid)!;
}

function clore(i: Intention, motif: MotifFin): number {
  const c = compteDe(i.compteId), d = detailDe(i), libere = i.fondsReserves;
  for (const p of i.propositions) if (p.statut === 'recue') { p.statut = motif === 'retiree' ? 'refusee' : 'expiree'; if (motif === 'retiree') notifier(p.vendeurId, { type: 'proposition', titre: 'Intention retirée', sous: `L’acheteur a retiré son intention ${trajet(i)}. Votre billet reste en vente.`, essentielle: false, lien: '/portefeuille' }); }
  if (c && d.source === 'solde') rendreAuSolde(c, libere, i.id, motif === 'retiree' ? 'Intention retirée' : 'Intention expirée sans accord');
  i.fondsReserves = 0; i.statut = 'annulee'; trancheIntentions().fins[i.id] = motif;
  return libere;
}
/** Retire l'intention avant un accord : les propositions sont déclinées, les fonds libérés immédiatement. Renvoie le montant libéré. */
export function retirerIntention(compteId: string, intentionId: string): number {
  const { i } = charger(compteId, intentionId); const libere = clore(i, 'retiree');
  notifier(compteId, { type: 'proposition', titre: `Intention retirée : ${trajet(i)}`, sous: `${fmt(libere)} libérés. Rien n’a été prélevé.`, essentielle: false, lien: '/intentions' });
  return libere;
}
/** Expire les intentions arrivées au bout de leur validité sans accord (fonds libérés) et les propositions dont l'engagement de 48 h est écoulé. Idempotent. */
export function actualiser(compteId?: string, quand: number = maintenant()): { intentions: number; propositions: number } {
  let ni = 0, np = 0;
  for (const i of compteId ? intentionsDe(compteId) : app.monde.intentions) {
    if (i.statut !== 'publiee') continue;
    for (const p of i.propositions) if (p.statut === 'recue' && valideJusqua(p) <= quand) { p.statut = 'expiree'; np++; }
    if (detailDe(i).expire <= quand) {
      const libere = clore(i, 'expiree'); ni++;
      notifier(i.compteId, { type: 'proposition', titre: `Intention expirée : ${trajet(i)}`, sous: `Aucun accord : ${fmt(libere)} libérés. Vous pouvez la republier en un geste.`, essentielle: true, lien: '/intentions' });
    }
  }
  return { intentions: ni, propositions: np };
}
