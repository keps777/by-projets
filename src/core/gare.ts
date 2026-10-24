// Vue d'une gare à partir du monde : départs du jour, ventes par guichet, caisses, rapport du soir. Fonctions pures (le monde est passé en argument),
// donc utilisables dans un `$derived` comme dans un test. Les montants suivent `domain/actions.especesCaisse` et `core/caisse`.
import { ajouterJours, jourDe, jourSemaineLong, type Jour } from './dates.ts';
import { remboursement } from './tarif.ts';
import { attendu } from './caisse.ts';
import { minutes } from './retard.ts';
import { evolution, type LigneVente, type Rapport } from './rapport.ts';
import { TYPES_REFUS_SCAN } from './supervision.ts';
import type { Billet, Caisse, Depart, Monde, StatutDepart } from '../domain/types.ts';

export const TOLERANCE_RETARD_MIN = 10;
/** Numéro du guichet d'un agent dans sa gare (1, 2…), dans l'ordre de l'équipe. */
export const numeroGuichet = (m: Monde, gareId: string, agentId: string) => m.personnes.filter((p) => p.role === 'guichet' && p.gareId === gareId).findIndex((p) => p.id === agentId) + 1;
const ms = (d: Depart) => new Date(`${d.jour}T${d.heure}:00`).getTime() + d.retardMin * 60_000;
const gareDuDepart = (m: Monde, d: Depart) => m.lignes.find((l) => l.id === d.ligneId)?.gareDe;
const payeEnEspeces = (m: Monde, b: Billet) => m.paiements.find((p) => p.id === b.paiementId)?.moyen === 'especes';
const vendu = (b: Billet) => b.statut === 'valide' || b.statut === 'scanne';
/** Caisse du jour : ouverte ce jour-là (la date de la caisse est en UTC dans `ouvrirCaisse`, d'où le double test). */
export const caisseDuJour = (c: Caisse, jour: Jour) => c.jour === jour || jourDe(new Date(c.ouvertA)) === jour;

export interface VueDepart {
  id: string; heure: string; heureReelle: string; vers: string; de: string; compagnie: string; couleur: string; classe: string; statut: StatutDepart; retardMin: number;
  capacite: number; occupes: number; scannes: number; remplissage: number; /** Pas encore parti alors que l'heure réelle est dépassée de plus de 10 min. */ enRetard: boolean; ts: number;
}
function occupes(m: Monde, d: Depart, now: number): number {
  const actifs = m.billets.filter((b) => b.departId === d.id && (vendu(b) || (b.statut === 'attente_paiement' && (m.paiements.find((p) => p.id === b.paiementId)?.expireLe ?? 0) > now)));
  const pris = new Set(d.prisAilleurs); for (const b of actifs) if (b.siege) pris.add(b.siege);
  return Math.min(d.capacite, pris.size + actifs.filter((b) => !b.siege).length);
}
/** Départs d'une gare un jour donné, du plus tôt au plus tard (annulés compris : le statut le dit). */
export function departsGare(m: Monde, gareId: string, jour: Jour, now: number): VueDepart[] {
  return m.departs.filter((d) => d.jour === jour && gareDuDepart(m, d) === gareId).sort((a, b) => a.heure.localeCompare(b.heure)).map((d) => {
    const l = m.lignes.find((x) => x.id === d.ligneId)!, co = m.compagnies.find((c) => c.id === l.compagnieId), occ = occupes(m, d, now), t = ms(d);
    const reelle = minutes(d.heure) + d.retardMin;
    return { id: d.id, heure: d.heure, heureReelle: `${String(Math.floor(reelle / 60) % 24).padStart(2, '0')}:${String(reelle % 60).padStart(2, '0')}`, vers: l.vers, de: l.de, compagnie: co?.abrev ?? '', couleur: co?.couleur ?? '#B3A8FF', classe: l.classe, statut: d.statut, retardMin: d.retardMin,
      capacite: d.capacite, occupes: occ, scannes: m.billets.filter((b) => b.departId === d.id && b.statut === 'scanne').length, remplissage: d.capacite ? occ / d.capacite : 0, enRetard: (d.statut === 'prevu' || d.statut === 'embarquement') && now - t > TOLERANCE_RETARD_MIN * 60_000, ts: t };
  });
}

/** Billets de la gare vendus un jour : ceux de ses départs et ceux encaissés par ses caisses. */
function billetsVendus(m: Monde, gareId: string, jour: Jour): Billet[] {
  const caisses = new Set(m.caisses.filter((c) => c.gareId === gareId).map((c) => c.id)), departs = new Set(m.departs.filter((d) => gareDuDepart(m, d) === gareId).map((d) => d.id));
  return m.billets.filter((b) => vendu(b) && jourDe(new Date(b.creeLe)) === jour && (departs.has(b.departId) || (b.caisseId !== undefined && caisses.has(b.caisseId))));
}
const colisDeCaisse = (m: Monde, caisseId: string) => m.colis.filter((c) => c.caisseId === caisseId && c.statut !== 'annule');
/** Recette du jour de la gare : billets vendus + colis déposés à ses guichets. */
export function recetteDuJour(m: Monde, gareId: string, jour: Jour): number {
  const caisses = new Set(m.caisses.filter((c) => c.gareId === gareId).map((c) => c.id));
  const colis = m.colis.filter((c) => c.caisseId && caisses.has(c.caisseId) && c.statut !== 'annule' && jourDe(new Date(c.etapes[0]?.ts ?? 0)) === jour).reduce((s, c) => s + c.prix, 0);
  return billetsVendus(m, gareId, jour).reduce((s, b) => s + b.prix, 0) + colis;
}

export function construireRapport(m: Monde, p: { gareId: string; jour: Jour; now: number; superviseur: string }): Rapport {
  const { gareId, jour, now } = p, g = m.gares.find((x) => x.id === gareId), vendus = billetsVendus(m, gareId, jour), vues = departsGare(m, gareId, jour, now);
  const caisses = m.caisses.filter((c) => c.gareId === gareId && caisseDuJour(c, jour)), nom = (id: string) => m.personnes.find((x) => x.id === id)?.prenom ?? '—';
  const guichets: LigneVente[] = caisses.map((c) => {
    const bs = vendus.filter((b) => b.caisseId === c.id), especes = bs.filter((b) => payeEnEspeces(m, b)).reduce((s, b) => s + b.prix, 0), colis = colisDeCaisse(m, c.id);
    return { cle: c.id, libelle: `${nom(c.agentId)} · G${numeroGuichet(m, gareId, c.agentId)}`, billets: bs.length, colis: colis.length, especes: especes + colis.reduce((s, x) => s + x.prix, 0), total: bs.reduce((s, b) => s + b.prix, 0) + colis.reduce((s, x) => s + x.prix, 0), ecart: c.statut === 'fermee' || c.statut === 'validee' ? c.ecart ?? 0 : null, statut: c.statut };
  });
  const ligne = (cle: string, libelle: string, bs: Billet[]): LigneVente => ({ cle, libelle, billets: bs.length, colis: 0, especes: bs.filter((b) => payeEnEspeces(m, b)).reduce((s, b) => s + b.prix, 0), total: bs.reduce((s, b) => s + b.prix, 0), ecart: null });
  const sansCaisse = vendus.filter((b) => !b.caisseId || !caisses.some((c) => c.id === b.caisseId));
  const convoyeurs = ligne('convoyeurs', 'Convoyeurs', sansCaisse.filter((b) => b.canal === 'convoyeur')), enLigne = ligne('en-ligne', 'En ligne', sansCaisse.filter((b) => b.canal !== 'convoyeur'));
  const recetteBillets = vendus.reduce((s, b) => s + b.prix, 0), recette = recetteDuJour(m, gareId, jour), recetteColis = recette - recetteBillets;
  const reference = recetteDuJour(m, gareId, ajouterJours(jour, -7));

  const actifs = vues.filter((v) => v.statut !== 'annule'), partis = actifs.filter((v) => v.statut === 'parti' || v.statut === 'arrive'), base = partis.length ? partis : actifs;
  const remplissagePct = base.length ? Math.round((base.reduce((s, v) => s + v.remplissage, 0) / base.length) * 100) : 0;
  const parHeure = Array.from({ length: 24 }, (_, h) => ({ heure: h, ventes: vendus.filter((b) => new Date(b.creeLe).getHours() === h).length }));
  const premier = parHeure.findIndex((x) => x.ventes > 0), dernier = parHeure.reduce((a, x) => (x.ventes > 0 ? x.heure : a), 0);
  const debut = premier < 0 ? 6 : Math.min(premier, 12), fin = Math.min(23, Math.max(dernier, debut + 7));
  const barres = parHeure.slice(debut, fin + 1), maxV = Math.max(...barres.map((x) => x.ventes), 0), pics = barres.filter((x) => maxV > 0 && x.ventes === maxV);
  const pic = pics.length ? `pic ${String(pics[0].heure).padStart(2, '0')}–${String(pics[pics.length - 1].heure + 1).padStart(2, '0')} h` : null;

  const fermees = m.caisses.filter((c) => c.gareId === gareId && c.statut === 'fermee'), // toutes dates : une clôture d'hier reste à valider
     avecEcart = caisses.filter((c) => (c.statut === 'fermee' || c.statut === 'validee') && (c.ecart ?? 0) !== 0);
  const ev = m.evenements.filter((e) => jourDe(new Date(e.ts)) === jour), litiges = m.litiges.filter((l) => l.statut !== 'resolu' && jourDe(new Date(l.ts)) === jour);
  const refus = ev.filter((e) => (TYPES_REFUS_SCAN as readonly string[]).includes(e.type)).length, blocages = ev.filter((e) => e.type === 'blocage').length, deblocages = ev.filter((e) => e.type === 'deblocage').length;
  const incidents = [refus && `${refus} scan${refus > 1 ? 's' : ''} refusé${refus > 1 ? 's' : ''}`, blocages && `${blocages} guichet${blocages > 1 ? 's' : ''} bloqué${blocages > 1 ? 's' : ''}${deblocages ? `, ${deblocages} débloqué${deblocages > 1 ? 's' : ''}` : ''}`, litiges.length && `${litiges.length} litige${litiges.length > 1 ? 's' : ''} ouvert${litiges.length > 1 ? 's' : ''}`].filter(Boolean) as string[];
  const restants = actifs.filter((v) => v.statut === 'prevu' || v.statut === 'embarquement');
  const colisJour = m.colis.filter((c) => jourDe(new Date(c.etapes.find((e) => e.statut === 'depose')?.ts ?? c.etapes[0]?.ts ?? 0)) === jour && g !== undefined && (c.depart.includes(g.nom) || (c.caisseId !== undefined && caisses.some((x) => x.id === c.caisseId))));
  const reserves = [fermees.length && `${fermees.length} clôture${fermees.length > 1 ? 's' : ''} à valider`, caisses.filter((c) => c.statut === 'bloquee').length && 'guichet bloqué', caisses.filter((c) => c.statut === 'ouverte').length && `${caisses.filter((c) => c.statut === 'ouverte').length} caisse(s) encore ouverte(s)`, restants.length && `${restants.length} départ${restants.length > 1 ? 's' : ''} à venir`].filter(Boolean) as string[];
  return {
    gareId, gareNom: g?.nom ?? gareId, ville: g?.ville ?? '', jour, genereA: now, superviseur: p.superviseur, recette, recetteBillets, recetteColis, billets: vendus.length, evolutionPct: evolution(recette, reference), reference: `vs ${jourSemaineLong(ajouterJours(jour, -7)).split(' ')[0]} dernier`,
    guichets, convoyeurs, enLigne,
    departs: { total: actifs.length, partis: partis.length, annules: vues.length - actifs.length, restants: restants.length, retards: actifs.filter((v) => v.retardMin > 0).map((v) => ({ heure: v.heure, vers: v.vers, retardMin: v.retardMin })) },
    remplissagePct, parHeure: barres, pic,
    caisses: { total: caisses.length, ouvertes: caisses.filter((c) => c.statut === 'ouverte').length, aValider: fermees.length, validees: caisses.filter((c) => c.statut === 'validee').length, bloquees: caisses.filter((c) => c.statut === 'bloquee').length, ecartTotal: avecEcart.reduce((s, c) => s + (c.ecart ?? 0), 0), ecarts: avecEcart.map((c) => ({ agent: nom(c.agentId), montant: c.ecart ?? 0 })) },
    colis: { envoyes: colisJour.length, enAttente: m.colis.filter((c) => c.statut === 'au_relais' && g !== undefined && c.arrivee.includes(g.nom)).length },
    incidents, reserves
  };
}
/** Espèces attendues en caisse, d'après le monde passé (même règle que `domain/actions.attenduDeCaisse`). */
export function attenduCaisseMonde(m: Monde, c: Caisse): number {
  const bs = m.billets.filter((b) => b.caisseId === c.id && payeEnEspeces(m, b)), ventes = bs.filter(vendu).reduce((s, b) => s + b.prix, 0);
  const rembourses = bs.filter((b) => b.statut === 'rembourse').reduce((s, b) => s + remboursement(b.prix, 9999).rembourse, 0);
  return attendu(c.fond, ventes + colisDeCaisse(m, c.id).reduce((s, x) => s + x.prix, 0), rembourses);
}
