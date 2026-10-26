// Alertes de prix et de drops : « prévenez-moi à ce prix ou moins ». Le monde garde l'essentiel (`Alerte`) ; types d'offres, dates et canaux vivent dans la tranche `alertes`,
// avec l'historique des alertes déclenchées. Rien n'est réellement envoyé : un déclenchement crée une notification dans l'application.
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { fmt } from '../../core/argent.ts';
import { peutEchanger } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { departDuVol, droitDe, offresDuVol } from '../../domain/marche.ts';
import type { Alerte, Zone } from '../../domain/types.ts';

export type TypeOffreAlerte = 'drop' | 'revente' | 'neuf';
export type Canal = 'notification' | 'courriel';
export const TYPES_OFFRE: { id: TypeOffreAlerte; label: string }[] = [{ id: 'drop', label: 'Drops' }, { id: 'revente', label: 'Revente' }, { id: 'neuf', label: 'Neuf' }];
export const CANAUX: { id: Canal; label: string }[] = [{ id: 'notification', label: 'Notification' }, { id: 'courriel', label: 'Courriel' }];
export const ZONES: Zone[] = ['Europe', 'Caraïbes', 'Asie', 'Amériques', 'Océanie', 'Afrique'];
export const PARTOUT = 'Partout';
export const BUDGET_MIN = 100, BUDGET_MAX = 2000, BUDGET_PAS = 10;
export interface MetaAlerte { types: TypeOffreAlerte[]; flexible: boolean; date?: string; canaux: Canal[] }
export interface Declenchement { id: string; alerteId: string; compteId: string; quand: number; offreId: string; volId: string; prix: number; titre: string; sous: string }
interface EtatAlertes { meta: Record<string, MetaAlerte>; historique: Declenchement[]; intention: boolean }
const DEFAUT: MetaAlerte = { types: ['drop', 'revente', 'neuf'], flexible: true, canaux: ['notification'] };
/** La tranche (créée à la première lecture hors `$derived`, sinon une valeur par défaut non enregistrée). */
export const etat = (): EtatAlertes => tranche<EtatAlertes>('alertes', () => ({ meta: {}, historique: [], intention: true }));
export const metaDe = (a: Alerte): MetaAlerte => etat().meta[a.id] ?? DEFAUT;
export const alertesDe = (compteId: string): Alerte[] => app.monde.alertes.filter((a) => a.compteId === compteId);
export const historiqueDe = (compteId: string): Declenchement[] => etat().historique.filter((h) => h.compteId === compteId).sort((a, b) => b.quand - a.quand);
export const libelleActives = (n: number): string => (n === 0 ? 'Aucune active' : n === 1 ? '1 active' : `${n} actives`);
const lisse = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Reconnaît un aéroport : « Montréal (YUL) », « yul », « paris ». */
export function trouverAeroport(texte: string): string | undefined {
  const t = lisse(texte), m = /\(([a-z]{3})\)/.exec(t), code = (m ? m[1] : t).toUpperCase();
  return app.monde.aeroports.find((a) => a.code === code || lisse(a.ville) === t || lisse(`${a.ville} (${a.code})`) === t)?.code;
}
/** Destination : « Partout », un aéroport ou une zone (« Europe »). */
export function trouverDestination(texte: string): string | undefined {
  const t = lisse(texte); if (t === lisse(PARTOUT)) return PARTOUT;
  return ZONES.find((z) => lisse(z) === t) ?? trouverAeroport(texte);
}
export const estZone = (v: string): v is Zone => (ZONES as string[]).includes(v);
export const villeDe = (code: string): string => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;

export interface Brouillon { depart: string; destination: string; budget: number; types: TypeOffreAlerte[]; flexible: boolean; date: string; canaux: Canal[] }
export type ErreursAlerte = Partial<Record<'depart' | 'destination' | 'budget' | 'types' | 'canaux' | 'date', string>>;
export function validerAlerte(b: Brouillon, pass: boolean): ErreursAlerte {
  const e: ErreursAlerte = {}, de = trouverAeroport(b.depart), vers = trouverDestination(b.destination);
  if (!de) e.depart = 'Choisissez un aéroport de départ connu.';
  if (!vers) e.destination = 'Choisissez « Partout », une zone ou un aéroport connu.'; else if (vers === de) e.destination = 'La destination doit différer du départ.';
  if (!Number.isFinite(b.budget) || b.budget <= 0 || b.budget > 10_000) e.budget = 'Indiquez un budget entre 1 $ et 10 000 $.';
  if (!b.types.length) e.types = 'Choisissez au moins un type d’offre.'; else if (b.types.length === 1 && b.types[0] === 'drop' && !pass) e.types = 'Les alertes de drops sont réservées aux membres du Pass NexG.';
  if (!b.canaux.length) e.canaux = 'Choisissez au moins un canal.';
  if (!b.flexible && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) e.date = 'Choisissez une date de départ.';
  return e;
}
/** Types réellement actifs : sans Pass, les drops sont écartés. */
export const typesEffectifs = (types: TypeOffreAlerte[], pass: boolean): TypeOffreAlerte[] => (pass ? types : types.filter((t) => t !== 'drop'));
export const titreAlerte = (a: Alerte, m: MetaAlerte): string => (estZone(a.vers) && m.types.length === 1 && m.types[0] === 'drop' ? `Drops ${a.vers}` : `${a.de} → ${a.vers}`);
export function sousTitreAlerte(a: Alerte, m: MetaAlerte): string {
  if (estZone(a.vers) && m.types.length === 1 && m.types[0] === 'drop') return `Au départ de ${villeDe(a.de)} · à l’ouverture`;
  const t = m.types.length === 3 ? 'Tous types d’offres' : m.types.map((x) => ({ drop: 'En drop', revente: 'En revente', neuf: 'En neuf' })[x]).join(', ');
  return `${t} · ≤ ${fmt(a.prixMax)}`;
}
export type ResultatCreation = { ok: true; alerte: Alerte; declenchees: number } | { ok: false; erreurs: ErreursAlerte };
export function creerAlerte(compteId: string, b: Brouillon): ResultatCreation {
  const c = compteDe(compteId); if (!c) return { ok: false, erreurs: { destination: 'Connectez-vous pour créer une alerte.' } };
  const erreurs = validerAlerte(b, c.pass.actif); if (Object.keys(erreurs).length) return { ok: false, erreurs };
  const alerte: Alerte = { id: nouvelId('al'), compteId, de: trouverAeroport(b.depart)!, vers: trouverDestination(b.destination)!, prixMax: Math.round(b.budget), actif: true, creeLe: maintenant() };
  app.monde.alertes.push(alerte);
  etat().meta[alerte.id] = { types: [...b.types], flexible: b.flexible, ...(b.flexible ? {} : { date: b.date }), canaux: [...b.canaux] };
  return { ok: true, alerte, declenchees: evaluerAlertes(compteId).length };
}
export function basculerAlerte(id: string): boolean { const a = app.monde.alertes.find((x) => x.id === id); if (!a) return false; a.actif = !a.actif; if (a.actif) evaluerAlertes(a.compteId); return true; }
export function supprimerAlerte(id: string): boolean { const i = app.monde.alertes.findIndex((x) => x.id === id); if (i < 0) return false; app.monde.alertes.splice(i, 1); delete etat().meta[id]; return true; }
export function basculerIntention(): boolean { const e = etat(); e.intention = !e.intention; return e.intention; }

export interface Correspondance { offreId: string; volId: string; prix: number; type: TypeOffreAlerte }
/** Offres du marché qui répondent à une alerte : bon départ, bonne destination (aéroport, zone ou partout), type choisi, prix ≤ plafond, vol encore échangeable ; jamais ses propres billets ni un drop masqué. */
export function correspondances(a: Alerte, m: MetaAlerte, pass: boolean, now: number): Correspondance[] {
  const sortie: Correspondance[] = [], types = typesEffectifs(m.types, pass);
  for (const v of app.monde.vols) {
    if (v.de !== a.de || !peutEchanger(departDuVol(v), now)) continue;
    if (a.vers !== PARTOUT && a.vers !== v.vers && !(estZone(a.vers) && app.monde.aeroports.find((x) => x.code === v.vers)?.zone === a.vers)) continue;
    if (!m.flexible && m.date !== v.jour) continue;
    for (const o of offresDuVol(v.id, pass)) {
      if (o.masquee || !types.includes(o.type as TypeOffreAlerte) || o.prix > a.prixMax) continue;
      if (o.droitId && droitDe(o.droitId)?.detenteurId === a.compteId) continue;
      sortie.push({ offreId: o.id, volId: v.id, prix: o.prix, type: o.type as TypeOffreAlerte });
    }
  }
  return sortie.sort((x, y) => x.prix - y.prix);
}
const LIB_TYPE: Record<TypeOffreAlerte, string> = { drop: 'un drop', revente: 'une revente', neuf: 'un billet neuf' };
/** Déclenche les alertes actives du compte : une ligne d'historique et une notification par offre nouvelle (jamais deux fois la même). Renvoie les déclenchements créés. */
export function evaluerAlertes(compteId: string, now: number = maintenant()): Declenchement[] {
  const c = compteDe(compteId); if (!c) return [];
  const e = etat(), neufs: Declenchement[] = [];
  for (const a of alertesDe(compteId)) {
    if (!a.actif) continue;
    for (const k of correspondances(a, metaDe(a), c.pass.actif, now)) {
      if (e.historique.some((h) => h.alerteId === a.id && h.offreId === k.offreId)) continue;
      const v = app.monde.vols.find((x) => x.id === k.volId)!;
      const d: Declenchement = { id: nouvelId('dec'), alerteId: a.id, compteId, quand: now, offreId: k.offreId, volId: k.volId, prix: k.prix, titre: `${v.de} → ${v.vers} : ${LIB_TYPE[k.type]} à ${fmt(k.prix)}`, sous: `Sous votre plafond d’alerte de ${fmt(a.prixMax)}.` };
      e.historique.unshift(d); neufs.push(d);
      notifier(compteId, { type: k.type === 'drop' ? 'drop' : 'prix', titre: d.titre, sous: d.sous, essentielle: false, lien: k.type === 'drop' ? '/drops' : `/offre/${k.offreId}` });
    }
  }
  e.historique.splice(60); return neufs;
}
