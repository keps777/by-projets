// Assistant du patron · « pourquoi les ventes baissent ? » : compare semaine à semaine les billets du monde, cherche les causes dans les données, simule un prix.
import type { Ligne, Monde } from '../domain/types.ts';
import { ajouterJours, enDate, type Jour } from './dates.ts';
import { fcfa as fcfaBase } from './money.ts';
import { decaler, derniersJours, fenetre, jourDeTs, libelleVariation, minuteDe, remplissages, ventes, variation, type Donnees, type Vente } from './indicateurs.ts';
import { minutes } from './retard.ts';
import type { ColisPartenaire, Convention } from './interagences.ts';

export type DonneesAssistant = Donnees & Pick<Monde, 'compagnies' | 'personnes'>;
export interface Contexte { d: DonneesAssistant; jour: Jour; now: number; compagnieId: string; /** Conventions inter-agences et colis confiés (tranche du patron), pour les questions sur le partage. */ conventions?: Pick<Convention, 'partenaireId' | 'partBetaPct' | 'statut'>[]; liens?: ColisPartenaire[] }
export interface Portee { libelle: string; deVille?: string; versVille?: string; gareId?: string }
export interface Chiffre { libelle: string; valeur: string; ton?: 'ok' | 'er' | 'wa' }
export interface Point { titre: string; detail: string }
export interface Action { libelle: string; style: 'p' | 's'; lien?: string; prix?: { ligneId: string; heure: string; prix: number } }
export type Intention = 'convention' | 'baisse' | 'comparer' | 'classement' | 'rapprochement' | 'financement' | 'caisse' | 'retards' | 'colis' | 'bilan' | 'inconnue';
export interface Serie { libelles: string[]; valeurs: number[]; creux: boolean[]; unite: string }
export interface Reponse {
  intention: Intention; question: string; titre: string; texte: string; serie?: Serie; chiffres: Chiffre[]; pointsTitre: string; points: Point[]; actions: Action[];
  suite?: { question: string; reponse: string }; sources: string;
}
/** Montant avec espaces insécables : un chiffre ne se coupe jamais en fin de ligne. */
export const fcfa = (n: number) => fcfaBase(n).replace(/ /g, '\u00a0');
export const dansPortee = (l: Pick<Ligne, 'de' | 'vers' | 'gareDe'>, p: Portee) => (!p.deVille || l.de === p.deVille) && (!p.versVille || l.vers === p.versVille) && (!p.gareId || l.gareDe === p.gareId);
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const nomJour = (j: Jour) => JOURS_LONGS[enDate(j).getDay()];
export const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Élasticité du prix : −10 % de prix attire +25 % de remplissage (hypothèse prudente, plafonnée à un bus plein). */
export const ELASTICITE = 2.5;
export interface SimulationPrix { ancien: number; nouveau: number; margePct: number; avant: number; apres: number; recettePct: number; texte: string }
export function simulerPrix(c: Contexte, a: { ligneId: string; heure: string; prix: number }): SimulationPrix | null {
  const deps = c.d.departs.filter((x) => x.ligneId === a.ligneId && x.heure === a.heure && x.jour >= c.jour && x.jour <= ajouterJours(c.jour, 7) && x.statut !== 'annule');
  if (!deps.length) return null;
  const r = remplissages(c.d, c.now), avant = deps.reduce((s, x) => s + (r.get(x.id) ?? 0), 0) / deps.length, ancien = Math.round(deps.reduce((s, x) => s + x.prix, 0) / deps.length);
  const baisse = (a.prix - ancien) / ancien, apres = Math.min(1, Math.max(0, avant * (1 - ELASTICITE * baisse))), recettePct = avant > 0 ? Math.round(((a.prix * apres) / (ancien * avant) - 1) * 100) : 0;
  const margePct = Math.round(baisse * 100), pts = (x: number) => Math.round(x * 100);
  const sens = recettePct >= 0 ? `+${recettePct}\u00a0%` : `−${Math.abs(recettePct)}\u00a0%`;
  return { ancien, nouveau: a.prix, margePct, avant, apres, recettePct, texte: `Si tu passes à ${fcfa(a.prix)}\u00a0F : ${margePct < 0 ? '−' : '+'}${Math.abs(margePct)}\u00a0% par billet, remplissage attendu de ${pts(avant)}\u00a0% à ${pts(apres)}\u00a0% → ${sens} de recette sur les 7 prochains jours${recettePct < 0 ? ' : ce prix ne se rembourse pas' : ''}.` };
}
/** Départ concurrent moins cher (même ville de départ et d'arrivée, même classe, ±75 min) autour d'une heure. */
function concurrent(c: Contexte, l: Ligne, heure: string, prixNous: number) {
  let meilleur: { nom: string; heure: string; prix: number; ecart: number } | null = null;
  const lignes = new Map(c.d.lignes.map((x) => [x.id, x]));
  for (const dep of c.d.departs) {
    const o = lignes.get(dep.ligneId);
    if (!o || o.compagnieId === l.compagnieId || o.de !== l.de || o.vers !== l.vers || o.classe !== l.classe || dep.statut === 'annule' || dep.jour < c.jour || dep.jour > ajouterJours(c.jour, 2)) continue;
    const ecart = Math.abs(minutes(dep.heure) - minutes(heure));
    if (ecart > 75 || dep.prix > prixNous - 500 || dep.prix > prixNous * 0.95) continue;
    if (!meilleur || dep.prix < meilleur.prix || (dep.prix === meilleur.prix && ecart < meilleur.ecart)) meilleur = { nom: c.d.compagnies.find((x) => x.id === o.compagnieId)?.nom ?? o.compagnieId, heure: dep.heure, prix: dep.prix, ecart };
  }
  return meilleur;
}
export function analyseBaisse(c: Contexte, p: Portee, question: string): Reponse {
  const tout = ventes(c.d, c.compagnieId).filter((x) => dansPortee(x.ligne, p)), jours = derniersJours(c.jour, 7), min = minuteDe(c.now), prec = decaler(jours, -7);
  const cur = fenetre(tout, jours, min), ref = fenetre(tout, prec, min), v = variation(cur.length, ref.length);
  const base: Reponse = { intention: 'baisse', question, titre: '', texte: '', chiffres: [], pointsTitre: '3 causes probables', points: [], actions: [], sources: 'sources : billets vendus, caisses, départs' };
  if (!cur.length && !ref.length) return { ...base, titre: `Je n’ai aucune vente pour ${p.libelle}`, texte: 'Ni cette semaine ni la précédente : je ne peux pas comparer. Vérifie le nom de la ville ou de la gare.', pointsTitre: '' };
  const compte = (xs: Vente[], j: Jour, lim: number) => fenetre(xs, [j], lim).length;
  const valeurs = jours.map((j) => compte(tout, j, j === c.jour ? min : 1440)), avant = prec.map((j) => compte(tout, j, j === ajouterJours(c.jour, -7) ? min : 1440));
  const creux = valeurs.map((x, i) => avant[i] > 0 && x < avant[i] * 0.85);
  let depuis = 0; for (let i = creux.length - 1; i >= 0 && creux[i]; i--) depuis++;
  const serie: Serie = { libelles: jours.map((j) => JOURS_COURTS[enDate(j).getDay()]), valeurs, creux, unite: 'billets' };
  const chiffres: Chiffre[] = [{ libelle: 'Billets · 7 jours', valeur: `${cur.length} (${libelleVariation(v)})`, ton: (v ?? 0) < 0 ? 'er' : 'ok' }, { libelle: 'Semaine d’avant', valeur: `${ref.length} billets` }];
  if (v === null || v >= 0) return { ...base, titre: `Pas de baisse sur ${p.libelle} : ${v === null ? 'rien à comparer' : libelleVariation(v)}`, texte: `${pluriel(cur.length, 'billet', 'billets')} sur 7 jours contre ${ref.length} la semaine d’avant. 7 derniers jours, en billets :`, serie, chiffres, pointsTitre: '', actions: [{ libelle: 'Voir les gares', style: 'p', lien: '/patron/equipe' }] };

  const points: Point[] = [], actions: Action[] = [];
  // 1. Concurrence sur le prix, horaire par horaire
  const parHoraire = new Map<string, { l: Ligne; heure: string; cur: number; ref: number }>();
  for (const [xs, cle] of [[cur, 'cur'], [ref, 'ref']] as const) for (const x of xs) { const k = `${x.ligne.id}|${x.depart.heure}`, e = parHoraire.get(k) ?? { l: x.ligne, heure: x.depart.heure, cur: 0, ref: 0 }; e[cle]++; parHoraire.set(k, e); }
  const pertes = [...parHoraire.values()].filter((e) => e.ref - e.cur >= 2).sort((a, b) => b.ref - b.cur - (a.ref - a.cur));
  for (const e of pertes.slice(0, 3)) {
    const nous = c.d.departs.find((x) => x.ligneId === e.l.id && x.heure === e.heure && x.jour >= c.jour && x.statut !== 'annule')?.prix ?? e.l.prix, rival = concurrent(c, e.l, e.heure, nous);
    if (!rival) continue;
    points.push({ titre: `${rival.nom} propose un ${rival.heure} à ${fcfa(rival.prix)}\u00a0F`, detail: `ton ${e.heure} est à ${fcfa(nous)}\u00a0F (+${fcfa(nous - rival.prix)}\u00a0F) · ${e.cur} billets cette semaine contre ${e.ref} la semaine d’avant` });
    if (!actions.some((a) => a.prix)) actions.push({ libelle: `Passer le ${e.heure} à ${fcfa(rival.prix)}\u00a0F`, style: 'p', prix: { ligneId: e.l.id, heure: e.heure, prix: rival.prix } });
  }
  // 2. Départs annulés ou retardés dans la semaine
  const lignesPortee = new Set(c.d.lignes.filter((l) => l.compagnieId === c.compagnieId && dansPortee(l, p)).map((l) => l.id)), semaine = new Set(jours);
  const touches = c.d.departs.filter((x) => lignesPortee.has(x.ligneId) && semaine.has(x.jour)), annules = touches.filter((x) => x.statut === 'annule'), retardes = touches.filter((x) => x.statut !== 'annule' && x.retardMin >= 30);
  if (annules.length) { const ids = new Set(annules.map((x) => x.id)), rb = c.d.billets.filter((b) => ids.has(b.departId) && b.statut === 'rembourse').length; points.push({ titre: `${pluriel(annules.length, 'départ annulé', 'départs annulés')} cette semaine`, detail: `${pluriel(rb, 'billet remboursé', 'billets remboursés')} automatiquement` }); }
  if (retardes.length) points.push({ titre: `${pluriel(retardes.length, 'départ retardé', 'départs retardés')} de 30 min ou plus`, detail: 'les voyageurs se reportent sur les autres compagnies quand ça dure' });
  // 3. Guichet fermé : moins de caisses ouvertes un jour creux que le même jour la semaine d'avant
  const gares = new Set(c.d.lignes.filter((l) => lignesPortee.has(l.id)).map((l) => l.gareDe)), caisses = c.d.caisses.filter((x) => gares.has(x.gareId));
  const jourCaisse = jourDeTs;
  jours.forEach((j, i) => {
    if (!creux[i] || j === c.jour || points.length >= 4) return;
    const ici = caisses.filter((x) => jourCaisse(x.ouvertA) === j), la = caisses.filter((x) => jourCaisse(x.ouvertA) === ajouterJours(j, -7)), absent = la.find((x) => !ici.some((y) => y.agentId === x.agentId));
    if (!absent || ici.length >= la.length) return;
    const ag = c.d.personnes.find((x) => x.id === absent.agentId), gare = c.d.gares.find((g) => g.id === absent.gareId);
    points.push({ titre: `${ag?.prenom ?? 'Un guichetier'} n’a pas ouvert sa caisse ${nomJour(j)}`, detail: `${pluriel(ici.length, 'caisse ouverte', 'caisses ouvertes')} à ${gare?.nom ?? absent.gareId} contre ${la.length} le ${nomJour(j)} d’avant` });
    if (ag && !actions.some((a) => a.lien?.includes(ag.id))) actions.push({ libelle: `Parler à ${ag.prenom}`, style: 's', lien: `/patron/personne?personne=${ag.id}` });
  });
  if (!points.length && pertes[0]) points.push({ titre: `Le ${pertes[0].heure} concentre la baisse`, detail: `${pertes[0].cur} billets cette semaine contre ${pertes[0].ref} la semaine d’avant, sans concurrent moins cher ni annulation` });
  if (!points.length) points.push({ titre: 'Rien d’anormal dans tes départs ni tes caisses', detail: 'la baisse est étalée sur plusieurs horaires : à surveiller quelques jours avant de toucher aux prix' });
  actions.push({ libelle: 'Voir la ligne', style: 's', lien: `/siege/analyses/ligne${pertes[0] ? `?ligne=${encodeURIComponent(pertes[0].l.id)}` : ''}` });
  const prix = actions.find((a) => a.prix)?.prix, sim = prix ? simulerPrix(c, prix) : null;
  return {
    ...base, titre: `${p.libelle} fait ${libelleVariation(v)} en 7 jours${depuis >= 2 ? `, ${depuis} jours de baisse d’affilée` : ''}`, texte: `${cur.length} billets contre ${ref.length} la semaine d’avant. 7 derniers jours, en billets :`, serie, chiffres,
    pointsTitre: `${pluriel(Math.min(points.length, 3), 'cause probable', 'causes probables')}`, points: points.slice(0, 3), actions,
    suite: prix && sim ? { question: `Continuer : « et si je baisse à ${fcfa(prix.prix)}\u00a0F ? »`, reponse: sim.texte } : undefined
  };
}
