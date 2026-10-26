// Un droit de voyage vu par son détenteur : billet (recto / verso), valeur indicative, actions possibles selon l'état, chaîne de détention. Fonctions pures sur le monde.
import { ecart, fmt, type Ecart } from '../../core/argent.ts';
import { departDe, echeanceDe, joursAvant, peutEchanger, plafond } from '../../core/regles.ts';
import { pointsSerie } from '../../core/indices.ts';
import type { Droit, Maillon, Monde, Vol } from '../../domain/types.ts';
import { nomPartie } from '../achat/chaine.ts';
import { dureeHM, heureDe, jourCourt, jourSemaine } from '../voyager/format.ts';
import { carteDe, dateHeure, intentionsSurVol, LIBELLE_STATUT, origineLibelle, type StatutCarte } from './portefeuille.ts';

export type Ton = 'signal' | 'ok' | 'info' | 'neutre' | 'err';
export interface Action { id: 'revendre' | 'nommer' | 'transferer' | 'liquidite'; titre: string; sous: string; href: string; /** Mise en avant (jaune) : l'action attendue. */ principale: boolean; /** Ouvre le volet d'explication avant de naviguer. */ volet?: boolean }
export interface VueDroit {
  droit: Droit; vol: Vol; statut: StatutCarte; departMs: number; echeanceMs: number; jEcheance: string; echeancePassee: boolean; plafondRevente: number; ecart: Ecart;
  /** Puce du billet (recto). */ puce: { texte: string; ton: Ton }; ligneStatut: string; actions: Action[];
  /** Droit modifiable : détenu ou en vente, échéance non passée. */ ouvert: boolean; message?: { titre: string; texte: string; ton: Ton; liens: { texte: string; href: string }[] };
  retirerAnnonce?: { prix: number; href: string }; acheteurs?: { n: number; max: number; fonds: boolean };
}
const prenomNom = (m: Monde, id: string): string => nomPartie(id, m);
/** « 12 janv. » ; avec l'année si ce n'est pas celle d'aujourd'hui. */
export const jourAnnee = (ms: number, now: number): string => (new Date(ms).getFullYear() === new Date(now).getFullYear() ? jourCourt(ms) : `${jourCourt(ms)} ${new Date(ms).getFullYear()}`);

export function vueDroit(m: Monde, d: Droit, now: number): VueDroit | undefined {
  const carte = carteDe(m, d, now), vol = m.vols.find((v) => v.id === d.volId); if (!carte || !vol) return undefined;
  const dep = departDe(vol.jour, vol.heureDepart), ech = echeanceDe(dep), ouvert = (d.statut === 'detenu' || d.statut === 'en_vente') && peutEchanger(dep, now), id = encodeURIComponent(d.id);
  const quand = dateHeure(ech, now), nom = prenomNom(m, d.detenteurId);
  const puce: VueDroit['puce'] = d.statut === 'en_vente' ? { texte: `En revente · ${fmt(d.annonce?.prix ?? 0)}`, ton: 'info' } : d.statut === 'nomme' ? { texte: `Voyageur nommé${d.voyageur ? ` · ${d.voyageur.prenom} ${d.voyageur.nom}` : ''}`, ton: 'ok' }
    : d.statut === 'voyage' ? { texte: 'Voyagé', ton: 'neutre' } : d.statut === 'gele' ? { texte: 'Droit gelé', ton: 'err' } : { texte: `À nommer avant le ${quand}`, ton: 'signal' };
  const actions: Action[] = [];
  if (ouvert) {
    const vente = d.statut === 'en_vente';
    actions.push({ id: 'revendre', titre: vente ? 'Retirer l’annonce' : 'Revendre', sous: vente ? `En vente à ${fmt(d.annonce?.prix ?? 0)} · retirer ou modifier` : `Vous fixez le prix, plafond ${fmt(plafond(vol.prixNeuf))}`, href: `/revendre/${id}`, principale: false });
    actions.push({ id: 'nommer', titre: 'Nommer le voyageur', sous: `Avant le ${quand}`, href: `/nommer/${id}`, principale: true });
    if (!vente) actions.push({ id: 'transferer', titre: 'Transférer à un proche', sous: 'Sans vente, vers son compte', href: `/transferer/${id}`, principale: false, volet: true });
    actions.push({ id: 'liquidite', titre: 'Vendre maintenant ou attendre ?', sous: 'Comparer rachat et revente', href: `/liquidite/${id}`, principale: false });
  }
  const message: VueDroit['message'] = d.statut === 'gele' ? { titre: 'Ce droit est gelé', texte: `${d.gelRaison ?? 'Un contrôle est en cours.'} Revente, transfert et nommage sont suspendus le temps de la vérification.`, ton: 'err', liens: [{ texte: 'Contacter l’assistance', href: '/aide' }] }
    : d.statut === 'nomme' ? { titre: 'Voyageur nommé : actions fermées', texte: 'Le nom du voyageur est transmis à la compagnie. Plus aucune revente ni aucun transfert ; vous pouvez préparer le voyage.', ton: 'ok', liens: [{ texte: 'Préparer mon voyage', href: `/voyage/${id}` }, { texte: 'Mon billet prêt à voyager', href: `/pret-a-voyager/${id}` }] }
    : d.statut === 'voyage' ? { titre: 'Voyage effectué', texte: 'Ce droit a été utilisé. Il reste dans votre historique avec sa chaîne de détention.', ton: 'neutre', liens: [{ texte: 'Voir le portefeuille', href: '/portefeuille' }] }
    : !ouvert ? { titre: 'Échéance passée', texte: 'Plus aucune transaction n’est possible sur ce droit : le détenteur voyage.', ton: 'signal', liens: [{ texte: 'Préparer mon voyage', href: `/voyage/${id}` }] } : undefined;
  const lib = d.statut === 'detenu' ? 'détenu' : LIBELLE_STATUT[carte.statut].toLowerCase();
  const it = intentionsSurVol(m, d, vol);
  return { droit: d, vol, statut: carte.statut, departMs: dep, echeanceMs: ech, jEcheance: carte.jEcheance, echeancePassee: !peutEchanger(dep, now), plafondRevente: plafond(vol.prixNeuf), ecart: ecart(d.prixPaye, vol.prixNeuf), puce, ligneStatut: `Statut : ${lib} · ${nom}`, actions, ouvert, message,
    retirerAnnonce: d.statut === 'en_vente' && d.annonce ? { prix: d.annonce.prix, href: `/revendre/${id}` } : undefined, acheteurs: ouvert && it.n ? it : undefined };
}

/** Série de la valeur indicative : le prix payé, puis huit relevés espacés des courbes (le dernier est le prix équivalent d'aujourd'hui). */
export function serieValeur(d: Droit, v: Vol, n = 8): number[] {
  const c = v.courbe; if (c.length < 2) return [d.prixPaye, v.prixNeuf];
  return [d.prixPaye, ...Array.from({ length: n }, (_, i) => c[Math.round((i * (c.length - 1)) / (n - 1))])];
}
export const courbeValeur = (d: Droit, v: Vol) => pointsSerie(serieValeur(d, v), 312, 100, 10);
/** Date de l'achat (premier maillon qui fait entrer le droit chez ce détenteur) et son intitulé (« Achat neuf », « Drop membre »…). */
export function achatDe(d: Droit): { quand: number; titre: string } {
  const m = [...d.chaine].reverse().find((x) => x.vers === d.detenteurId && x.type !== 'nommage' && x.type !== 'gel' && x.type !== 'degel') ?? d.chaine[0];
  const t = origineLibelle(d); const titre = d.origine === 'neuf' ? 'Achat neuf' : d.origine === 'drop' ? 'Drop membre' : d.origine === 'revente' ? 'Achat en revente' : d.origine === 'agence' ? 'Achat en agence' : d.origine === 'import' ? 'Billet importé' : (t ?? 'Transfert reçu');
  return { quand: m?.quand ?? 0, titre };
}

export type Repere = 'passe' | 'aujourdhui' | 'echeance' | 'depart';
export interface Etape { id: string; quand: number; date: string; heure?: string; titre: string; detail: string; repere: Repere }
const TITRE: Record<Maillon['type'], string> = { achat_neuf: 'Achat neuf', drop: 'Drop membre obtenu', revente: 'Achat en revente', agence: 'Achat en agence', import: 'Billet importé', transfert: 'Transfert à un proche', rachat: 'Rachat par NexG-TT', nommage: 'Voyageur nommé', gel: 'Gel administratif', degel: 'Dégel' };
const etatCourt = (d: Droit): string => (d.statut === 'en_vente' ? 'En vente' : d.statut === 'nomme' ? 'Nommé' : d.statut === 'voyage' ? 'Voyagé' : d.statut === 'gele' ? 'Gelé' : 'Détenu');
/** La chaîne de détention puis, à venir, l'échéance de finalisation et le départ : « 12 janv. Achat neuf · Alex T. (vous) · 1 000 $ » … « 14 déc. Départ YUL → CDG ». */
export function chaineDe(m: Monde, d: Droit, now: number): Etape[] {
  const v = m.vols.find((x) => x.id === d.volId)!, dep = departDe(v.jour, v.heureDepart), ech = echeanceDe(dep), e: Etape[] = [];
  for (const x of [...d.chaine].sort((a, b) => a.quand - b.quand)) {
    const vers = prenomNom(m, x.vers) + (x.vers === d.detenteurId ? ' (vous)' : '');
    const detail = x.type === 'nommage' ? (x.note ?? 'Transmis à la compagnie ; revente et transfert fermés.') : x.type === 'gel' || x.type === 'degel' ? (x.note ?? d.gelRaison ?? 'Décision de l’administration') : x.type === 'transfert' ? `${prenomNom(m, x.de ?? '')} → ${prenomNom(m, x.vers)}` : `${vers}${x.prix ? ` · ${fmt(x.prix)}` : ''}`;
    e.push({ id: x.id, quand: x.quand, date: jourAnnee(x.quand, now), titre: TITRE[x.type], detail, repere: 'passe' });
  }
  e.push({ id: 'aujourdhui', quand: now, date: jourAnnee(now, now), titre: 'Aujourd’hui', detail: `${etatCourt(d)} · prix équivalent ${fmt(v.prixNeuf)} (indicatif)`, repere: 'aujourdhui' });
  if (ech > now) e.push({ id: 'echeance', quand: ech, date: jourCourt(ech), heure: heureDe(ech), titre: 'Échéance de finalisation', detail: 'Dernier moment pour nommer le voyageur ; ensuite, plus aucune transaction.', repere: 'echeance' });
  e.push({ id: 'depart', quand: dep, date: jourCourt(dep), heure: heureDe(dep), titre: `Départ ${v.de} → ${v.vers}`, detail: `${v.numero} · ${d.voyageur ? 'voyageur nommé' : 'voyageur à nommer'}`, repere: 'depart' });
  return e.sort((a, b) => a.quand - b.quand || (a.repere === 'aujourdhui' ? 1 : -1));
}
/** Position d'aujourd'hui sur la règle de la chaîne, entre le premier maillon et le départ (0 à 100 %). */
export function avancementChaine(d: Droit, v: Vol, now: number): { debut: number; fin: number; pct: number; joursAvantEcheance: number } {
  const debut = d.chaine.length ? Math.min(...d.chaine.map((x) => x.quand)) : now, fin = departDe(v.jour, v.heureDepart);
  return { debut, fin, pct: fin > debut ? Math.max(0, Math.min(100, Math.round(((now - debut) / (fin - debut)) * 10000) / 100)) : 100, joursAvantEcheance: joursAvant(echeanceDe(fin), now) };
}
export interface ResumeBagages { inclus: number; enVente: number; revendus: number }
export interface VueBagages { resume: ResumeBagages; kg: number; prevus: number; enVente: number; /** Un bagage inclus peut être revendu en gardant au moins un bagage pour voyager. */ vendable: boolean; dePrix?: number }
/** Bagages du droit : prévus, en vente, et le prix d'entrée de la soute du vol (offres des autres passagers, sous le plafond de la compagnie). */
export function bagagesVue(m: Monde, d: Droit, kg = 23): VueBagages {
  const siens = m.bagages.filter((b) => b.volId === d.volId && b.detenteurId === d.detenteurId), enVente = siens.filter((b) => b.statut === 'en_vente').length, revendus = siens.filter((b) => b.statut === 'vendu' || b.statut === 'transfere').length;
  const plafondBag = m.vols.find((v) => v.id === d.volId)?.prixBagageCompagnie ?? 0, offres = m.bagages.filter((b) => b.volId === d.volId && b.statut === 'en_vente' && b.detenteurId !== d.detenteurId && b.prix > 0 && b.prix <= plafondBag);
  return { resume: { inclus: d.bagagesInclus, enVente, revendus }, kg, prevus: Math.max(0, d.bagagesInclus - enVente - revendus), enVente, vendable: d.bagagesInclus - 1 - enVente - revendus > 0, dePrix: offres.length ? Math.min(...offres.map((o) => o.prix)) : undefined };
}
export const dureeVol = (v: Vol): string => `${v.escales.length ? `${v.escales.length} escale${v.escales.length > 1 ? 's' : ''}` : 'Direct'} · ${dureeHM(v.dureeMin)}`;
export const jourVol = (v: Vol): string => jourSemaine(departDe(v.jour, v.heureDepart), { avecAnnee: true, maj: true });
