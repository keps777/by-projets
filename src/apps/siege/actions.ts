// Transactions du siège sur le monde simulé : configuration des lignes, de l'équipe, des tarifs et règles.
// Tout passe par `app.monde` et les primitives de `domain/actions.ts` (annulation d'un départ = remboursement des billets).
import { ajouterJours } from '../../core/dates.ts';
import { app, aujourdhui, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { annulerDepart, billetsDuDepart, caisseOuverte, consigner, departEnMs, notifier, personne } from '../../domain/actions.ts';
import type { Bus, ClasseBus, Depart, Ligne, Personne, Role } from '../../domain/types.ts';
import { etatSiege, lireSiege, optionsParDefaut, type OptionsLigne } from './etat.ts';

export class ErreurValidation extends Error {
  constructor(public champs: Record<string, string>) { super(Object.values(champs)[0] ?? 'invalide'); }
}
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const CAPACITE: Record<ClasseBus, number> = { Classique: 50, VIP: 30 };
export const PRIX_MIN = 1000, PRIX_MAX = 100_000;

// ------------------------------------------------------------------ lignes
export const ligneParId = (id: string | null | undefined): Ligne | undefined => (id ? app.monde.lignes.find((l) => l.id === id) : undefined);
/** Une « liaison » = les lignes (Classique, VIP) d'une compagnie entre les deux mêmes gares. */
export function groupeLigne(id: string): Ligne[] {
  const l = ligneParId(id); if (!l) return [];
  return app.monde.lignes.filter((x) => x.compagnieId === l.compagnieId && x.de === l.de && x.vers === l.vers && x.gareDe === l.gareDe && x.gareVers === l.gareVers).sort((a, b) => a.classe.localeCompare(b.classe));
}
const idDepart = (jour: string, l: Ligne, h: string) => `d-${jour}-${l.id.slice(2)}-${h.replace(':', '')}`;
/** Départs encore à venir d'une ligne : demain et après, plus ceux d'aujourd'hui pas encore partis. */
export function departsFuturs(ligneId: string): Depart[] {
  const auj = aujourdhui();
  return app.monde.departs.filter((d) => d.ligneId === ligneId && (d.jour > auj || (d.jour === auj && d.statut === 'prevu' && departEnMs(d) > maintenant())));
}
export interface PatchLigne { prix?: number; actif?: boolean; horaires?: string[]; options?: OptionsLigne }
/** Options de la ligne (jours de circulation, arrêts vendables, colis). */
export const optionsLigne = (id: string): OptionsLigne => lireSiege().optionsLignes[id] ?? optionsParDefaut();
const indexJour = (jour: string) => (new Date(`${jour}T12:00:00`).getDay() + 6) % 7;
export interface BilanLigne { crees: number; restaures: number; annules: number; rembourses: number; prixMisAJour: number }
export function validerLigne(patch: PatchLigne): Record<string, string> {
  const e: Record<string, string> = {};
  if (patch.prix !== undefined && (!Number.isInteger(patch.prix) || patch.prix < PRIX_MIN || patch.prix > PRIX_MAX || patch.prix % 50 !== 0)) e.prix = `Prix entre ${PRIX_MIN.toLocaleString('fr-FR')} et ${PRIX_MAX.toLocaleString('fr-FR')} F, par pas de 50 F.`;
  if (patch.horaires) {
    if (patch.horaires.some((h) => !HEURE.test(h))) e.horaires = 'Heure invalide (format HH:MM).';
    else if (new Set(patch.horaires).size !== patch.horaires.length) e.horaires = 'Deux départs à la même heure sur cette ligne.';
    else if (patch.horaires.length > 12) e.horaires = '12 départs par jour au maximum.';
  }
  if (patch.options && !patch.options.jours.some(Boolean)) e.jours = 'Choisis au moins un jour de circulation.';
  return e;
}
function busPour(l: Ligne, rang: number): string {
  const n = 1 + (rang % 2), id = `bus-${l.compagnieId}-${l.classe[0]}${n}`;
  if (!app.monde.bus.some((b) => b.id === id)) { const b: Bus = { id, immat: `${l.compagnieId}-${l.classe === 'VIP' ? '7' : '3'}${n}${n}1-CE`, compagnieId: l.compagnieId, classe: l.classe, capacite: CAPACITE[l.classe] }; app.monde.bus.push(b); }
  return id;
}
/** Ferme un départ : annulation avec remboursement des billets valides, et réservations en attente libérées. */
function fermerDepart(d: Depart, acteurId?: string): number {
  const actifs = billetsDuDepart(d.id).length;
  if (actifs === 0) { d.statut = 'annule'; return 0; }
  const n = annulerDepart(d.id, acteurId);
  for (const b of app.monde.billets.filter((x) => x.departId === d.id && x.statut === 'attente_paiement')) {
    b.statut = 'expire'; const p = app.monde.paiements.find((x) => x.id === b.paiementId); if (p?.statut === 'attente') { p.statut = 'refuse'; p.motif = 'Départ annulé'; }
  }
  return n;
}
/** Modifie une ligne et les départs à venir (prix, horaires, activation). Valide d'abord, puis applique. */
export function modifierLigne(ligneId: string, patch: PatchLigne, acteurId?: string): BilanLigne {
  const l = ligneParId(ligneId); if (!l) throw new Error('ligne_inconnue');
  const err = validerLigne(patch); if (Object.keys(err).length) throw new ErreurValidation(err);
  const bilan: BilanLigne = { crees: 0, restaures: 0, annules: 0, rembourses: 0, prixMisAJour: 0 }, auj = aujourdhui(), notes: string[] = [];
  if (patch.horaires) {
    const nouveaux = [...patch.horaires].sort(), retires = l.horaires.filter((h) => !nouveaux.includes(h)), ajoutes = nouveaux.filter((h) => !l.horaires.includes(h));
    for (const d of departsFuturs(l.id)) if (retires.includes(d.heure) && d.statut !== 'annule') { bilan.rembourses += fermerDepart(d, acteurId); bilan.annules++; }
    l.horaires = nouveaux;
    if (ajoutes.length) {
      const dernier = app.monde.departs.reduce((m, d) => (d.jour > m ? d.jour : m), auj);
      for (let j = auj; j <= dernier; j = ajouterJours(j, 1)) for (const h of ajoutes) {
        const id = idDepart(j, l, h), existant = app.monde.departs.find((d) => d.id === id);
        if (j === auj && new Date(`${j}T${h}:00`).getTime() < maintenant() + 30 * 60_000) continue;
        if (!(patch.options?.jours ?? optionsLigne(l.id).jours)[indexJour(j)]) continue;
        if (existant) { if (existant.statut === 'annule') { Object.assign(existant, { statut: 'prevu', retardMin: 0, avancement: 0, prix: patch.prix ?? l.prix }); bilan.restaures++; } continue; }
        app.monde.departs.push({ id, ligneId: l.id, jour: j, heure: h, busId: busPour(l, nouveaux.indexOf(h)), capacite: CAPACITE[l.classe], prix: patch.prix ?? l.prix, statut: 'prevu', retardMin: 0, avancement: 0, prisAilleurs: [] });
        bilan.crees++;
      }
    }
    if (retires.length || ajoutes.length) notes.push(`horaires ${nouveaux.join(', ') || 'aucun'}`);
  }
  if (patch.prix !== undefined && patch.prix !== l.prix) {
    for (const d of departsFuturs(l.id)) if (d.statut !== 'annule' && d.prix !== patch.prix) { d.prix = patch.prix; bilan.prixMisAJour++; }
    notes.push(`prix ${l.prix.toLocaleString('fr-FR')} → ${patch.prix.toLocaleString('fr-FR')} F`); l.prix = patch.prix;
  }
  if (patch.options) {
    const e = etatSiege(), o = patch.options, avant = JSON.stringify(optionsLigne(l.id));
    e.optionsLignes[l.id] = { jours: [...o.jours], arrets: o.arrets, colis: o.colis };
    if (JSON.stringify(e.optionsLignes[l.id]) !== avant) notes.push('jours et options');
    if (l.actif) {
      const fermes = e.fermesParJours[l.id] ?? [];
      for (const d of departsFuturs(l.id)) if (!o.jours[indexJour(d.jour)] && d.statut === 'prevu') { bilan.rembourses += fermerDepart(d, acteurId); bilan.annules++; fermes.push(d.id); }
      e.fermesParJours[l.id] = fermes.filter((id) => {
        const d = app.monde.departs.find((x) => x.id === id);
        if (d && d.statut === 'annule' && o.jours[indexJour(d.jour)] && (d.jour > auj || (d.jour === auj && departEnMs(d) > maintenant()))) { Object.assign(d, { statut: 'prevu', retardMin: 0, avancement: 0 }); bilan.restaures++; return false; }
        return !!d && d.statut === 'annule';
      });
    }
  }
  if (patch.actif !== undefined && patch.actif !== l.actif) {
    const e = etatSiege();
    if (!patch.actif) {
      l.actif = false; const ids: string[] = [];
      for (const d of departsFuturs(l.id)) if (d.statut === 'prevu') { bilan.rembourses += fermerDepart(d, acteurId); bilan.annules++; ids.push(d.id); }
      e.suspendus[l.id] = ids; notes.push('ligne suspendue');
    } else {
      l.actif = true;
      for (const id of e.suspendus[l.id] ?? []) { const d = app.monde.departs.find((x) => x.id === id); if (d && d.statut === 'annule' && (d.jour > auj || (d.jour === auj && departEnMs(d) > maintenant()))) { Object.assign(d, { statut: 'prevu', retardMin: 0, avancement: 0 }); bilan.restaures++; } }
      delete e.suspendus[l.id]; notes.push('ligne réactivée');
    }
  }
  if (notes.length) consigner('config', `Ligne ${l.de}→${l.vers} (${l.classe}) : ${notes.join(' · ')}`, acteurId, l.id);
  return bilan;
}
export interface SpecLigne { compagnieId: string; de: string; vers: string; gareDe: string; gareVers: string; classe: ClasseBus; prix: number; dureeMin: number; horaires?: string[] }
export function validerNouvelleLigne(s: SpecLigne): Record<string, string> {
  const e = validerLigne({ prix: s.prix, horaires: s.horaires }), gDe = app.monde.gares.find((g) => g.id === s.gareDe), gVers = app.monde.gares.find((g) => g.id === s.gareVers);
  if (!app.monde.compagnies.some((c) => c.id === s.compagnieId)) e.compagnieId = 'Compagnie inconnue.';
  if (!s.de || !s.vers) e.vers = 'Choisis la ville de départ et la ville d’arrivée.';
  else if (s.de === s.vers) e.vers = 'Le départ et l’arrivée doivent être différents.';
  if (!gDe || gDe.ville !== s.de) e.gareDe = 'Cette gare n’est pas dans la ville de départ.';
  if (!gVers || gVers.ville !== s.vers) e.gareVers = 'Cette gare n’est pas dans la ville d’arrivée.';
  if (!Number.isInteger(s.dureeMin) || s.dureeMin < 30 || s.dureeMin > 1440) e.dureeMin = 'Durée entre 30 min et 24 h.';
  if (app.monde.lignes.some((l) => l.compagnieId === s.compagnieId && l.de === s.de && l.vers === s.vers && l.classe === s.classe && l.gareDe === s.gareDe && l.gareVers === s.gareVers)) e.vers = 'Cette ligne existe déjà.';
  return e;
}
export function creerLigne(s: SpecLigne, acteurId?: string): Ligne {
  const err = validerNouvelleLigne(s); if (Object.keys(err).length) throw new ErreurValidation(err);
  let id = `l-${s.compagnieId}-${s.classe}-${s.gareDe}-${s.gareVers}`; if (app.monde.lignes.some((l) => l.id === id)) id += `-${app.monde.lignes.length}`;
  const l: Ligne = { id, de: s.de, vers: s.vers, gareDe: s.gareDe, gareVers: s.gareVers, compagnieId: s.compagnieId, classe: s.classe, prix: s.prix, dureeMin: s.dureeMin, actif: true, horaires: [] };
  app.monde.lignes.push(l); consigner('config', `Nouvelle ligne ${s.de}→${s.vers} (${s.classe}) · ${s.prix.toLocaleString('fr-FR')} F`, acteurId, id);
  if (s.horaires?.length) modifierLigne(id, { horaires: s.horaires }, acteurId);
  return l;
}

// ------------------------------------------------------------------ équipe
export const ROLES_A_GARE: Role[] = ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'superviseur'];
export const roleSansPin = (r: Role) => r === 'voyageur' || r === 'conducteur';
export interface FichePersonne { prenom: string; nom: string; tel: string; role: Role; gareId?: string; pin?: string; visage: boolean }
/** « 6 91 22 10 08 », « +237 691221008 » → « 691221008 ». */
export function normaliserTel(s: string): string { const c = s.replace(/\D/g, ''); return c.length === 12 && c.startsWith('237') ? c.slice(3) : c; }
export const formaterTel = (t: string) => (t.length === 9 ? `${t[0]} ${t.slice(1, 3)} ${t.slice(3, 5)} ${t.slice(5, 7)} ${t.slice(7)}` : t);
const PINS_FAIBLES = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321']);
export function validerPersonne(f: FichePersonne, id?: string): Record<string, string> {
  const e: Record<string, string> = {}, tel = normaliserTel(f.tel);
  if (!f.prenom.trim()) e.prenom = 'Le prénom est obligatoire.';
  if (!f.nom.trim()) e.nom = 'Le nom est obligatoire.';
  if (!/^6\d{8}$/.test(tel)) e.tel = 'Numéro camerounais à 9 chiffres commençant par 6.';
  else if (app.monde.personnes.some((p) => p.id !== id && p.tel === tel)) e.tel = 'Ce numéro est déjà utilisé par quelqu’un d’autre.';
  if (ROLES_A_GARE.includes(f.role) && !f.gareId) e.gareId = 'Une gare de rattachement est obligatoire pour ce rôle.';
  if (f.gareId && !app.monde.gares.some((g) => g.id === f.gareId)) e.gareId = 'Gare inconnue.';
  if (!roleSansPin(f.role)) {
    if (!f.pin) e.pin = 'Un PIN à 4 chiffres est obligatoire.';
    else if (!/^\d{4}$/.test(f.pin)) e.pin = 'Le PIN doit avoir exactement 4 chiffres.';
    else if (PINS_FAIBLES.has(f.pin)) e.pin = 'PIN trop facile à deviner : évite 0000, 1234…';
  }
  return e;
}
/** PIN à 4 chiffres, déterministe à partir de l'horloge et d'un sel (jamais un PIN faible). */
export function pinAleatoire(sel = 0): string {
  let n = (maintenant() + sel * 7919) >>> 0;
  for (let i = 0; i < 20; i++) { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; const p = String(1000 + (n >>> 8) % 9000); if (!PINS_FAIBLES.has(p) && !/^(\d)\1+$/.test(p)) return p; }
  return '4827';
}
const poserPin = (p: Personne, pin: string | undefined) => { if (!pin) return; if (p.actif) p.pin = pin; else etatSiege().pinsSuspendus[p.id] = pin; };
export function creerPersonne(f: FichePersonne, acteurId?: string): Personne {
  const err = validerPersonne(f); if (Object.keys(err).length) throw new ErreurValidation(err);
  const acteur = personne(acteurId), p: Personne = { id: nouvelId('p'), prenom: f.prenom.trim(), nom: f.nom.trim(), tel: normaliserTel(f.tel), role: f.role, actif: true, gareId: ROLES_A_GARE.includes(f.role) ? f.gareId : undefined, compagnieId: acteur?.compagnieId, visage: f.visage || undefined };
  if (!roleSansPin(f.role)) p.pin = f.pin;
  app.monde.personnes.push(p); consigner('acces', `Nouvelle personne : ${p.prenom} ${p.nom} (${f.role})`, acteurId, p.id);
  notifier(p.id, 'Bienvenue chez Bêta Express', 'Ton compte est créé. Ton PIN t’a été remis par SMS.', undefined, 'acces');
  return p;
}
export function modifierPersonne(id: string, f: FichePersonne, acteurId?: string): Personne {
  const p = personne(id); if (!p) throw new Error('personne_inconnue');
  const err = validerPersonne(f, id);
  if (id === acteurId && f.role !== p.role) err.role = 'Tu ne peux pas changer ton propre rôle.';
  const caisse = caisseOuverte(id);
  if (caisse && (f.role !== p.role || (f.gareId ?? '') !== (p.gareId ?? ''))) err.role = 'Une caisse est ouverte : elle doit d’abord être fermée.';
  if (Object.keys(err).length) throw new ErreurValidation(err);
  const notes: string[] = [];
  if (f.role !== p.role) notes.push(`rôle ${p.role} → ${f.role}`);
  if ((f.gareId ?? '') !== (p.gareId ?? '')) notes.push(`gare ${p.gareId ?? '—'} → ${f.gareId ?? '—'}`);
  if (f.pin && f.pin !== (p.actif ? p.pin : etatSiege().pinsSuspendus[id])) notes.push('PIN changé');
  Object.assign(p, { prenom: f.prenom.trim(), nom: f.nom.trim(), tel: normaliserTel(f.tel), role: f.role, gareId: ROLES_A_GARE.includes(f.role) ? f.gareId : undefined, visage: f.visage || undefined });
  if (roleSansPin(f.role)) { delete p.pin; delete etatSiege().pinsSuspendus[id]; } else poserPin(p, f.pin);
  if (app.session.personneId === id) app.session.role = p.role;
  if (notes.includes('PIN changé')) notifier(id, 'Nouveau PIN', 'Ton nouveau PIN t’a été envoyé par SMS.', undefined, 'acces');
  if (notes.length) consigner('acces', `${p.prenom} ${p.nom} : ${notes.join(' · ')}`, acteurId, id);
  return p;
}
/** Suspend ou réactive un compte. Suspendu : plus de PIN, donc plus de connexion (le PIN est gardé pour la réactivation). */
export function changerActivation(id: string, actif: boolean, acteurId?: string): Personne {
  const p = personne(id); if (!p) throw new Error('personne_inconnue');
  if (p.actif === actif) return p;
  if (!actif) {
    if (id === acteurId) throw new ErreurValidation({ actif: 'Tu ne peux pas suspendre ton propre compte.' });
    if (caisseOuverte(id)) throw new ErreurValidation({ actif: 'Une caisse est ouverte : elle doit d’abord être fermée.' });
    if (p.role === 'patron' && app.monde.personnes.filter((x) => x.role === 'patron' && x.actif).length <= 1) throw new ErreurValidation({ actif: 'Il faut au moins un patron actif.' });
    if (p.pin) etatSiege().pinsSuspendus[id] = p.pin; delete p.pin; p.actif = false;
  } else {
    const e = etatSiege(); if (e.pinsSuspendus[id]) { p.pin = e.pinsSuspendus[id]; delete e.pinsSuspendus[id]; } p.actif = true;
  }
  consigner('acces', `${p.prenom} ${p.nom} : compte ${actif ? 'réactivé' : 'suspendu'}`, acteurId, id);
  return p;
}
/** Nouveau PIN (généré) pour une personne ; le PIN est « envoyé par SMS » (simulé) et renvoyé pour affichage de démonstration. */
export function renouvelerPin(id: string, acteurId?: string): string {
  const p = personne(id); if (!p) throw new Error('personne_inconnue');
  const pin = pinAleatoire(app.monde.personnes.indexOf(p)); poserPin(p, pin);
  notifier(id, 'Nouveau PIN', 'Ton nouveau PIN t’a été envoyé par SMS.', undefined, 'acces'); consigner('acces', `Nouveau PIN pour ${p.prenom} ${p.nom}`, acteurId, id);
  return pin;
}
export function derniereAction(personneId: string) { return app.monde.evenements.find((e) => e.acteurId === personneId); }

// ------------------------------------------------------------------ tarifs, règles, modules, permissions
export type GroupeParam = 'regles' | 'tarifs' | 'modules';
export function basculerParametre(groupe: GroupeParam, cle: string, acteurId?: string): boolean {
  const g = app.monde.params[groupe]; if (!(cle in g)) throw new Error('parametre_inconnu');
  g[cle] = !g[cle]; consigner('config', `${groupe === 'tarifs' ? 'Tarif' : groupe === 'regles' ? 'Règle' : 'Module'} « ${cle} » ${g[cle] ? 'activé' : 'désactivé'}`, acteurId); return g[cle];
}
export const PERMISSIONS: { cle: string; nom: string; detail: string; roles: Role[] }[] = [
  { cle: 'vendre', nom: 'Vendre un billet', detail: 'guichet et cadence', roles: ['guichet', 'convoyeur', 'superviseur'] },
  { cle: 'especes', nom: 'Encaisser espèces', detail: 'avec rendu calculé', roles: ['guichet', 'convoyeur', 'superviseur'] },
  { cle: 'mobile', nom: 'Encaisser MoMo / OM', detail: 'code marchand de la gare', roles: ['guichet', 'convoyeur', 'superviseur'] },
  { cle: 'annuler', nom: 'Annuler une vente', detail: 'dans les 10 min', roles: ['guichet', 'superviseur'] },
  { cle: 'imprimer', nom: 'Imprimer', detail: 'tickets et étiquettes', roles: ['guichet', 'superviseur'] },
  { cle: 'caisses', nom: 'Voir les autres caisses', detail: 'réservé superviseur', roles: ['superviseur'] },
  { cle: 'cloture', nom: 'Valider une clôture', detail: 'réservé superviseur', roles: ['superviseur'] },
  { cle: 'tarif', nom: 'Modifier un tarif', detail: 'réservé siège', roles: [] }
];
export const permission = (role: Role, cle: string): boolean => { const o = lireSiege().permissions[role]?.[cle]; return o ?? !!PERMISSIONS.find((p) => p.cle === cle)?.roles.includes(role); };
export function fixerPermission(role: Role, cle: string, valeur: boolean, acteurId?: string) {
  const e = etatSiege(); (e.permissions[role] ??= {})[cle] = valeur; consigner('config', `Permission « ${cle} » du rôle ${role} : ${valeur ? 'accordée' : 'retirée'}`, acteurId);
}

// ------------------------------------------------------------------ salle de contrôle
/** Prévient le chauffeur d'un bus en excès de vitesse (notification + journal). Renvoie false s'il n'y a personne à prévenir. */
export function prevenirChauffeur(departId: string, chauffeurId: string | undefined, vitesse: number, acteurId?: string): boolean {
  const d = app.monde.departs.find((x) => x.id === departId); if (!d || !chauffeurId || !personne(chauffeurId)) return false;
  notifier(chauffeurId, 'Ralentis, s’il te plaît', `${vitesse} km/h détectés (limite 90). La salle de contrôle te prévient.`, '/chauffeur', 'alerte');
  consigner('alerte', `Chauffeur prévenu : ${vitesse} km/h`, acteurId, departId); return true;
}
export const chauffeurPrevenu = (departId: string, now = maintenant()) => app.monde.evenements.some((e) => e.type === 'alerte' && e.ref === departId && now - e.ts < 30 * 60_000);

/** Relance la passerelle Orange Money (simulée) : l'incident se résorbe. */
export function relancerOrangeMoney(acteurId?: string): void {
  const e = etatSiege(); if (e.omRelancee) return;
  e.omRelancee = true; e.relanceeA = maintenant(); consigner('reseau', 'Passerelle Orange Money relancée : latence revenue à la normale', acteurId);
}
