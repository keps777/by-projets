// Lecture seule du magasin : transforme `app` et les tranches des autres fonctionnalités en `EntreeLocale` pour core/pilotage.ts.
// Aucune tranche n'est créée ici (lecture directe de `app.tranches.<clé>`, tolérante si elle est absente ou incomplète) : sûr dans un `$derived`.
import type { ActiviteLue, CoffreLu, EntreeLocale, FactureLue } from '../../core/pilotage.ts';
import { app } from '../../data/store.svelte.ts';

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === 'object' ? (x as Obj) : undefined);
const tab = (x: unknown): Obj[] => (Array.isArray(x) ? x.filter((y): y is Obj => !!obj(y)) : []);
const nb = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const tr = (cle: string) => obj(app.tranches[cle]);

export const SOURCES: readonly { cle: string; libelle: string }[] = [
  { cle: 'sante', libelle: 'Santé' }, { cle: 'ecole', libelle: 'École' }, { cle: 'coffres', libelle: 'Coffres' }, { cle: 'auto', libelle: 'Auto' }, { cle: 'logement', libelle: 'Logement' },
  { cle: 'entreprise', libelle: 'Entreprise' }, { cle: 'diaspora', libelle: 'Diaspora' }, { cle: 'commerce', libelle: 'Commerce' }, { cle: 'protection', libelle: 'Protection' }, { cle: 'energie', libelle: 'Énergie' }
];
/** Tranches présentes dans le magasin (une tranche est créée quand le membre ouvre la fonctionnalité). */
export const sourcesPresentes = () => SOURCES.map((s) => ({ ...s, presente: !!tr(s.cle) }));

export function lireFactures(): FactureLue[] {
  return tab(tr('sante')?.factures).map((f) => ({
    statut: String(f.statut), date: String(f.date ?? ''), echeance: String(f.echeance ?? ''), total: nb(f.total), assureMe: nb(f.assureMe), partPatient: nb(f.partPatient),
    aTemps: obj(f.paiement) && typeof obj(f.paiement)!.aTemps === 'boolean' ? (obj(f.paiement)!.aTemps as boolean) : undefined
  }));
}
export function lireCoffres(): CoffreLu[] {
  return tab(tr('coffres')?.coffres).map((c) => ({ epargne: nb(c.epargne), objectif: nb(c.objectif), mensuel: nb(c.mensuel), auto: c.auto === true }));
}
export function lireActivite(): ActiviteLue[] {
  const r: ActiviteLue[] = [];
  const e = tr('entreprise'), ent = obj(e?.entreprise);
  if (ent && ent.statut === 'valide') {
    const retenus = tab(e?.salaries).filter((s) => s.statut !== 'invite' && nb(s.credit) + nb(s.coffre) > 0);
    r.push({ cle: 'employeurs', operations: retenus.length, volume: retenus.reduce((t, s) => t + nb(s.credit) + nb(s.coffre), 0) });
  }
  for (const p of tab(tr('ecole')?.paiements)) r.push({ cle: 'ecoles', operations: 1, volume: nb(p.montant), ts: nb(p.ts) });
  for (const f of tab(tr('sante')?.factures)) if (f.statut !== 'brouillon') r.push({ cle: 'hopitaux', operations: 1, volume: nb(f.total), ts: Date.parse(`${String(f.date)}T12:00:00`) || undefined });
  for (const d of tab(tr('auto')?.dossiers)) if (nb(d.signeLe) > 0) r.push({ cle: 'concessions', operations: 1, volume: nb(d.financement), ts: nb(d.signeLe) });
  for (const x of tab(tr('commerce')?.encaissements)) r.push({ cle: 'commerces', operations: 1, volume: nb(x.montant), ts: nb(x.ts) });
  for (const p of tab(tr('energie')?.plans)) r.push({ cle: 'autres', operations: 1, volume: nb(p.prix), ts: nb(p.ts) });
  for (const p of tab(tr('diaspora')?.paiements)) r.push({ cle: 'autres', operations: 1, volume: nb(p.montantFcfa), ts: nb(p.debut) });
  for (const s of tab(tr('protection')?.sinistres)) r.push({ cle: 'autres', operations: 1, volume: nb(s.versementPrevu), ts: nb(s.ts) });
  return r;
}

/** Instantané en lecture seule de ce que le pilotage agrège pour le compte local. */
export function lireEntree(): EntreeLocale {
  const c = app.compte;
  return {
    compte: c ? { salaireNet: c.salaireNet, cree: c.cree } : null,
    credits: app.credits.map((x) => ({ produit: x.produit, capital: x.capital, mensualite: x.mensualite, duree: x.duree, payees: x.payees, statut: x.statut })),
    mouvements: app.mouvements.map((m) => ({ ts: m.ts, titre: m.titre, montant: m.montant, categorie: m.categorie })),
    notifications: app.notifications.map((n) => ({ titre: n.titre, sous: n.sous })),
    score: c ? app.score.valeur : null,
    factures: lireFactures(), coffres: lireCoffres(), activite: lireActivite()
  };
}
