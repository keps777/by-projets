// Marché secondaire : mettre en vente, modifier ou retirer une annonce, rachat par NexG-TT, ordres à cours limité et leur exécution automatique.
// Les transactions de base (acheter, nommer, avancer le temps) restent dans marche.ts ; ici : tout ce que fait le détenteur pour céder son droit. Paiement simulé.
import { app, maintenant, nouvelId } from '../data/store.svelte.ts';
import { arrondi, fmt } from '../core/argent.ts';
import { departDe, peutEchanger, plafond, sousPlafond } from '../core/regles.ts';
import { compteDe, notifier } from './compte.ts';
import { acheter, droitDe, ecrire, ErreurMarche, offresDuVol, volDe } from './marche.ts';
import type { Droit, Maillon, Ordre, ValiditeOrdre, Vol } from './types.ts';

const H = 3_600_000, J = 24 * H;
/** Pas des prix (annonce, seuil d'un ordre), en dollars. */
export const PAS_PRIX = 10;
/** Part du prix de marché habituel (80 % du prix équivalent neuf) que NexG-TT offre en rachat instantané : 64 % du neuf, soit 1 280 $ pour 2 000 $ (hypothèse à valider). */
export const TAUX_RACHAT = 0.8;
export const REFERENCE_MARCHE = 0.8;

export type CodeRevente = 'compte' | 'droit' | 'statut' | 'gele' | 'echeance' | 'plafond' | 'prix' | 'rachat' | 'ordre' | 'proposition';
export class ErreurRevente extends Error { constructor(public code: CodeRevente, message: string) { super(message); } }
const departDuVol = (v: Vol): number => departDe(v.jour, v.heureDepart);
const maillon = (type: Maillon['type'], de: string | null, vers: string, prix: number): Maillon => ({ id: nouvelId('m'), quand: maintenant(), type, de, vers, prix });

export type Blocage = 'introuvable' | 'autre' | 'gele' | 'nomme' | 'echeance' | 'indisponible';
/** Pourquoi un droit ne peut pas être revendu par ce compte (pour l'écran explicatif), ou `undefined` s'il le peut. Lecture seule. */
export function blocageDe(droitId: string, compteId: string): Blocage | undefined {
  const d = droitDe(droitId), v = d ? volDe(d.volId) : undefined;
  if (!d || !v) return 'introuvable';
  if (d.detenteurId !== compteId) return 'autre';
  if (d.statut === 'gele') return 'gele';
  if (d.statut === 'nomme') return peutEchanger(departDuVol(v), maintenant()) ? 'nomme' : 'echeance';
  if (d.statut !== 'detenu' && d.statut !== 'en_vente') return 'indisponible';
  return peutEchanger(departDuVol(v), maintenant()) ? undefined : 'echeance';
}
function charger(droitId: string, compteId: string, statuts: Droit['statut'][]): { d: Droit; v: Vol } {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurRevente('compte', 'Connectez-vous pour continuer.');
  const d = droitDe(droitId), v = d ? volDe(d.volId) : undefined;
  if (!d || !v || d.detenteurId !== compteId) throw new ErreurRevente('droit', 'Ce droit n’est pas dans votre portefeuille.');
  if (d.statut === 'gele') throw new ErreurRevente('gele', 'Ce droit est gelé : aucune vente n’est possible pour l’instant.');
  if (d.statut === 'nomme' || d.statut === 'voyage') throw new ErreurRevente('statut', 'Le voyageur est nommé : ce droit ne peut plus être revendu.');
  if (!statuts.includes(d.statut)) throw new ErreurRevente('statut', d.statut === 'en_vente' ? 'Ce droit est déjà en vente : modifiez l’annonce.' : d.statut === 'detenu' ? 'Ce droit n’est pas en vente.' : 'Ce droit n’est plus disponible.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurRevente('echeance', 'L’échéance de ce vol est passée : plus aucune vente n’est possible.');
  return { d, v };
}
function verifierPrix(prix: number, v: Vol): void {
  if (!Number.isFinite(prix) || prix <= 0) throw new ErreurRevente('prix', 'Indiquez un prix supérieur à 0 $.');
  if (!sousPlafond(prix, v.prixNeuf)) throw new ErreurRevente('plafond', `Le prix ne peut pas dépasser le prix équivalent neuf (${fmt(plafond(v.prixNeuf))}).`);
}

/** Met en vente un droit détenu (pas nommé, pas gelé, avant J-1) à un prix au plus égal au plafond. Les ordres à cours limité en attente sont ensuite exécutés. */
export function mettreEnVente(droitId: string, compteId: string, prix: number): Droit {
  const { d, v } = charger(droitId, compteId, ['detenu']); const p = arrondi(prix); verifierPrix(p, v);
  d.statut = 'en_vente'; d.annonce = { prix: p, depuis: maintenant() };
  notifier(compteId, { type: 'vente', titre: `En vente à ${fmt(p)} : ${v.de} → ${v.vers}`, sous: `Vol ${v.numero} · retrait automatique de l’annonce à J-1.`, essentielle: false, lien: `/droit/${d.id}` });
  executerOrdres(v.id);
  return droitDe(droitId)!;
}
/** Change le prix d'une annonce en cours (même plafond, même échéance). */
export function modifierAnnonce(droitId: string, compteId: string, prix: number): Droit {
  const { d, v } = charger(droitId, compteId, ['en_vente']); const p = arrondi(prix); verifierPrix(p, v);
  d.annonce = { prix: p, depuis: d.annonce?.depuis ?? maintenant() };
  executerOrdres(v.id);
  return droitDe(droitId)!;
}
/** Retire l'annonce : le droit redevient simplement détenu. */
export function retirerAnnonce(droitId: string, compteId: string): Droit {
  const { d } = charger(droitId, compteId, ['en_vente']); delete d.annonce; d.statut = 'detenu'; return d;
}

/* ───────── Rachat instantané par NexG-TT ───────── */
/** Prix ferme offert par NexG-TT pour un droit de ce prix équivalent neuf (au pas de 10 $). */
export const prixRachat = (prixNeuf: number): number => Math.round((prixNeuf * REFERENCE_MARCHE * TAUX_RACHAT) / PAS_PRIX) * PAS_PRIX;
export interface OffreRachat { droitId: string; prix: number; /** Montant versé : le rachat est net, commission incluse. */ net: number; versement: 'minutes' }
/** L'offre de rachat d'un droit encore échangeable (détenu ou en vente), ou `undefined`. Lecture seule. */
export function offreDeRachat(droitId: string): OffreRachat | undefined {
  const d = droitDe(droitId), v = d ? volDe(d.volId) : undefined;
  if (!d || !v || (d.statut !== 'detenu' && d.statut !== 'en_vente') || !peutEchanger(departDuVol(v), maintenant())) return undefined;
  const prix = prixRachat(v.prixNeuf); return { droitId, prix, net: prix, versement: 'minutes' };
}
/** Accepte le rachat : le droit passe à NexG-TT (`rachete`, maillon « rachat »), le montant est versé sur le solde, l'annonce éventuelle est retirée. `prixAttendu` protège contre une offre qui aurait changé. */
export function accepterRachat(droitId: string, compteId: string, prixAttendu?: number): { prix: number; droit: Droit } {
  const { d, v } = charger(droitId, compteId, ['detenu', 'en_vente']); const o = offreDeRachat(droitId);
  if (!o) throw new ErreurRevente('rachat', 'NexG-TT ne propose pas de rachat pour ce droit.');
  if (prixAttendu !== undefined && Math.abs(prixAttendu - o.prix) > 0.005) throw new ErreurRevente('rachat', `L’offre de rachat a changé : ${fmt(o.prix)}.`);
  delete d.annonce; d.chaine.push(maillon('rachat', compteId, 'nexgtt', o.prix)); d.statut = 'rachete'; d.detenteurId = 'nexgtt';
  ecrire(compteId, 'rachat', `Rachat ${v.de} → ${v.vers}`, o.prix, { sous: `Vol ${v.numero} · offre NexG-TT, commission incluse`, droitId: d.id, hypothese: true });
  notifier(compteId, { type: 'vente', titre: `Rachat accepté : ${fmt(o.prix)} versés`, sous: `Vol ${v.numero} · le montant est sur votre solde NexG.`, essentielle: true, lien: '/solde' });
  return { prix: o.prix, droit: d };
}

/* ───────── Ordres à cours limité ───────── */
/** Jusqu'à quand un ordre est valable : 24 h, 7 jours, ou « jusqu'à J-2 » (48 h avant le départ). */
export function expirationOrdre(validite: ValiditeOrdre, creeLe: number, vol: Vol): number {
  const jMoins2 = departDuVol(vol) - 2 * J;
  return validite === 'jour' ? Math.min(creeLe + J, jMoins2) : validite === 'semaine' ? Math.min(creeLe + 7 * J, jMoins2) : jMoins2;
}
const volDeOrdre = (o: Ordre): Vol | undefined => volDe(o.volId);
export const ordresDe = (compteId: string): Ordre[] => app.monde.ordres.filter((o) => o.compteId === compteId).sort((a, b) => b.creeLe - a.creeLe);

/** Place un ordre d'achat à cours limité (1 billet) : le seuil se règle par pas de 10 $, jamais au-dessus du plafond. Si une revente est déjà au seuil ou en dessous, l'achat a lieu tout de suite. */
export function placerOrdre(compteId: string, volId: string, limite: number, validite: ValiditeOrdre): Ordre {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurRevente('compte', 'Connectez-vous pour placer un ordre.');
  const v = volDe(volId); if (!v) throw new ErreurRevente('ordre', 'Ce vol n’existe plus.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurRevente('echeance', 'L’échéance de ce vol est passée : plus aucun ordre n’est possible.');
  if (!Number.isFinite(limite) || limite <= 0) throw new ErreurRevente('prix', 'Indiquez un seuil supérieur à 0 $.');
  if (!sousPlafond(limite, v.prixNeuf)) throw new ErreurRevente('plafond', `Le seuil ne peut pas dépasser le prix équivalent neuf (${fmt(plafond(v.prixNeuf))}).`);
  if (limite % PAS_PRIX !== 0) throw new ErreurRevente('prix', `Le seuil se règle par pas de ${PAS_PRIX} $.`);
  const o: Ordre = { id: nouvelId('o'), compteId, volId, limite, validite, statut: 'actif', creeLe: maintenant() };
  app.monde.ordres.push(o);
  notifier(compteId, { type: 'prix', titre: `Ordre placé : ${v.de} → ${v.vers} à ${fmt(limite)}`, sous: `Vol ${v.numero} · achat automatique si une revente descend à ce seuil.`, essentielle: false, lien: `/ordre/${v.id}` });
  executerOrdres(volId);
  return app.monde.ordres.find((x) => x.id === o.id)!;
}
/** Annule un ordre encore actif. */
export function annulerOrdre(ordreId: string, compteId: string): Ordre {
  const o = app.monde.ordres.find((x) => x.id === ordreId);
  if (!o || o.compteId !== compteId) throw new ErreurRevente('ordre', 'Cet ordre n’existe pas.');
  if (o.statut !== 'actif') throw new ErreurRevente('ordre', o.statut === 'execute' ? 'Cet ordre a déjà été exécuté.' : 'Cet ordre n’est plus actif.');
  o.statut = 'annule'; return o;
}
/** Expire les ordres échus puis exécute ceux dont le seuil est atteint : achète la revente la moins chère (jamais celle de l'ordonnateur) via `acheter()`. Appelée à chaque nouvelle annonce et au démarrage. Renvoie les ordres exécutés. Idempotente. */
export function executerOrdres(volId?: string, quand: number = maintenant()): Ordre[] {
  const faits: Ordre[] = [];
  for (const o of app.monde.ordres) {
    if (o.statut !== 'actif' || (volId && o.volId !== volId)) continue;
    const v = volDeOrdre(o); if (!v || expirationOrdre(o.validite, o.creeLe, v) <= quand || !peutEchanger(departDuVol(v), quand)) { o.statut = 'expire'; continue; }
  }
  const actifs = app.monde.ordres.filter((o) => o.statut === 'actif' && (!volId || o.volId === volId)).sort((a, b) => b.limite - a.limite || a.creeLe - b.creeLe);
  for (const o of actifs) {
    const c = compteDe(o.compteId), v = volDeOrdre(o); if (!c || !c.actif || !v) continue;
    const offre = offresDuVol(o.volId).filter((x) => x.type === 'revente' && x.prix <= o.limite && app.monde.droits.find((d) => d.id === x.droitId)?.detenteurId !== o.compteId)[0];
    if (!offre) continue;
    try {
      const droit = acheter(offre, o.compteId, 'carte');
      o.statut = 'execute'; o.droitId = droit.id; faits.push(o);
      notifier(o.compteId, { type: 'achat', titre: `Ordre exécuté à ${fmt(offre.prix)} : ${v.de} → ${v.vers}`, sous: `Seuil ${fmt(o.limite)} · vol ${v.numero} · vous détenez ce droit, nommez le voyageur avant J-1.`, essentielle: true, lien: `/droit/${droit.id}` });
    } catch (e) { if (!(e instanceof ErreurMarche)) throw e; /* offre disparue ou solde insuffisant : l'ordre reste actif */ }
  }
  return faits;
}

/** Retire la proposition d'un vendeur sur une intention d'achat (il garde son billet) et prévient l'acheteur. */
export function retirerProposition(compteId: string, intentionId: string, pid: string): void {
  const i = app.monde.intentions.find((x) => x.id === intentionId), p = i?.propositions.find((x) => x.id === pid);
  if (!i || !p || p.vendeurId !== compteId) throw new ErreurRevente('proposition', 'Cette proposition n’existe pas.');
  if (p.statut !== 'recue') throw new ErreurRevente('proposition', 'Cette proposition a déjà reçu une réponse.');
  i.propositions.splice(i.propositions.indexOf(p), 1);
  notifier(i.compteId, { type: 'proposition', titre: 'Proposition retirée', sous: `Le vendeur a retiré sa proposition de ${fmt(p.prix)} sur ${i.de} → ${i.vers}.`, essentielle: false, lien: '/intentions' });
}
