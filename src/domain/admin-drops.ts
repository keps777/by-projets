// Administration des drops et des agences partenaires : transactions de la console `/admin/drops`. Chaque action est réservée à un compte administrateur et laisse une ligne au journal d'audit.
// Drops : planifier (vol, prix membre < prix équivalent, 1 à 50 places, ouverture future), ouvrir tout de suite, clore, annuler. Agences : vérifier le permis, suspendre / réactiver, ajouter / retirer une offre (plafond = prix équivalent neuf).
// Aucune donnée de voyageur : les membres servis ne sont connus que par leur identifiant pseudonymisé (ACC-…).
import { app, nouvelId, maintenant } from '../data/store.svelte.ts';
import { arrondi, fmt } from '../core/argent.ts';
import { peutEchanger, plafond } from '../core/regles.ts';
import { consigner } from './audit.ts';
import { compteDe } from './compte.ts';
import { dropDe, etatDrop } from './drop.ts';
import { compagnieDe, departDuVol, volDe } from './marche.ts';
import type { Agence, Drop, DropAVenir, OffreAgence, Vol, Zone } from './types.ts';

export type CodeErreurAdmin = 'acteur' | 'drop' | 'agence' | 'vol' | 'offre' | 'etat' | 'controles' | 'motif' | 'validation';
export class ErreurAdmin extends Error { constructor(public code: CodeErreurAdmin, message: string, public champs: Record<string, string> = {}) { super(message); } }
const admin = (acteur: string): string => { if (compteDe(acteur)?.role !== 'admin') throw new ErreurAdmin('acteur', 'Action réservée aux comptes administrateurs.'); return acteur; };

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], p2 = (n: number) => String(n).padStart(2, '0');
/** « 19 oct. 2026 · 18:00 » (heure locale de Montréal dans la démo). */
export const quand = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « Aérolys 812 » : nom de la compagnie et numéro de vol. */
export const libelleVol = (v: Vol): string => `${compagnieDe(v).nom} ${v.numero.replace(/^[A-Z]+\s*/, '')}`;
export const MAX_PLACES = 50;

// ─────────────────────────────── Drops ───────────────────────────────
export interface EntreeDrop { volId: string; prixMembre: number; places: number; ouvre: number; fin: number }
export type ChampDrop = keyof EntreeDrop;
/** Contrôle d'un nouveau drop : renvoie un message par champ fautif (objet vide = valide). */
export function validerDrop(e: EntreeDrop, now: number = maintenant()): Partial<Record<ChampDrop, string>> {
  const r: Partial<Record<ChampDrop, string>> = {}, v = volDe(e.volId);
  if (!v) r.volId = 'Choisissez un vol.';
  if (!Number.isInteger(e.prixMembre) || e.prixMembre <= 0) r.prixMembre = 'Entrez un prix membre en dollars, nombre entier.';
  else if (v && e.prixMembre >= v.prixNeuf) r.prixMembre = `Le prix membre doit être inférieur au prix équivalent (${fmt(v.prixNeuf)}).`;
  if (!Number.isInteger(e.places) || e.places < 1 || e.places > MAX_PLACES) r.places = `Entre 1 et ${MAX_PLACES} places.`;
  if (!Number.isFinite(e.ouvre)) r.ouvre = 'Indiquez la date et l’heure d’ouverture.'; else if (e.ouvre <= now) r.ouvre = 'L’ouverture doit être dans le futur.';
  if (!Number.isFinite(e.fin)) r.fin = 'Indiquez la date et l’heure de fin.';
  else if (Number.isFinite(e.ouvre) && e.fin <= e.ouvre) r.fin = 'La fin doit suivre l’ouverture.';
  else if (v && !peutEchanger(departDuVol(v), e.fin)) r.fin = 'La fin doit précéder l’échéance du vol (J-1).';
  return r;
}
export const prochainNumeroDrop = (): number => app.monde.drops.reduce((m, d) => Math.max(m, d.n), 0) + 1;
const zoneDe = (v: Vol): Zone | 'Monde' => app.monde.aeroports.find((a) => a.code === v.vers)?.zone ?? 'Monde';
const refDrop = (d: Pick<Drop, 'n'>): string => `Drop N° ${d.n}`;
const trajet = (v: Vol): string => `${v.de} → ${v.vers}`;

/** Planifie un drop : il rejoint les drops (invisible du marché jusqu'à son ouverture) et s'annonce aux membres dans « prochains drops », destination masquée. */
export function creerDrop(acteur: string, e: EntreeDrop): Drop {
  admin(acteur); const champs = validerDrop(e);
  if (Object.keys(champs).length) throw new ErreurAdmin('validation', 'Corrigez les champs signalés.', champs as Record<string, string>);
  const v = volDe(e.volId)!, n = prochainNumeroDrop();
  const d: Drop = { id: `drop-${n}`, n, volId: v.id, prixMembre: e.prixMembre, prixEquivalent: v.prixNeuf, places: e.places, restantes: e.places, ouvre: e.ouvre, fin: e.fin, servis: [] };
  app.monde.drops.push(d); app.monde.dropsAVenir.push({ id: `dv-${d.id}`, ouvre: d.ouvre, zone: zoneDe(v), volId: v.id, alerteIds: [] });
  consigner(acteur, 'Création de drop', refDrop(d), `${trajet(v)} · ${libelleVol(v)} · ${d.places} places · ${fmt(d.prixMembre)} membre (équivalent ${fmt(d.prixEquivalent)}) · ouverture ${quand(d.ouvre)}`, 'info');
  return d;
}
const dropOuErreur = (id: string): Drop => dropDe(id) ?? (() => { throw new ErreurAdmin('drop', 'Ce drop n’existe pas.'); })();
/** Ouvre un drop planifié maintenant (ouverture immédiate). */
export function ouvrirDrop(acteur: string, id: string): Drop {
  admin(acteur); const d = dropOuErreur(id), now = maintenant();
  if (etatDrop(d, now) !== 'avenir') throw new ErreurAdmin('etat', 'Seul un drop planifié peut être ouvert.');
  if (d.fin <= now) throw new ErreurAdmin('etat', 'La fin de ce drop est déjà passée : annulez-le et planifiez-en un autre.');
  const prevue = d.ouvre; d.ouvre = now; app.monde.dropsAVenir = app.monde.dropsAVenir.filter((x) => x.id !== `dv-${d.id}`);
  consigner(acteur, 'Ouverture de drop', refDrop(d), `Ouverture immédiate (planifiée ${quand(prevue)}) · ${d.places} places`, 'attention'); return d;
}
/** Clôt un drop en direct : plus aucune place n'est attribuée ; les places déjà attribuées restent acquises. */
export function cloreDrop(acteur: string, id: string): Drop {
  admin(acteur); const d = dropOuErreur(id), now = maintenant();
  if (etatDrop(d, now) !== 'direct') throw new ErreurAdmin('etat', 'Seul un drop en direct peut être clos.');
  d.fin = now; consigner(acteur, 'Clôture de drop', refDrop(d), `${d.places - d.restantes} place(s) attribuée(s), ${d.restantes} restante(s) non attribuée(s)`, 'attention'); return d;
}
/** Annule un drop pas encore ouvert (ou une annonce de drop) ; un drop ouvert ne s'annule pas, il se clôt. */
export function annulerDrop(acteur: string, id: string): void {
  admin(acteur); const d = dropDe(id), now = maintenant();
  if (d) {
    if (etatDrop(d, now) !== 'avenir') throw new ErreurAdmin('etat', 'Un drop ouvert ne s’annule pas : clôturez-le.');
    app.monde.drops = app.monde.drops.filter((x) => x.id !== id); app.monde.dropsAVenir = app.monde.dropsAVenir.filter((x) => x.id !== `dv-${id}`);
    consigner(acteur, 'Annulation de drop', refDrop(d), `Drop planifié le ${quand(d.ouvre)} annulé avant son ouverture`, 'attention'); return;
  }
  const a = app.monde.dropsAVenir.find((x) => x.id === id); if (!a) throw new ErreurAdmin('drop', 'Ce drop n’existe pas.');
  app.monde.dropsAVenir = app.monde.dropsAVenir.filter((x) => x.id !== id);
  consigner(acteur, 'Annulation de drop', `Drop annoncé (${a.zone})`, `Annonce du ${quand(a.ouvre)} retirée ; ${a.alerteIds.length} alerte(s) membre supprimée(s)`, 'attention');
}

export type StatutLigne = 'planifie' | 'ouvert' | 'epuise' | 'termine';
export interface LigneDrop { id: string; /** Annonce sans lot réservé (« prochain drop » du seed) : ni places ni prix. */ annonce: boolean; n?: number; zone: Zone | 'Monde'; volId?: string; trajet: string; vol: string; ouvre: number; fin?: number; places?: number; restantes?: number; prixMembre?: number; prixEquivalent?: number; statut: StatutLigne; servis: string[] }
const ligneVol = (volId?: string) => { const v = volId ? volDe(volId) : undefined; return { trajet: v ? trajet(v) : 'Destination masquée', vol: v ? `${libelleVol(v)} · ${Number(v.jour.slice(8))} ${MOIS[Number(v.jour.slice(5, 7)) - 1]} ${v.jour.slice(0, 4)}` : 'Vol à confirmer' }; };
/** Tous les drops pour la console, du plus récent au plus ancien : drops réels (planifiés, ouverts, épuisés, terminés) puis annonces sans lot. */
export function lignesDrops(now: number = maintenant()): LigneDrop[] {
  const ST = { avenir: 'planifie', direct: 'ouvert', epuise: 'epuise', termine: 'termine' } as const;
  const reels: LigneDrop[] = app.monde.drops.map((d) => { const v = volDe(d.volId); return { id: d.id, annonce: false, n: d.n, zone: v ? zoneDe(v) : 'Monde', volId: d.volId, ...ligneVol(d.volId), ouvre: d.ouvre, fin: d.fin, places: d.places, restantes: d.restantes, prixMembre: d.prixMembre, prixEquivalent: d.prixEquivalent, statut: ST[etatDrop(d, now)], servis: d.servis }; });
  const annonces: LigneDrop[] = app.monde.dropsAVenir.filter((a: DropAVenir) => !app.monde.drops.some((d) => `dv-${d.id}` === a.id)).map((a) => ({ id: a.id, annonce: true, zone: a.zone, volId: a.volId, ...ligneVol(a.volId), ouvre: a.ouvre, statut: 'planifie' as const, servis: [] }));
  return [...reels, ...annonces].sort((a, b) => b.ouvre - a.ouvre);
}

// ─────────────────────────────── Agences ───────────────────────────────
export type StatutAgence = 'verifiee' | 'en_verification' | 'suspendue';
export const agenceDe = (id: string): Agence | undefined => app.monde.agences.find((a) => a.id === id);
export const statutAgence = (a: Pick<Agence, 'permisVerifie' | 'suspendue'>): StatutAgence => (a.suspendue ? 'suspendue' : a.permisVerifie ? 'verifiee' : 'en_verification');
export const offresDeAgence = (agenceId: string): OffreAgence[] => app.monde.offresAgence.filter((o) => o.agenceId === agenceId);
/** Offres réellement proposées au public : aucune tant que l'agence est suspendue. */
export const offresPubliees = (a: Agence): number => (a.suspendue ? 0 : offresDeAgence(a.id).length);
/** Numéro de permis fictif, stable (démonstration). */
export const permisDe = (a: Agence): string => `n° ${String(Math.max(0, app.monde.agences.findIndex((x) => x.id === a.id))).padStart(6, '0')} (exemple)`;
export const derniereVerification = (a: Agence): number | undefined => app.monde.audit.filter((l) => l.action === 'Vérification d’agence' && l.cible === a.nom).reduce<number | undefined>((m, l) => (m === undefined || l.quand > m ? l.quand : m), undefined);
const agenceOuErreur = (id: string): Agence => agenceDe(id) ?? (() => { throw new ErreurAdmin('agence', 'Cette agence n’existe pas.'); })();
export interface Controles { identite: boolean; permis: boolean; cautionnement: boolean }

/** Approuve la vitrine d'une agence : les trois contrôles doivent être cochés ; le permis devient vérifié. */
export function verifierAgence(acteur: string, id: string, c: Controles): Agence {
  admin(acteur); const a = agenceOuErreur(id);
  if (a.suspendue) throw new ErreurAdmin('etat', 'Cette agence est suspendue : réactivez-la d’abord.');
  if (a.permisVerifie) throw new ErreurAdmin('etat', 'Le permis de cette agence est déjà vérifié.');
  if (!c.identite || !c.permis || !c.cautionnement) throw new ErreurAdmin('controles', 'Cochez les trois contrôles pour approuver la vitrine.');
  a.permisVerifie = true; consigner(acteur, 'Vérification d’agence', a.nom, `Permis ${permisDe(a)} vérifié · identité, permis et cautionnement contrôlés`, 'info'); return a;
}
/** Suspend l'agence : ses offres disparaissent du marché (elles reviennent à la réactivation). Le motif est conservé au journal. */
export function suspendreAgence(acteur: string, id: string, motif: string): Agence {
  admin(acteur); const a = agenceOuErreur(id), m = motif.trim();
  if (a.suspendue) throw new ErreurAdmin('etat', 'Cette agence est déjà suspendue.');
  if (m.length < 3) throw new ErreurAdmin('motif', 'Indiquez le motif.');
  const n = offresDeAgence(a.id).length; a.suspendue = true;
  consigner(acteur, 'Suspension d’agence', a.nom, `Motif : ${m} · ${n} offre(s) retirée(s) du marché`, n > 0 ? 'critique' : 'attention'); return a;
}
export function reactiverAgence(acteur: string, id: string): Agence {
  admin(acteur); const a = agenceOuErreur(id); if (!a.suspendue) throw new ErreurAdmin('etat', 'Cette agence n’est pas suspendue.');
  delete a.suspendue; consigner(acteur, 'Réactivation d’agence', a.nom, `${offresDeAgence(a.id).length} offre(s) de nouveau proposée(s)`, 'attention'); return a;
}
/** Publie une offre d'agence sur un vol : agence vérifiée et active, vol encore échangeable, prix au plus égal au prix équivalent neuf (plafond), une offre par vol et par agence. */
export function ajouterOffreAgence(acteur: string, agenceId: string, volId: string, prix: number, note?: string): OffreAgence {
  admin(acteur); const a = agenceOuErreur(agenceId), v = volDe(volId);
  if (a.suspendue) throw new ErreurAdmin('etat', 'Cette agence est suspendue : aucune offre ne peut être ajoutée.');
  if (!a.permisVerifie) throw new ErreurAdmin('etat', 'Le permis de cette agence n’est pas vérifié : aucune offre ne peut être publiée.');
  if (!v) throw new ErreurAdmin('vol', 'Choisissez un vol.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurAdmin('vol', 'L’échéance de ce vol est passée.');
  if (!Number.isFinite(prix) || prix <= 0) throw new ErreurAdmin('offre', 'Entrez un prix en dollars.');
  if (prix > plafond(v.prixNeuf)) throw new ErreurAdmin('offre', `Le prix est plafonné au prix équivalent neuf (${fmt(v.prixNeuf)}).`);
  if (app.monde.offresAgence.some((o) => o.agenceId === a.id && o.volId === v.id)) throw new ErreurAdmin('offre', 'Cette agence a déjà une offre sur ce vol.');
  const o: OffreAgence = { id: nouvelId('oa'), agenceId: a.id, volId: v.id, prix: arrondi(prix), ...(note?.trim() ? { note: note.trim() } : {}) };
  app.monde.offresAgence.push(o); consigner(acteur, 'Ajout d’une offre d’agence', a.nom, `Vol ${v.numero} · ${trajet(v)} · ${fmt(o.prix)} (plafond ${fmt(v.prixNeuf)})`, 'info'); return o;
}
export function retirerOffreAgence(acteur: string, offreId: string): void {
  admin(acteur); const o = app.monde.offresAgence.find((x) => x.id === offreId); if (!o) throw new ErreurAdmin('offre', 'Cette offre n’existe plus.');
  const a = agenceDe(o.agenceId), v = volDe(o.volId); app.monde.offresAgence = app.monde.offresAgence.filter((x) => x.id !== offreId);
  consigner(acteur, 'Retrait d’une offre d’agence', a?.nom ?? o.agenceId, `Vol ${v?.numero ?? o.volId} · ${v ? trajet(v) : ''} · ${fmt(o.prix)} retirée`.replace(' ·  ·', ' ·'), 'attention');
}
