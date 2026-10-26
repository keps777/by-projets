// Le marché des droits de voyage : offres d'un vol, achat (neuf, revente, agence), nommage du voyageur, avancement du temps.
// Ces transactions sont les mêmes pour tous les écrans (résultats, offre, paiement, portefeuille, transfert…). Montants fictifs, aucun paiement réel.
import { app, nouvelId, maintenant } from '../data/store.svelte.ts';
import { arrondi, ecart } from '../core/argent.ts';
import { commission, departDe, echeanceDe, FRAIS_SERVICE, net, peutEchanger, phase, refAleatoire } from '../core/regles.ts';
import { compteDe, notifier } from './compte.ts';
import type { Compagnie, Droit, Maillon, TypeEcriture, Vol, Voyageur } from './types.ts';

export type TypeOffre = 'neuf' | 'revente' | 'agence' | 'drop';
export interface Offre {
  id: string; type: TypeOffre; volId: string; prix: number; /** Écart signé en % par rapport au prix équivalent neuf (négatif = moins cher). */ ecartPct: number;
  droitId?: string; agenceId?: string; dropId?: string; /** « Détenteur vérifié », « Émis via NexG-TT », « Vendu par Agence Horizon », « Drop membres ». */ vendeur: string;
  /** Prix et horaires masqués : drop réservé aux membres du Pass pour un visiteur sans Pass. */ masquee: boolean; /** Rang du détenteur actuel dans la chaîne (« 2e détenteur »). */ detenteurs?: number;
}
export const volDe = (id: string): Vol | undefined => app.monde.vols.find((v) => v.id === id);
export const compagnieDe = (v: Vol): Compagnie => app.monde.compagnies.find((c) => c.id === v.compagnieId)!;
export const droitDe = (id: string): Droit | undefined => app.monde.droits.find((d) => d.id === id);
export const droitsDe = (compteId: string): Droit[] => app.monde.droits.filter((d) => d.detenteurId === compteId);
export const departDuVol = (v: Vol): number => departDe(v.jour, v.heureDepart);

/** Toutes les offres d'un vol : le neuf (émis via NexG-TT), les reventes en cours, les offres d'agence (hors agences suspendues) et le drop membres, une fois ouvert (masqué sans Pass). Triées par prix croissant, drop masqué en dernier. */
export function offresDuVol(volId: string, pass = false): Offre[] {
  const v = volDe(volId); if (!v) return [];
  const e = (prix: number) => ecart(v.prixNeuf, prix).pct;
  const offres: Offre[] = [{ id: `neuf:${v.id}`, type: 'neuf', volId, prix: v.prixNeuf, ecartPct: 0, vendeur: 'Émis via NexG-TT', masquee: false }];
  for (const d of app.monde.droits) if (d.volId === volId && d.statut === 'en_vente' && d.annonce) offres.push({ id: `revente:${d.id}`, type: 'revente', volId, prix: d.annonce.prix, ecartPct: e(d.annonce.prix), droitId: d.id, vendeur: 'Détenteur vérifié', masquee: false, detenteurs: d.chaine.length });
  for (const o of app.monde.offresAgence) if (o.volId === volId) { const a = app.monde.agences.find((x) => x.id === o.agenceId); if (a?.suspendue) continue; offres.push({ id: `agence:${o.id}`, type: 'agence', volId, prix: o.prix, ecartPct: e(o.prix), agenceId: o.agenceId, vendeur: `Vendu par ${a?.nom ?? 'une agence'}`, masquee: false }); }
  for (const dr of app.monde.drops) if (dr.volId === volId && dr.restantes > 0 && dr.ouvre <= maintenant() && maintenant() < dr.fin) offres.push({ id: `drop:${dr.id}`, type: 'drop', volId, prix: dr.prixMembre, ecartPct: e(dr.prixMembre), dropId: dr.id, vendeur: 'Drop membres', masquee: !pass });
  return offres.sort((a, b) => Number(a.masquee) - Number(b.masquee) || a.prix - b.prix);
}
/** La meilleure offre visible (la moins chère hors drop masqué), pour le baromètre du marché. */
export const meilleureOffre = (volId: string, pass = false): Offre | undefined => offresDuVol(volId, pass).find((o) => !o.masquee);

export class ErreurMarche extends Error { constructor(public code: 'compte' | 'offre_indisponible' | 'echeance' | 'soi_meme' | 'solde' | 'droit' | 'voyageur', message: string) { super(message); } }
export type MoyenPaiement = 'carte' | 'wallet' | 'mobile' | 'solde';

/** Total à payer pour un prix : le billet plus les frais de service (hypothèse : offerts). */
export const totalAPayer = (prix: number): number => arrondi(prix + FRAIS_SERVICE);

/** Écrit une ligne au grand livre du solde NexG (montant signé) et ajuste le solde du compte. */
export function ecrire(compteId: string, type: TypeEcriture, libelle: string, montant: number, extra: { sous?: string; droitId?: string; hypothese?: boolean } = {}) {
  const c = compteDe(compteId); if (!c) return;
  c.solde = arrondi(c.solde + montant);
  app.monde.ecritures.push({ id: nouvelId('e'), compteId, quand: maintenant(), type, libelle, montant: arrondi(montant), solde: c.solde, ...extra });
}
const maillon = (type: Maillon['type'], de: string | null, vers: string, prix: number, comm?: number): Maillon => ({ id: nouvelId('m'), quand: maintenant(), type, de, vers, prix, ...(comm !== undefined ? { commission: comm } : {}) });
const pnr = (): string => refAleatoire(maintenant() + app.monde.droits.length * 7919).slice(4).padEnd(6, 'K') + '9';
const refUnique = (): string => { let n = app.monde.droits.length * 31 + Math.floor(maintenant() / 1000); let r = refAleatoire(n); while (app.monde.droits.some((d) => d.ref === r)) r = refAleatoire(++n); return r; };

/** Achète une offre (neuf, revente ou agence) pour `acheteurId` : crée ou transfère le droit, inscrit la chaîne de détention, règle le vendeur (commission prélevée seulement à la vente) et notifie. Le paiement est simulé. */
export function acheter(offre: Offre, acheteurId: string, moyen: MoyenPaiement = 'carte'): Droit {
  const acheteur = compteDe(acheteurId); const v = volDe(offre.volId);
  if (!acheteur || !acheteur.actif) throw new ErreurMarche('compte', 'Connectez-vous pour acheter.');
  if (!v) throw new ErreurMarche('offre_indisponible', 'Ce vol n’existe plus.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurMarche('echeance', 'L’échéance de ce vol est passée : plus aucune transaction n’est possible.');
  if (offre.masquee || offre.type === 'drop') throw new ErreurMarche('offre_indisponible', 'Les drops s’achètent depuis l’écran du drop.');
  const total = totalAPayer(offre.prix);
  if (moyen === 'solde' && acheteur.solde < total) throw new ErreurMarche('solde', 'Solde NexG insuffisant.');
  let droit: Droit;
  if (offre.type === 'revente') {
    const d = droitDe(offre.droitId ?? ''); if (!d || d.statut !== 'en_vente' || !d.annonce) throw new ErreurMarche('offre_indisponible', 'Ce billet vient d’être vendu ou retiré.');
    if (d.detenteurId === acheteurId) throw new ErreurMarche('soi_meme', 'Vous ne pouvez pas acheter votre propre annonce.');
    const prix = d.annonce.prix, vendeur = compteDe(d.detenteurId); const comm = commission(prix, !!vendeur?.pass.actif);
    if (vendeur) { ecrire(vendeur.id, 'revente', `Revente ${v.de} → ${v.vers}`, prix, { sous: `Vol ${v.numero} · billet vendu`, droitId: d.id }); ecrire(vendeur.id, 'commission', `Commission de revente${vendeur.pass.actif ? ' · membre Pass' : ''}`, -comm, { sous: `Taux hypothèse ${vendeur.pass.actif ? '10' : '12,5'} %`, droitId: d.id, hypothese: true }); notifier(vendeur.id, { type: 'vente', titre: `Billet vendu : ${v.de} → ${v.vers}`, sous: `Vol ${v.numero} · vous recevez ${net(prix, vendeur.pass.actif)} $ sur votre solde NexG.`, essentielle: true, lien: '/solde' }); }
    d.chaine.push(maillon('revente', d.detenteurId, acheteurId, prix, comm)); d.detenteurId = acheteurId; d.statut = 'detenu'; d.prixPaye = prix; d.origine = 'revente'; delete d.annonce; droit = d;
  } else if (offre.type === 'agence') {
    const o = app.monde.offresAgence.find((x) => `agence:${x.id}` === offre.id); if (!o || app.monde.agences.find((x) => x.id === o.agenceId)?.suspendue) throw new ErreurMarche('offre_indisponible', 'Cette offre d’agence n’est plus disponible.');
    droit = { id: nouvelId('d'), ref: refUnique(), pnr: pnr(), volId: v.id, detenteurId: acheteurId, statut: 'detenu', prixPaye: o.prix, origine: 'agence', agenceId: o.agenceId, chaine: [maillon('agence', `agence:${o.agenceId}`, acheteurId, o.prix)], bagagesInclus: 2 }; app.monde.droits.push(droit);
  } else {
    droit = { id: nouvelId('d'), ref: refUnique(), pnr: pnr(), volId: v.id, detenteurId: acheteurId, statut: 'detenu', prixPaye: v.prixNeuf, origine: 'neuf', chaine: [maillon('achat_neuf', 'nexgtt', acheteurId, v.prixNeuf)], bagagesInclus: 2 }; app.monde.droits.push(droit);
  }
  droit.pnr ??= pnr();
  if (moyen === 'solde') ecrire(acheteurId, 'achat', `Achat ${v.de} → ${v.vers}`, -total, { sous: `Vol ${v.numero}`, droitId: droit.id });
  notifier(acheteurId, { type: 'achat', titre: `Vous détenez un droit : ${v.de} → ${v.vers}`, sous: `Vol ${v.numero} · nommez le voyageur avant le ${new Date(echeanceDe(departDuVol(v))).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}.`, essentielle: true, lien: `/droit/${droit.id}` });
  return droit;
}

/** Nomme le voyageur d'un droit détenu (avant l'échéance J-1) : le billet devient nominatif, plus aucune vente ni transfert ensuite. */
export function nommerVoyageur(droitId: string, compteId: string, voyageur: Voyageur): Droit {
  const d = droitDe(droitId); if (!d || d.detenteurId !== compteId) throw new ErreurMarche('droit', 'Ce droit n’est pas dans votre portefeuille.');
  const v = volDe(d.volId)!; if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurMarche('echeance', 'L’échéance est passée.');
  if (d.statut !== 'detenu' && d.statut !== 'en_vente') throw new ErreurMarche('droit', 'Ce droit ne peut plus être nommé.');
  if (!voyageur.prenom.trim() || !voyageur.nom.trim()) throw new ErreurMarche('voyageur', 'Indiquez le prénom et le nom tels qu’inscrits sur le passeport.');
  delete d.annonce; d.statut = 'nomme'; d.voyageur = { ...voyageur, prenom: voyageur.prenom.trim(), nom: voyageur.nom.trim() }; d.chaine.push(maillon('nommage', compteId, compteId, 0));
  notifier(compteId, { type: 'echeance', titre: 'Voyageur nommé : prêt à voyager', sous: `${voyageur.prenom} ${voyageur.nom} · vol ${v.numero}`, essentielle: true, lien: `/droit/${d.id}` });
  return d;
}

/** Fait avancer le monde jusqu'à `quand` : à J-1 les annonces sont retirées et les droits non nommés le sont par défaut (le détenteur voyage) ; après le départ le droit est « voyagé ». Idempotent. */
export function avancerMonde(quand: number = maintenant()): number {
  let n = 0;
  for (const d of app.monde.droits) {
    const v = volDe(d.volId); if (!v) continue; const dep = departDuVol(v), ph = phase(dep, quand);
    if ((ph === 'ferme' || ph === 'parti') && (d.statut === 'detenu' || d.statut === 'en_vente')) {
      const c = compteDe(d.detenteurId); delete d.annonce; d.statut = 'nomme'; d.voyageur = { prenom: c?.prenom ?? '', nom: c?.nom ?? '', pourSoi: true, compteId: c?.id }; d.chaine.push({ ...maillon('nommage', d.detenteurId, d.detenteurId, 0), quand: echeanceDe(dep), note: 'Nommé par défaut à l’échéance' });
      notifier(d.detenteurId, { type: 'echeance', titre: 'Échéance passée : vous voyagez', sous: `Vol ${v.numero} · nommé par défaut à ${c?.prenom ?? 'vous'}.`, essentielle: true, lien: `/droit/${d.id}` }); n++;
    }
    if (ph === 'parti' && d.statut === 'nomme') { d.statut = 'voyage'; n++; }
  }
  return n;
}
