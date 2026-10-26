// Le portefeuille de droits de voyage : agrégats, regroupement par onglet (Actifs / En revente / Historique), cartes de droits, droits de bagage en vente, transactions.
// Fonctions pures sur le monde. Les agrégats de l'accueil (`apps/voyager/portefeuille.ts`) sont réutilisés tels quels : un seul calcul du « prix équivalent total ».
import { ecart, fmt, type Ecart } from '../../core/argent.ts';
import { departDe, echeanceDe, joursAvant } from '../../core/regles.ts';
import type { Droit, Maillon, Monde, Vol } from '../../domain/types.ts';
import { agregatPortefeuille, droitsActifs, type Agregat } from '../voyager/portefeuille.ts';
import { jourCourt, jourSemaine, heureDe } from '../voyager/format.ts';

export { agregatPortefeuille, type Agregat };
export type OngletPf = 'actifs' | 'revente' | 'historique';
/** Un droit détenu dont l'échéance est à 90 jours ou moins passe en « À nommer » (même seuil que « Proche » du calendrier des échéances). */
export const HORIZON_NOMMER_JOURS = 90;
export type StatutCarte = 'a_nommer' | 'detenu' | 'en_vente' | 'nomme' | 'voyage' | 'gele';
export const LIBELLE_STATUT: Record<StatutCarte, string> = { a_nommer: 'À nommer', detenu: 'Détenu', en_vente: 'En revente', nomme: 'Nommé', voyage: 'Voyagé', gele: 'Gelé' };
const TRANSACTIONS: Maillon['type'][] = ['achat_neuf', 'drop', 'revente', 'agence', 'import', 'transfert', 'rachat'];

export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);
export const volOf = (m: Monde, d: Droit): Vol | undefined => m.vols.find((v) => v.id === d.volId);
const aeroport = (m: Monde, code: string) => m.aeroports.find((a) => a.code === code)?.ville ?? code;
const compagnieNom = (m: Monde, v: Vol): string => m.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? v.compagnieId;
/** « Aérolys · Vol 812 », ou « Aérolys · 1 escale LAX » avec escale. */
export function enTete(m: Monde, v: Vol): string {
  const c = compagnieNom(m, v), no = v.numero.split(' ').slice(1).join(' ');
  return v.escales.length ? `${c} · ${v.escales.length} escale${v.escales.length > 1 ? 's' : ''} ${v.escales.join(', ')}` : `${c} · Vol ${no}`;
}
/** « lun. 14 déc. 2026 » (jour du départ). */
export const dateVol = (v: Vol): string => jourSemaine(departDe(v.jour, v.heureDepart), { avecAnnee: true });
/** « 13 déc. 18:05 » (échéance, avec l'année si ce n'est pas l'année en cours). */
export function dateHeure(ms: number, now: number): string { const a = new Date(ms).getFullYear() !== new Date(now).getFullYear() ? ` ${new Date(ms).getFullYear()}` : ''; return `${jourCourt(ms)}${a} ${heureDe(ms)}`; }
const jourAvecAnnee = (ms: number, now: number): string => (new Date(ms).getFullYear() !== new Date(now).getFullYear() ? `${jourCourt(ms)} ${new Date(ms).getFullYear()}` : jourCourt(ms));

/** « Obtenu via Drop », « Revente · 3e détenteur »… ; rien pour un achat neuf. */
export function origineLibelle(d: Pick<Droit, 'origine' | 'chaine'>): string | null {
  switch (d.origine) {
    case 'drop': return 'Obtenu via Drop';
    case 'revente': return `Revente · ${ordinal(d.chaine.filter((x) => TRANSACTIONS.includes(x.type)).length)} détenteur`;
    case 'agence': return 'Acheté en agence'; case 'import': return 'Billet importé'; case 'transfert': return 'Reçu d’un proche'; default: return null;
  }
}
/** Acheteurs qui cherchent ce vol : intentions publiées d'autres comptes (même vol, ou même trajet sans vol précis). */
export function intentionsSurVol(m: Monde, d: Droit, v: Vol): { n: number; max: number; fonds: boolean } {
  const l = m.intentions.filter((i) => i.statut === 'publiee' && i.compteId !== d.detenteurId && (i.volId ? i.volId === v.id : i.de === v.de && i.vers === v.vers));
  return { n: l.length, max: l.reduce((s, i) => Math.max(s, i.budget), 0), fonds: l.some((i) => i.fondsReserves > 0) };
}

export interface CarteDroit {
  droitId: string; volId: string; de: string; vers: string; ville: string; enTete: string; date: string; statut: StatutCarte; statutLib: string; prixPaye: number; equivalent: number; ecart: Ecart;
  origine: string | null; echeanceMs: number; /** « 13 déc. 18:05 ». */ echeance: string; /** « J-62 ». */ jEcheance: string; annonce?: number; /** « 29 janv. 2027 » : retrait automatique de l'annonce. */ retrait: string;
  intentions?: { n: number; max: number; fonds: boolean }; aria: string;
}
export function carteDe(m: Monde, d: Droit, now: number): CarteDroit | undefined {
  const v = volOf(m, d); if (!v) return undefined;
  const dep = departDe(v.jour, v.heureDepart), ech = echeanceDe(dep), jours = joursAvant(ech, now);
  const statut: StatutCarte = d.statut === 'detenu' ? (jours <= HORIZON_NOMMER_JOURS ? 'a_nommer' : 'detenu') : d.statut === 'en_vente' ? 'en_vente' : d.statut === 'nomme' ? 'nomme' : d.statut === 'voyage' ? 'voyage' : d.statut === 'gele' ? 'gele' : 'detenu';
  const ville = aeroport(m, v.vers), it = intentionsSurVol(m, d, v);
  return {
    droitId: d.id, volId: v.id, de: v.de, vers: v.vers, ville, enTete: enTete(m, v), date: `${ville} · ${dateVol(v)}`, statut, statutLib: LIBELLE_STATUT[statut], prixPaye: d.prixPaye, equivalent: v.prixNeuf, ecart: ecart(d.prixPaye, v.prixNeuf),
    origine: origineLibelle(d), echeanceMs: ech, echeance: dateHeure(ech, now), jEcheance: `J-${jours}`, annonce: d.annonce?.prix, retrait: jourAvecAnnee(ech, now), intentions: it.n ? it : undefined,
    aria: `${v.de} vers ${v.vers}, ${ville}, ${dateVol(v)}, ${LIBELLE_STATUT[statut].toLowerCase()}`
  };
}

export interface BagageEnVente { bagageId: string; volId: string; droitId?: string; vers: string; jour: string; numeroVol: string; kg: number; prix: number; plafond: number; note: string }
/** Les droits de bagage que le compte met en vente, pour des vols pas encore partis. */
export function bagagesEnVente(m: Monde, compteId: string, now: number): BagageEnVente[] {
  const res: BagageEnVente[] = [];
  for (const b of m.bagages) {
    if (b.detenteurId !== compteId || b.statut !== 'en_vente') continue;
    const v = m.vols.find((x) => x.id === b.volId); if (!v || departDe(v.jour, v.heureDepart) <= now) continue;
    const d = m.droits.find((x) => x.volId === v.id && x.detenteurId === compteId), jour = jourCourt(departDe(v.jour, v.heureDepart));
    const rang = d ? `Votre ${d.bagagesInclus > 1 ? `${ordinal(d.bagagesInclus)} bagage inclus` : 'bagage inclus'}, non utilisé` : 'Votre bagage inclus, non utilisé';
    res.push({ bagageId: b.id, volId: v.id, droitId: d?.id, vers: v.vers, jour, numeroVol: v.numero, kg: b.kg, prix: b.prix, plafond: v.prixBagageCompagnie,
      note: `${rang}. Seuls les passagers du vol ${v.numero} du ${jour} peuvent l’acheter. Plafond : prix compagnie ${fmt(v.prixBagageCompagnie)} (règle provisoire). Transfert sous réserve d’accord d’${compagnieNom(m, v)} — hypothèse.` });
  }
  return res;
}

export interface LigneTransaction { id: string; droitId: string; quand: number; date: string; titre: string; sous: string; montant: string }
/** Les mouvements du compte sur la chaîne de détention de tous les droits : achats, drops, reventes, imports, transferts. Du plus récent au plus ancien. */
export function transactions(m: Monde, compteId: string, now: number): LigneTransaction[] {
  const res: LigneTransaction[] = [];
  for (const d of m.droits) {
    const v = volOf(m, d); if (!v) continue; const route = `${v.de} → ${v.vers}`, cie = compagnieNom(m, v);
    const tx = d.chaine.filter((x) => TRANSACTIONS.includes(x.type));
    tx.forEach((x, i) => {
      const entre = x.vers === compteId, sorti = x.de === compteId; if (!entre && !sorti) return;
      let titre = '', sous = `${route} · ${cie}`, montant = fmt(x.prix);
      if (x.type === 'achat_neuf') titre = 'Achat neuf'; else if (x.type === 'drop') titre = 'Drop membre obtenu';
      else if (x.type === 'agence') { titre = 'Achat en agence'; sous = `${route} · ${x.de?.startsWith('agence:') ? (m.agences.find((a) => a.id === x.de!.slice(7))?.nom ?? 'agence') : cie}`; }
      else if (x.type === 'import') titre = 'Billet importé';
      else if (x.type === 'revente') { if (entre) { titre = 'Achat en revente'; sous = `${route} · ${i} détenteur${i > 1 ? 's' : ''} avant vous`; } else { titre = 'Revente'; sous = `${route} · billet vendu`; } }
      else if (x.type === 'transfert') { titre = entre ? 'Transfert reçu' : 'Transfert à un proche'; montant = 'Sans vente'; }
      else { titre = 'Rachat par NexG-TT'; sous = `${route} · droit cédé`; }
      res.push({ id: x.id, droitId: d.id, quand: x.quand, date: jourAvecAnnee(x.quand, now), titre, sous, montant });
    });
  }
  return res.sort((a, b) => b.quand - a.quand);
}

export interface CarteCedee { droitId: string; de: string; vers: string; ville: string; enTete: string; date: string; nature: 'revendu' | 'transfere' | 'rachete' | 'voyage'; natureLib: string; prixPaye: number; prixCession?: number; detenteurs: number; /** Le droit est encore dans le portefeuille : on peut l'ouvrir. */ ouvrable: boolean }
/** Billets cédés (revendus, transférés, rachetés) ou voyagés. Un billet cédé n'est plus consultable : il n'appartient plus au compte. */
export function billetsCedesOuVoyages(m: Monde, compteId: string, now: number): CarteCedee[] {
  const res: CarteCedee[] = [];
  for (const d of m.droits) {
    const v = volOf(m, d); if (!v) continue;
    const sortie = [...d.chaine].reverse().find((x) => x.de === compteId && (x.type === 'revente' || x.type === 'transfert' || x.type === 'rachat'));
    const entree = [...d.chaine].reverse().find((x) => x.vers === compteId && TRANSACTIONS.includes(x.type));
    const base = { droitId: d.id, de: v.de, vers: v.vers, ville: aeroport(m, v.vers), enTete: enTete(m, v), date: `${aeroport(m, v.vers)} · ${dateVol(v)}`, detenteurs: d.chaine.filter((x) => TRANSACTIONS.includes(x.type)).length };
    if (d.detenteurId !== compteId && sortie) {
      const nature = sortie.type === 'revente' ? 'revendu' : sortie.type === 'transfert' ? 'transfere' : 'rachete';
      res.push({ ...base, nature, natureLib: nature === 'revendu' ? 'Revendu' : nature === 'transfere' ? 'Transféré' : 'Racheté', prixPaye: entree?.prix ?? 0, prixCession: nature === 'transfere' ? undefined : sortie.prix, ouvrable: false });
    } else if (d.detenteurId === compteId && (d.statut === 'voyage' || (d.statut === 'nomme' && departDe(v.jour, v.heureDepart) <= now))) {
      res.push({ ...base, nature: 'voyage', natureLib: 'Voyagé', prixPaye: d.prixPaye, ouvrable: true });
    }
  }
  return res.sort((a, b) => a.date.localeCompare(b.date));
}

export interface VuePortefeuille {
  agregat: Agregat; titre: string; actifs: CarteDroit[]; revente: CarteDroit[]; bagages: BagageEnVente[]; nbRevente: number; transactions: LigneTransaction[]; cedes: CarteCedee[];
}
/** « 3 droits de voyage actifs », « 1 droit de voyage actif », « Aucun droit de voyage actif ». */
export const titreActifs = (n: number): string => (n === 0 ? 'Aucun droit de voyage actif' : `${n} droit${n > 1 ? 's' : ''} de voyage actif${n > 1 ? 's' : ''}`);
export function vuePortefeuille(m: Monde, compteId: string, now: number): VuePortefeuille {
  const agregat = agregatPortefeuille(m, compteId, now);
  const actifs = droitsActifs(m, compteId, now).map((x) => carteDe(m, x.droit, now)).filter((c): c is CarteDroit => !!c);
  const revente = m.droits.filter((d) => d.detenteurId === compteId && d.statut === 'en_vente' && volOf(m, d) && departDe(volOf(m, d)!.jour, volOf(m, d)!.heureDepart) > now)
    .sort((a, b) => departDe(volOf(m, a)!.jour, volOf(m, a)!.heureDepart) - departDe(volOf(m, b)!.jour, volOf(m, b)!.heureDepart)).map((d) => carteDe(m, d, now)!);
  const bagages = bagagesEnVente(m, compteId, now);
  return { agregat, titre: titreActifs(agregat.nb), actifs, revente, bagages, nbRevente: revente.length + bagages.length, transactions: transactions(m, compteId, now), cedes: billetsCedesOuVoyages(m, compteId, now) };
}
