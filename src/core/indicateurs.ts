// Indicateurs du patron, calculés sur le monde : billets vendus, recettes (billets valides ou scannés), remplissage, écarts de caisse…
// Fonctions pures : elles lisent un `Donnees` (le monde ou un extrait) et ne modifient rien. « Vendu » = valide ou scanné, daté de sa vente (`creeLe`).
import type { Billet, Depart, Ligne, Monde } from '../domain/types.ts';
import { ajouterJours, jourDe, type Jour } from './dates.ts';

export type Donnees = Pick<Monde, 'billets' | 'paiements' | 'departs' | 'lignes' | 'gares' | 'colis' | 'caisses' | 'litiges'>;
export interface Vente { billet: Billet; depart: Depart; ligne: Ligne; jour: Jour; /** Minute du jour de la vente (0 à 1439). */ minute: number; ts: number }
export type Periode = 'jour' | 'semaine' | 'mois';

/** « Yaoundé Mvan », mais « Bafoussam » et « Kribi centre » quand le nom répète déjà la ville. */
export const nomGare = (g: { ville: string; nom: string }) => (g.nom.startsWith(g.ville) ? g.nom : `${g.ville} ${g.nom}`);
export const estVendu = (b: Billet) => b.statut === 'valide' || b.statut === 'scanne';
export const minuteDe = (ts: number) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
export const jourDeTs = (ts: number): Jour => jourDe(new Date(ts));
export const total = (v: Vente[]) => v.reduce((s, x) => s + x.billet.prix, 0);
/** Variation en %, arrondie ; `null` quand il n'y a pas de référence. */
export const variation = (actuel: number, ref: number): number | null => (ref > 0 ? Math.round(((actuel - ref) / ref) * 100) : null);
export const libelleVariation = (p: number | null) => (p === null ? 'pas de référence' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}\u00a0%`);
/** Les `n` derniers jours jusqu'à `jour` inclus, du plus ancien au plus récent. */
export const derniersJours = (jour: Jour, n: number): Jour[] => Array.from({ length: n }, (_, i) => ajouterJours(jour, i - n + 1));

/** Tous les billets vendus (valides ou scannés) avec leur départ et leur ligne ; filtre optionnel sur la compagnie de la ligne. */
export function ventes(d: Pick<Donnees, 'billets' | 'departs' | 'lignes'>, compagnieId?: string): Vente[] {
  const departs = new Map(d.departs.map((x) => [x.id, x])), lignes = new Map(d.lignes.map((x) => [x.id, x])), res: Vente[] = [];
  for (const billet of d.billets) {
    if (!estVendu(billet)) continue;
    const depart = departs.get(billet.departId), ligne = depart && lignes.get(depart.ligneId);
    if (!depart || !ligne || (compagnieId && ligne.compagnieId !== compagnieId)) continue;
    res.push({ billet, depart, ligne, jour: jourDeTs(billet.creeLe), minute: minuteDe(billet.creeLe), ts: billet.creeLe });
  }
  return res;
}
/** Ventes d'un ensemble de jours ; sur le dernier jour de la liste, seulement jusqu'à `jusquaMin` (comparaison « à la même heure »). */
export function fenetre(v: Vente[], jours: Jour[], jusquaMin = 1440): Vente[] {
  const set = new Set(jours), dernier = jours[jours.length - 1];
  return v.filter((x) => set.has(x.jour) && (x.jour !== dernier || x.minute <= jusquaMin));
}
export const decaler = (jours: Jour[], n: number) => jours.map((j) => ajouterJours(j, n));

/** Entrées regroupées par clé, triées par recette décroissante. */
export function parCle(v: Vente[], cle: (x: Vente) => string): { cle: string; recette: number; billets: number }[] {
  const m = new Map<string, { cle: string; recette: number; billets: number }>();
  for (const x of v) { const k = cle(x), e = m.get(k) ?? { cle: k, recette: 0, billets: 0 }; e.recette += x.billet.prix; e.billets++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.recette - a.recette);
}
export const parGare = (v: Vente[]) => parCle(v, (x) => x.ligne.gareDe);
export const parLigne = (v: Vente[]) => parCle(v, (x) => x.ligne.id);
export const parCompagnie = (v: Vente[]) => parCle(v, (x) => x.ligne.compagnieId);

/** Remplissage (0 à 1) de chaque départ : mêmes règles que `remplissage()` du domaine (sièges pris ailleurs + billets actifs). */
export function remplissages(d: Pick<Donnees, 'billets' | 'paiements' | 'departs'>, now: number): Map<string, number> {
  const expire = new Map(d.paiements.map((p) => [p.id, p.expireLe ?? 0])), actifs = new Map<string, Billet[]>();
  for (const b of d.billets) {
    if (b.statut === 'valide' || b.statut === 'scanne' || (b.statut === 'attente_paiement' && (expire.get(b.paiementId) ?? 0) > now)) (actifs.get(b.departId) ?? actifs.set(b.departId, []).get(b.departId)!).push(b);
  }
  const res = new Map<string, number>();
  for (const dep of d.departs) {
    const bs = actifs.get(dep.id) ?? [], pris = new Set(dep.prisAilleurs);
    for (const b of bs) if (b.siege) pris.add(b.siege);
    const libres = Math.max(0, dep.capacite - pris.size - bs.filter((b) => !b.siege).length);
    res.set(dep.id, dep.capacite > 0 ? 1 - libres / dep.capacite : 0);
  }
  return res;
}
export const moyenne = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export interface StatGare { gareId: string; recette: number; billets: number; ref: number; variation: number | null; bus: number; remplissage: number; ecart: number }
export interface Tableau {
  jour: Jour; recette: number; billets: number; ref: number; variation: number | null; bus: number; remplissage: number; gares: StatGare[];
  colis: { envoyes: number; chiffre: number }; retards: number; annules: number; ecart: number; litigesOuverts: number; caissesOuvertes: number;
}
/** Gares d'une compagnie : celles d'où partent ses lignes, plus celles où elle a du personnel. */
export function garesDe(d: Pick<Donnees, 'lignes' | 'gares'>, personnes: { gareId?: string; compagnieId?: string }[], compagnieId: string): string[] {
  const ids = new Set<string>();
  for (const l of d.lignes) if (l.compagnieId === compagnieId) ids.add(l.gareDe);
  for (const p of personnes) if (p.compagnieId === compagnieId && p.gareId) ids.add(p.gareId);
  return d.gares.map((g) => g.id).filter((id) => ids.has(id));
}
/** Écart de caisse (somme) des caisses clôturées un jour donné, par gare. */
export function ecartsDuJour(d: Pick<Donnees, 'caisses'>, jour: Jour): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of d.caisses) if ((c.statut === 'fermee' || c.statut === 'validee') && c.ecart !== undefined && jourDeTs(c.ouvertA) === jour) m.set(c.gareId, (m.get(c.gareId) ?? 0) + c.ecart);
  return m;
}
/** Tableau de bord du jour : recette et billets vendus aujourd'hui, comparés au même jour de la semaine passée à la même heure. */
export function tableau(d: Donnees, o: { jour: Jour; now: number; compagnieId?: string }): Tableau {
  const v = ventes(d, o.compagnieId), min = minuteDe(o.now), aujourd = fenetre(v, [o.jour], min), hier7 = fenetre(v, [ajouterJours(o.jour, -7)], min);
  const lignes = new Map(d.lignes.map((l) => [l.id, l])), rempl = remplissages(d, o.now);
  const deLaCompagnie = (dep: Depart) => !o.compagnieId || lignes.get(dep.ligneId)?.compagnieId === o.compagnieId;
  const departs = d.departs.filter((x) => x.jour === o.jour && deLaCompagnie(x));
  const actifs = departs.filter((x) => x.statut !== 'annule'), ecarts = ecartsDuJour(d, o.jour);
  const ids = new Set<string>(); for (const x of departs) ids.add(lignes.get(x.ligneId)?.gareDe ?? '');
  for (const x of v) ids.add(x.ligne.gareDe);
  const gares: StatGare[] = [...ids].filter(Boolean).map((gareId) => {
    const a = aujourd.filter((x) => x.ligne.gareDe === gareId), r = hier7.filter((x) => x.ligne.gareDe === gareId), bus = actifs.filter((x) => lignes.get(x.ligneId)?.gareDe === gareId);
    return { gareId, recette: total(a), billets: a.length, ref: total(r), variation: variation(total(a), total(r)), bus: bus.length, remplissage: moyenne(bus.map((x) => rempl.get(x.id) ?? 0)), ecart: ecarts.get(gareId) ?? 0 };
  }).sort((a, b) => b.recette - a.recette);
  const colisDuJour = d.colis.filter((c) => c.statut !== 'annule' && jourDeTs(c.etapes[0]?.ts ?? 0) === o.jour);
  return {
    jour: o.jour, recette: total(aujourd), billets: aujourd.length, ref: total(hier7), variation: variation(total(aujourd), total(hier7)), bus: actifs.length,
    remplissage: moyenne(actifs.map((x) => rempl.get(x.id) ?? 0)), gares, colis: { envoyes: colisDuJour.length, chiffre: colisDuJour.reduce((s, c) => s + c.prix, 0) },
    retards: departs.filter((x) => x.retardMin > 0 && x.statut !== 'annule').length, annules: departs.filter((x) => x.statut === 'annule').length,
    ecart: [...ecarts.values()].reduce((s, e) => s + e, 0), litigesOuverts: d.litiges.filter((l) => l.statut !== 'resolu').length, caissesOuvertes: d.caisses.filter((c) => c.statut === 'ouverte').length
  };
}
