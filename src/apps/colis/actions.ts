// Transactions de l'application Colis & partenaires : envoi, réception au relais, remise, courses moto, candidatures.
// Tout passe par les primitives de `domain/actions.ts` (creerColis, avancerColis…) : un colis déposé au guichet par un autre agent apparaît ici.
import { app, aujourdhui, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { avancerColis, compagnieDe, consigner, creerColis, departEnMs, departParId, gare, ligneDe, notifier, personne, personneCourante } from '../../domain/actions.ts';
import type { Colis, Depart, Personne } from '../../domain/types.ts';
import { codeRetrait as genererCode } from '../../core/colis.ts';
import { jourDe } from '../../core/dates.ts';
import { COMMISSION_RELAIS, distanceBoutique, erreurDestinataire, erreursBoutique, etatOuverture, GAIN_COURSE, heureArrivee, MAX_COURSES_ACTIVES, normaliserCodeColis, normaliserTel, positionSimulee, QUARTIERS, type Boutique, type EtatOuverture } from '../../core/relais.ts';
import { boutiqueDe, brouillonVide, candidatures, courseDe, trancheCandidatures, trancheColis, trancheRelais, type Brouillon, type Candidature, type FicheLivreur, type FicheRelais } from './etat.ts';

export type Echec = { ok: false; message: string };
export const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] ?? nom;
export const NOM_TAILLE = { S: 'Enveloppe S', M: 'Carton M', L: 'Sac L' } as const;
const montrerF = (n: number) => `${n.toLocaleString('fr-FR')} F`;

// ------------------------------------------------------------------ le monde des relais
const RELAIS_PAR_DEFAUT: Personne[] = [
  { id: 'p-relais-port', prenom: 'Paulette', nom: 'Mbassi', tel: '670000121', role: 'relais', actif: true, zone: 'Douala · Bonanjo', note: 4.7 },
  { id: 'p-relais-bali', prenom: 'Hervé', nom: 'Nkoulou', tel: '670000122', role: 'relais', actif: true, zone: 'Douala · Bali', note: 4.6 },
  { id: 'p-relais-ndom', prenom: 'Sylvie', nom: 'Ndom', tel: '670000123', role: 'relais', actif: true, zone: 'Douala · Deïdo', note: 4.5 }
];
/** Crée les tranches et les trois autres points relais de la carte (Mado est déjà dans le monde). À appeler au démarrage et après une réinitialisation. */
export function garantirRelais() {
  trancheRelais(); trancheColis(); trancheCandidatures();
  for (const p of RELAIS_PAR_DEFAUT) if (!personne(p.id)) app.monde.personnes.push({ ...p });
}
export interface PointRelais { personne: Personne; boutique: Boutique; distance: number; ouverture: EtatOuverture }
/** Relais actifs du monde (personnes `relais` avec une fiche boutique), du plus proche de la gare d'Akwa au plus loin. */
export function relaisDuMonde(): PointRelais[] {
  const now = new Date(maintenant());
  return app.monde.personnes.flatMap((p) => { const b = p.role === 'relais' && p.actif ? boutiqueDe(p.id) : undefined; return b ? [{ personne: p, boutique: b, distance: distanceBoutique(b), ouverture: etatOuverture(b, now) }] : []; }).sort((a, b) => a.distance - b.distance);
}
export const nomRelais = (relaisId: string | undefined) => boutiqueDe(relaisId)?.nom ?? personne(relaisId)?.prenom ?? 'point relais';
/** La personne de l'app partenaire : la session si elle a le bon rôle ; le patron (qui ouvre tout) voit l'écran de la persona de démo. */
export function acteur(role: 'relais' | 'livreur'): Personne | undefined {
  const moi = personneCourante();
  return moi?.role === role ? moi : personne(role === 'relais' ? 'p-mado' : 'p-samuel');
}

// ------------------------------------------------------------------ envoi
/** Prochain bus Bêta Express Yaoundé → Douala, au moins 30 min après maintenant. */
export function prochainDepartColis(): Depart | undefined {
  const now = maintenant();
  return app.monde.departs.filter((d) => { if (d.statut !== 'prevu' || departEnMs(d) - now < 30 * 60_000) return false; const l = ligneDe(d); return l.de === 'Yaoundé' && l.vers === 'Douala' && l.compagnieId === 'BX'; }).sort((a, b) => departEnMs(a) - departEnMs(b))[0];
}
export const arriveeDepart = (d: Depart) => heureArrivee(d.heure, ligneDe(d).dureeMin, d.retardMin);
export type ErreursEnvoi = { nom?: string; tel?: string; relais?: string; quartier?: string; general?: string };
export function validerEnvoi(b: Brouillon): ErreursEnvoi {
  const e: ErreursEnvoi = erreurDestinataire(b.nom, b.tel);
  if (!['S', 'M', 'L'].includes(b.taille)) e.general = 'Choisis une taille';
  if (!b.relaisId || !relaisDuMonde().some((r) => r.personne.id === b.relaisId)) e.relais = 'Choisis le point relais d’arrivée';
  if (b.moto && !QUARTIERS.some((q) => q.nom === b.quartier)) e.quartier = 'Choisis le quartier de livraison';
  if (app.session.hors_ligne) e.general = 'Tu es hors ligne : reconnecte-toi pour créer le colis';
  return e;
}
export function envoyerColis(b: Brouillon, expediteurId: string): { ok: true; colis: Colis; payer: boolean } | { ok: false; erreurs: ErreursEnvoi } {
  const erreurs = validerEnvoi(b);
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  const dep = prochainDepartColis(), relais = relaisDuMonde().find((r) => r.personne.id === b.relaisId)!;
  const { colis } = creerColis({
    expediteurId, destinataire: { nom: b.nom.trim(), tel: normaliserTel(b.tel)! }, taille: b.taille, options: { moto: b.moto, assurance: b.assurance, contreRemboursement: b.cod },
    depart: `Yaoundé · ${dep ? gare(ligneDe(dep).gareDe)?.nom ?? 'gare' : 'gare'}`, arrivee: `Douala · relais ${relais.boutique.nom}`, relaisId: relais.personne.id, moyen: 'momo', canal: 'app'
  });
  const vivant = app.monde.colis.find((c) => c.id === colis.id)!;
  if (dep) vivant.departId = dep.id;
  const t = trancheColis();
  if (b.moto) t.courses[vivant.id] = { quartier: b.quartier, etape: 0, essais: 0 };
  Object.assign(t.brouillon, brouillonVide());
  notifier(relais.personne.id, 'Colis attendu', `${vivant.code} · ${NOM_TAILLE[vivant.taille]} pour ${vivant.destinataire.nom}`, '/relais/app', 'colis');
  consigner('colis', `Colis ${vivant.code} créé · ${NOM_TAILLE[vivant.taille]} · ${montrerF(vivant.prix)}${b.cod ? ' · le destinataire paie' : ''}`, expediteurId, vivant.id);
  return { ok: true, colis: vivant, payer: !b.cod };
}
export function annulerColis(colisId: string, parId: string): { ok: true } | Echec {
  const c = app.monde.colis.find((x) => x.id === colisId); if (!c) return { ok: false, message: 'Colis introuvable' };
  const p = app.monde.paiements.find((x) => x.id === c.paiementId);
  if (c.statut !== 'cree') return { ok: false, message: 'Le colis est déjà déposé : fais une réclamation' };
  if (p?.statut === 'ok') return { ok: false, message: 'Colis déjà payé : passe au guichet pour le remboursement' };
  if (p?.statut === 'attente') { p.statut = 'refuse'; p.motif = 'Colis annulé'; }
  avancerColis(c.id, 'annule', 'Annulé par l’expéditeur', parId); return { ok: true };
}
/** Partage WhatsApp simulé du code de retrait au destinataire. Aucun message n'est réellement envoyé. */
export function messageWhatsApp(c: Colis, expediteurId: string): string {
  const exp = personne(expediteurId);
  return `Bonjour ${prenomDe(c.destinataire.nom)}, ${exp?.prenom ?? 'ton proche'} t’envoie un colis (${NOM_TAILLE[c.taille]}) via AfriMove. Retrait chez ${nomRelais(c.relaisId)} avec ce code : ${c.codeRetrait}. Suivi : ${c.code}.`;
}
export function partager(colisId: string, expediteurId: string): string {
  const c = app.monde.colis.find((x) => x.id === colisId)!, t = trancheColis();
  t.partages[colisId] = (t.partages[colisId] ?? 0) + 1;
  consigner('colis', `Code de retrait du colis ${c.code} partagé par WhatsApp (simulé)`, expediteurId, c.id);
  return messageWhatsApp(c, expediteurId);
}

// ------------------------------------------------------------------ relais : réception et remise
/** Colis sans relais désigné (déposés au guichet par un autre agent) : attendus par tous les relais de Douala jusqu'à ce que l'un d'eux les reçoive. */
const sansRelais = (c: Colis) => !c.relaisId && c.arrivee.startsWith('Douala');
export const colisAttendus = (relaisId: string) => app.monde.colis.filter((c) => (c.relaisId === relaisId || sansRelais(c)) && ['cree', 'depose', 'en_route'].includes(c.statut)).sort((a, b) => a.etapes[a.etapes.length - 1].ts - b.etapes[b.etapes.length - 1].ts);
export const colisEnRayon = (relaisId: string) => app.monde.colis.filter((c) => c.relaisId === relaisId && c.statut === 'au_relais').sort((a, b) => depuisRayon(a) - depuisRayon(b));
/** Instant où le colis est arrivé au relais. */
export const depuisRayon = (c: Colis) => [...c.etapes].reverse().find((e) => e.statut === 'au_relais')?.ts ?? c.etapes[c.etapes.length - 1].ts;
const relaisActif = (relaisId: string) => { const p = personne(relaisId); return p?.role === 'relais' && p.actif ? p : undefined; };

/** Le relais scanne ou saisit le code AM-C-… : le colis passe « au_relais ». */
export function recevoirColis(saisie: string, relaisId: string): { ok: true; colis: Colis; message: string } | Echec {
  if (!relaisActif(relaisId)) return { ok: false, message: 'Compte relais non activé' };
  const code = normaliserCodeColis(saisie); if (!code) return { ok: false, message: 'Code illisible : écris AM-C- suivi de 3 caractères' };
  const c = app.monde.colis.find((x) => x.code === code); if (!c) return { ok: false, message: `Colis ${code} inconnu` };
  if (c.relaisId && c.relaisId !== relaisId) return { ok: false, message: `Ce colis est attendu chez ${nomRelais(c.relaisId)}` };
  switch (c.statut) {
    case 'au_relais': return { ok: false, message: 'Colis déjà reçu au relais' };
    case 'en_livraison': return { ok: false, message: 'Colis déjà parti en livraison moto' };
    case 'livre': return { ok: false, message: 'Colis déjà remis au destinataire' };
    case 'cree': return { ok: false, message: 'Ce colis n’a pas encore été déposé au guichet de départ' };
    case 'annule': case 'litige': return { ok: false, message: c.statut === 'annule' ? 'Colis annulé : ne le reçois pas' : 'Colis en litige : contacte le superviseur' };
  }
  if (!c.relaisId) c.relaisId = relaisId;
  avancerColis(c.id, 'au_relais', `Reçu au relais ${nomRelais(relaisId)}`, relaisId);
  if (c.options.moto) for (const l of app.monde.personnes.filter((p) => p.role === 'livreur' && p.actif)) notifier(l.id, 'Course disponible', `${c.code} · ${NOM_TAILLE[c.taille]} · ${montrerF(GAIN_COURSE)}`, '/livreur', 'course');
  return { ok: true, colis: c, message: `Colis ${c.code} reçu · ${c.destinataire.nom} sera prévenu${c.options.moto ? ' · course moto proposée' : ''}` };
}
export const colisPourRemise = (relaisId: string, code: string) => app.monde.colis.filter((c) => c.relaisId === relaisId && c.statut === 'au_relais' && c.codeRetrait === code);
/** Remise au destinataire contre son code de retrait à 4 chiffres. `pieceVerifiee` : le relais a regardé la pièce d'identité. */
export function remettreColis(colisId: string, code: string, relaisId: string, pieceVerifiee: boolean): { ok: true; colis: Colis; gain: number; aEncaisser: number; message: string } | Echec {
  const c = app.monde.colis.find((x) => x.id === colisId);
  if (!c || !relaisActif(relaisId) || c.relaisId !== relaisId) return { ok: false, message: 'Colis introuvable dans ce relais' };
  if (c.statut !== 'au_relais') return { ok: false, message: 'Ce colis n’est plus au relais' };
  if (c.codeRetrait !== code) return { ok: false, message: 'Code de retrait incorrect' };
  if (!pieceVerifiee) return { ok: false, message: 'Vérifie la pièce d’identité du destinataire' };
  avancerColis(c.id, 'livre', `Remis à ${c.destinataire.nom} au relais ${nomRelais(relaisId)}`, relaisId);
  const aEncaisser = c.options.contreRemboursement ? c.prix : 0;
  if (aEncaisser) consigner('colis', `Colis ${c.code} : ${montrerF(aEncaisser)} encaissés auprès du destinataire (le destinataire paie)`, relaisId, c.id);
  return { ok: true, colis: c, gain: COMMISSION_RELAIS, aEncaisser, message: `Colis remis à ${prenomDe(c.destinataire.nom)} · +${montrerF(COMMISSION_RELAIS)}` };
}
const remisPar = (acteurId: string) => app.monde.colis.flatMap((c) => c.etapes.filter((e) => e.statut === 'livre' && e.par === acteurId).map((e) => ({ colis: c, ts: e.ts })));
export interface Gains { nbJour: number; gainJour: number; nbSemaine: number; gainSemaine: number; /** Remises par jour, des 7 derniers jours (le plus récent en dernier). */ parJour: number[] }
function gains(acteurId: string, unite: number): Gains {
  const jours = Array.from({ length: 7 }, (_, i) => jourDe(new Date(maintenant() - (6 - i) * 86_400_000)));
  const parJour = jours.map((j) => remisPar(acteurId).filter((r) => jourDe(new Date(r.ts)) === j).length), nbJour = parJour[6];
  const nbSemaine = parJour.reduce((s, n) => s + n, 0);
  return { nbJour, gainJour: nbJour * unite, nbSemaine, gainSemaine: nbSemaine * unite, parJour };
}
export const gainsRelais = (relaisId: string) => gains(relaisId, COMMISSION_RELAIS);
export const gainsLivreur = (livreurId: string) => gains(livreurId, GAIN_COURSE);

// ------------------------------------------------------------------ livreur : courses moto
export const livreurDispo = (livreurId: string) => (app.tranches.colis as { livreurs: Record<string, { dispo: boolean }> } | undefined)?.livreurs[livreurId]?.dispo ?? true;
export function basculerDispo(livreurId: string) { const t = trancheColis(); t.livreurs[livreurId] = { dispo: !livreurDispo(livreurId) }; return t.livreurs[livreurId].dispo; }
export const coursesDisponibles = () => app.monde.colis.filter((c) => c.options.moto && c.statut === 'au_relais' && !c.livreurId).sort((a, b) => depuisRayon(a) - depuisRayon(b));
export const coursesEnCours = (livreurId: string) => app.monde.colis.filter((c) => c.livreurId === livreurId && c.statut === 'en_livraison');
export const quartierDe = (colisId: string) => courseDe(colisId)?.quartier ?? 'Bonamoussadi';
export function accepterCourse(colisId: string, livreurId: string): { ok: true; colis: Colis } | Echec {
  const l = personne(livreurId); if (l?.role !== 'livreur' || !l.actif) return { ok: false, message: 'Compte livreur non activé' };
  if (!livreurDispo(livreurId)) return { ok: false, message: 'Passe en « disponible » pour accepter une course' };
  const c = app.monde.colis.find((x) => x.id === colisId);
  if (!c || !c.options.moto || c.statut !== 'au_relais') return { ok: false, message: 'Cette course n’est plus disponible' };
  if (c.livreurId && c.livreurId !== livreurId) return { ok: false, message: 'Un autre livreur a déjà pris cette course' };
  if (coursesEnCours(livreurId).length >= MAX_COURSES_ACTIVES) return { ok: false, message: `${MAX_COURSES_ACTIVES} courses en cours : termine-en une d’abord` };
  c.livreurId = livreurId;
  const t = trancheColis(); t.courses[c.id] = { quartier: t.courses[c.id]?.quartier ?? 'Bonamoussadi', etape: 0, essais: 0 };
  avancerColis(c.id, 'en_livraison', `Pris en charge au relais ${nomRelais(c.relaisId)} par ${l.prenom}`, livreurId);
  return { ok: true, colis: c };
}
/** Étape suivante de l'itinéraire simulé (parti → en route → presque là). */
export function avancerCourse(colisId: string, livreurId: string): { ok: true; etape: number } | Echec {
  const c = app.monde.colis.find((x) => x.id === colisId), course = trancheColis().courses[colisId];
  if (!c || c.statut !== 'en_livraison' || c.livreurId !== livreurId || !course) return { ok: false, message: 'Course introuvable' };
  course.etape = Math.min(2, course.etape + 1); return { ok: true, etape: course.etape };
}
/** Preuve de livraison : le destinataire donne son code de retrait au livreur. Trois codes faux : le colis revient au relais. */
export function livrerCourse(colisId: string, code: string, livreurId: string): { ok: true; colis: Colis; gain: number } | (Echec & { retour?: boolean }) {
  const c = app.monde.colis.find((x) => x.id === colisId), course = trancheColis().courses[colisId];
  if (!c || c.statut !== 'en_livraison' || c.livreurId !== livreurId || !course) return { ok: false, message: 'Course introuvable' };
  if (course.etape < 2) return { ok: false, message: 'Arrive d’abord chez le destinataire' };
  if (c.codeRetrait !== code) {
    course.essais++;
    if (course.essais >= 3) { retournerCourse(colisId, livreurId, 'Trois codes faux : le colis revient au relais'); return { ok: false, retour: true, message: 'Trois codes faux : le colis revient au relais' }; }
    return { ok: false, message: `Code incorrect · ${3 - course.essais} essai${3 - course.essais > 1 ? 's' : ''} restant${3 - course.essais > 1 ? 's' : ''}` };
  }
  course.etape = 3;
  avancerColis(c.id, 'livre', `Remis à ${c.destinataire.nom} par le livreur · code vérifié`, livreurId);
  return { ok: true, colis: c, gain: GAIN_COURSE };
}
/** Remise impossible : le colis retourne au relais et redevient une course disponible. */
export function retournerCourse(colisId: string, livreurId: string, motif = 'Remise impossible'): { ok: true } | Echec {
  const c = app.monde.colis.find((x) => x.id === colisId);
  if (!c || c.statut !== 'en_livraison' || c.livreurId !== livreurId) return { ok: false, message: 'Course introuvable' };
  c.livreurId = undefined; const course = trancheColis().courses[colisId]; if (course) { course.etape = 0; course.essais = 0; }
  avancerColis(c.id, 'au_relais', `Retour au relais ${nomRelais(c.relaisId)} · ${motif}`, livreurId); return { ok: true };
}
/** Bouton « Simuler l'étape suivante » du client : fait avancer le livreur ; à la dernière étape, le destinataire donne son code. */
export function simulerEtapeSuivante(colisId: string): { ok: true; livre: boolean } | Echec {
  const c = app.monde.colis.find((x) => x.id === colisId), course = trancheColis().courses[colisId];
  if (!c || c.statut !== 'en_livraison' || !c.livreurId || !course) return { ok: false, message: 'Aucun livreur en route' };
  if (course.etape < 2) { avancerCourse(colisId, c.livreurId); return { ok: true, livre: false }; }
  const r = livrerCourse(colisId, c.codeRetrait, c.livreurId); return r.ok ? { ok: true, livre: true } : r;
}
/** Bus arrivant à Douala dans les `fenetreH` prochaines heures (pour le livreur), du plus proche au plus lointain. */
export function busQuiArrivent(fenetreH = 3): { heure: string; compagnie: string }[] {
  const now = maintenant();
  return app.monde.departs.filter((d) => d.statut !== 'annule' && ligneDe(d).vers === 'Douala')
    .map((d) => ({ d, fin: departEnMs(d) + ligneDe(d).dureeMin * 60_000 })).filter((x) => x.fin >= now && x.fin < now + fenetreH * 3_600_000)
    .sort((a, b) => a.fin - b.fin).map((x) => ({ heure: heureArrivee(x.d.heure, ligneDe(x.d).dureeMin, x.d.retardMin), compagnie: compagnieDe(x.d).abrev }));
}

// ------------------------------------------------------------------ candidatures : devenir relais ou livreur
export const candidatureDe = (candidatId: string | undefined | null, type: Candidature['type']) => candidatures().filter((c) => c.candidatId === candidatId && c.type === type && c.statut !== 'refusee').at(-1);
export type ErreursFiche = { boutique?: ReturnType<typeof erreursBoutique>; titulaire?: string; tel?: string; photos?: string; cni?: string; charte?: string; conditions?: string };
export function erreursFicheRelais(f: FicheRelais): ErreursFiche {
  const e: ErreursFiche = {}, eb = erreursBoutique(f.boutique);
  if (Object.keys(eb).length) e.boutique = eb;
  if (f.titulaire.trim().split(/\s+/).filter(Boolean).length < 1 || f.titulaire.trim().length < 3) e.titulaire = 'Écris ton nom';
  if (!normaliserTel(f.tel)) e.tel = 'Numéro MoMo ou OM invalide (ex. 6 77 45 00 12)';
  if (f.photos < 3) e.photos = 'Ajoute les 3 photos de la boutique';
  if (!f.cni) e.cni = 'Scanne ta CNI';
  return e;
}
function creerCompte(role: 'relais' | 'livreur', titulaire: string, tel: string, extra: Partial<Personne>): Personne {
  const mots = titulaire.trim().split(/\s+/), p: Personne = { id: nouvelId(role === 'relais' ? 'p-rel' : 'p-liv'), prenom: mots[0], nom: mots.slice(1).join(' '), tel: normaliserTel(tel)!, role, actif: false, ...extra };
  app.monde.personnes.push(p); return app.monde.personnes[app.monde.personnes.length - 1];
}
export function candidaterRelais(candidatId: string, f: FicheRelais): { ok: true; candidature: Candidature } | { ok: false; erreurs: ErreursFiche } | Echec {
  const erreurs = erreursFicheRelais(f); if (Object.keys(erreurs).length) return { ok: false, erreurs };
  if (candidatureDe(candidatId, 'relais')) return { ok: false, message: 'Tu as déjà une candidature relais en cours' };
  const pos = positionSimulee(f.boutique.nom), compte = creerCompte('relais', f.titulaire, f.tel, { zone: `Douala · ${f.boutique.adresse.split(',')[0].trim()}` });
  trancheRelais().boutiques[compte.id] = { ...f.boutique, jours: [...f.boutique.jours], ...pos };
  const t = trancheCandidatures(); const cand: Candidature = { id: nouvelId('cand'), type: 'relais', candidatId, personneId: compte.id, ts: maintenant(), statut: 'attente', fiche: { ...f, boutique: { ...f.boutique, jours: [...f.boutique.jours] } } };
  t.liste.push(cand);
  notifier(candidatId, 'Fiche relais reçue', `${f.boutique.nom} · réponse sous 48 h`, '/relais/inscription', 'candidature'); consigner('candidature', `Candidature relais : ${f.boutique.nom}`, candidatId, cand.id);
  return { ok: true, candidature: t.liste[t.liste.length - 1] };
}
export function candidaterLivreur(candidatId: string, f: FicheLivreur): { ok: true; candidature: Candidature } | Echec {
  if (f.conditions.length !== 4 || !f.conditions.every(Boolean)) return { ok: false, message: 'Coche les 4 conditions' };
  if (f.titulaire.trim().length < 3) return { ok: false, message: 'Écris ton nom' };
  if (!normaliserTel(f.tel)) return { ok: false, message: 'Numéro MoMo ou OM invalide' };
  if (candidatureDe(candidatId, 'livreur')) return { ok: false, message: 'Tu as déjà une candidature livreur en cours' };
  const compte = creerCompte('livreur', f.titulaire, f.tel, { zone: 'Douala', vehicule: 'Moto' });
  const t = trancheCandidatures(), cand: Candidature = { id: nouvelId('cand'), type: 'livreur', candidatId, personneId: compte.id, ts: maintenant(), statut: 'attente', fiche: { ...f, conditions: [...f.conditions] } };
  t.liste.push(cand);
  notifier(candidatId, 'Candidature livreur reçue', 'Réponse sous 48 h', '/livreur/devenir', 'candidature'); consigner('candidature', `Candidature livreur : ${f.titulaire}`, candidatId, cand.id);
  return { ok: true, candidature: t.liste[t.liste.length - 1] };
}
/** Réponse de l'équipe AfriMove (simulée dans la démo) : active le compte partenaire et lui donne un PIN. */
export function repondreCandidature(candidatureId: string, acceptee: boolean): { ok: true; pin?: string } | Echec {
  const c = trancheCandidatures().liste.find((x) => x.id === candidatureId); if (!c) return { ok: false, message: 'Candidature introuvable' };
  if (c.statut !== 'attente') return { ok: false, message: 'Candidature déjà traitée' };
  const p = personne(c.personneId); if (!p) return { ok: false, message: 'Compte introuvable' };
  c.statut = acceptee ? 'acceptee' : 'refusee'; c.repondueLe = maintenant();
  if (!acceptee) { notifier(c.candidatId, `Candidature ${c.type === 'relais' ? 'relais' : 'livreur'} refusée`, 'Ta fiche n’a pas pu être retenue pour l’instant.', undefined, 'candidature'); return { ok: true }; }
  const pin = genererCode(c.ts / 1000 + app.monde.personnes.length); p.actif = true; p.pin = pin;
  notifier(c.candidatId, `Compte ${c.type === 'relais' ? 'relais' : 'livreur'} activé`, `Bienvenue ! Ton code PIN est ${pin} (envoyé aussi par SMS, simulé).`, c.type === 'relais' ? '/relais/app' : '/livreur', 'candidature');
  consigner('candidature', `Candidature ${c.type} acceptée : ${p.prenom} ${p.nom}`, c.candidatId, c.id); return { ok: true, pin };
}
/** Un relais actif modifie sa fiche boutique. */
export function modifierBoutique(personneId: string, b: Omit<Boutique, 'est' | 'nord'>): { ok: true } | { ok: false; erreurs: ReturnType<typeof erreursBoutique> } {
  const erreurs = erreursBoutique(b); if (Object.keys(erreurs).length) return { ok: false, erreurs };
  const t = trancheRelais(), ancienne = t.boutiques[personneId] ?? boutiqueDe(personneId);
  t.boutiques[personneId] = { ...b, jours: [...b.jours], est: ancienne?.est ?? positionSimulee(b.nom).est, nord: ancienne?.nord ?? positionSimulee(b.nom).nord };
  consigner('relais', `Fiche relais modifiée : ${b.nom}`, personneId); return { ok: true };
}
