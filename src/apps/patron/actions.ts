// Transactions du patron. Elles s'appuient sur `app.monde` et les primitives de `domain/actions.ts` (consigner, notifier) ; rien d'autre ne modifie le monde.
import { ajouterJours } from '../../core/dates.ts';
import { ROLES_DE_GARE, nouveauPin } from '../../core/equipe.ts';
import { ETAPES_DOSSIER, PIECES, offreParId, simuler } from '../../core/financement.ts';
import { aRegler, borner, couvre, villesDuColis, type Convention, type Signature } from '../../core/interagences.ts';
import { app, aujourdhui, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { caisseOuverte, consigner, equipeDe, gare, notifier, personne, personneCourante } from '../../domain/actions.ts';
import { etatAssistant, etatFinancement, etatInterAgences, etatPatron, type Dossier } from './etat.ts';
import { SEUIL_MONDE_VIDE, genererHistorique } from './historique.ts';
import { MODULES } from './modules.ts';
import { recetteMensuelleEstimee } from '../../core/assistant.ts';
import { contexte } from './lecture.ts';

export interface Resultat { ok: boolean; raison?: string; message?: string }
const refus = (raison: string): Resultat => ({ ok: false, raison });
export const compagnieDuPatron = () => personneCourante()?.compagnieId ?? 'BX';
const patronId = () => personneCourante()?.id ?? app.monde.personnes.find((p) => p.role === 'patron')?.id;
const nomComplet = (id: string) => { const p = personne(id); return p ? `${p.prenom} ${p.nom}` : id; };

// ------------------------------------------------------------------ modules
/** Active ou masque un module ; le module de base ne se coupe pas. Les billets et colis en cours continuent. */
export function basculerModule(cle: string, actif: boolean): Resultat {
  const def = MODULES.find((m) => m.cle === cle);
  if (!def) return refus('module_inconnu');
  if (def.socle) return refus('Ce module est inclus : il reste toujours actif');
  app.monde.params.modules[cle] = actif;
  consigner('module', `${def.nom} ${actif ? 'activé' : 'masqué'}`, patronId(), cle);
  return { ok: true, message: actif ? `${def.nom} activé · visible dans les apps d’ici 1 minute` : `${def.nom} masqué · les billets et colis en cours continuent` };
}

// ------------------------------------------------------------------ équipe
/** Suspend ou réactive une personne de l'équipe. Une suspension coupe l'accès (voir `demarrage.ts`) ; une caisse ouverte reste à clôturer. */
export function suspendrePersonne(id: string, suspendre: boolean): Resultat {
  const p = personne(id);
  if (!p) return refus('inconnu');
  if (p.role === 'patron') return refus('Le patron ne peut pas se suspendre');
  if (p.actif === !suspendre) return { ok: true, message: suspendre ? 'Déjà suspendu' : 'Déjà actif' };
  p.actif = !suspendre;
  consigner('equipe', `${nomComplet(id)} ${suspendre ? 'suspendu' : 'réactivé'}`, patronId(), id);
  notifier(id, suspendre ? 'Accès suspendu' : 'Accès rétabli', suspendre ? 'Le patron a suspendu ton accès. Contacte-le.' : 'Tu peux te reconnecter avec ton PIN.', undefined, 'equipe');
  const ouverte = suspendre ? caisseOuverte(id) : undefined;
  return { ok: true, message: suspendre ? `${p.prenom} est suspendu${ouverte ? ' · sa caisse reste ouverte : le superviseur doit la clôturer' : ''}` : `${p.prenom} est réactivé` };
}
/** Affecte une personne à une autre gare. Refusé si elle a une caisse ouverte (la caisse est liée à la gare). */
export function changerGare(id: string, gareId: string): Resultat {
  const p = personne(id), g = gare(gareId);
  if (!p || !g) return refus('inconnu');
  if (!ROLES_DE_GARE.includes(p.role)) return refus('Cette personne n’est rattachée à aucune gare');
  if (p.gareId === gareId) return refus('Déjà dans cette gare');
  if (caisseOuverte(id)) return refus('Caisse ouverte : à clôturer avant de changer de gare');
  const avant = gare(p.gareId ?? '');
  p.gareId = gareId;
  consigner('equipe', `${nomComplet(id)} change de gare : ${avant?.nom ?? '—'} → ${g.nom}`, patronId(), id);
  notifier(id, 'Nouvelle gare', `Tu travailles maintenant à ${g.ville} ${g.nom}.`, undefined, 'equipe');
  for (const s of equipeDe(gareId, 'superviseur')) notifier(s.id, 'Nouvelle recrue', `${p.prenom} ${p.nom} rejoint ta gare (${p.role}).`, '/superviseur/equipe', 'equipe');
  return { ok: true, message: `${p.prenom} est maintenant à ${g.ville} ${g.nom}` };
}
/** Réinitialise le PIN : un PIN provisoire est envoyé par SMS (simulé : notification). Le PIN est aussi rendu à l'écran du patron (démo). */
export function reinitialiserPin(id: string): Resultat & { pin?: string } {
  const p = personne(id);
  if (!p) return refus('inconnu');
  if (p.role === 'patron') return refus('Le PIN du patron se change dans les réglages');
  const pin = nouveauPin(id, p.pin, maintenant() / 1000);
  p.pin = pin;
  consigner('equipe', `PIN de ${nomComplet(id)} réinitialisé`, patronId(), id);
  notifier(id, 'SMS · PIN provisoire', `Ton nouveau PIN est ${pin}. Change-le à la prochaine connexion.`, undefined, 'sms');
  return { ok: true, pin, message: `PIN provisoire envoyé à ${p.prenom} par SMS (simulé)` };
}

// ------------------------------------------------------------------ prix proposé par l'assistant
/** Applique un prix aux prochains départs d'une ligne à une heure donnée (ceux qui ne sont pas encore partis). Les billets déjà vendus gardent leur prix. */
export function appliquerPrix(ligneId: string, heure: string, prix: number): Resultat & { departs?: number } {
  const ligne = app.monde.lignes.find((l) => l.id === ligneId);
  if (!ligne) return refus('ligne_inconnue');
  if (!Number.isFinite(prix) || prix <= 0 || prix > 200_000) return refus('Prix invalide');
  const aujourdhuiJour = aujourdhui(), cibles = app.monde.departs.filter((d) => d.ligneId === ligneId && d.heure === heure && d.jour >= aujourdhuiJour && (d.statut === 'prevu' || d.statut === 'embarquement'));
  if (!cibles.length) return refus('Aucun départ à venir à cette heure');
  const avant = Math.round(cibles.reduce((s, d) => s + d.prix, 0) / cibles.length);
  for (const d of cibles) d.prix = prix;
  if (ligne.horaires.length === 1) ligne.prix = prix;
  consigner('tarif', `Prix du ${heure} ${ligne.de} → ${ligne.vers} : ${avant} F → ${prix} F (${cibles.length} départs)`, patronId(), ligneId);
  return { ok: true, departs: cibles.length, message: `${heure} ${ligne.de} → ${ligne.vers} passe à ${prix.toLocaleString('fr-FR')} F sur ${cibles.length} départs` };
}
export function noterQuestion(q: string) {
  const e = etatAssistant();
  if (e.questions[0]?.q !== q) e.questions.unshift({ q, ts: maintenant() });
  if (e.questions.length > 20) e.questions.length = 20;
}

// ------------------------------------------------------------------ financement
/** Envoie le dossier de financement d'une offre. Les relevés de caisse sont générés par AfriMove ; le devis du bus reste à ajouter. */
export function envoyerDossier(offreId: string, montant: number, duree: number): Resultat & { dossier?: Dossier } {
  const offre = offreParId(offreId), e = etatFinancement();
  if (!offre) return refus('offre_inconnue');
  const s = simuler(offre, { montant, duree, recetteMensuelle: recetteMensuelleEstimee(contexte()) });
  if (s.depasse) return refus(s.raison ?? 'Simulation non valide');
  const encours = e.dossiers.find((d) => d.offreId === offreId && d.etape < ETAPES_DOSSIER.length - 1);
  if (encours) return { ok: true, dossier: encours, message: 'Un dossier est déjà en cours pour cette offre' };
  const now = maintenant(), n = 7731 + e.dossiers.length;
  const dossier: Dossier = { id: `D-${n}`, offreId, montant: s.montant, duree: s.duree, apport: s.apport, finance: s.finance, mensualite: s.mensualite, creeLe: now, etape: 0, horodatage: [now, null, null, null, null], pieces: Object.fromEntries(offre.piecesRequises.map((k) => [k, k !== 'devis'])) };
  e.dossiers.unshift(dossier);
  consigner('financement', `Dossier ${dossier.id} envoyé · ${offre.nom} · ${s.montant} F`, patronId(), dossier.id);
  const p = patronId(); if (p) notifier(p, `Dossier ${dossier.id} envoyé`, `${offre.nom} · ${offre.par}`, `/financement/demande?dossier=${dossier.id}`, 'financement');
  return { ok: true, dossier, message: `Dossier ${dossier.id} envoyé` };
}
export const dossierParId = (id: string | null) => { const e = etatFinancement(); return e.dossiers.find((d) => d.id === id) ?? e.dossiers[0]; };
export function ajouterPiece(dossierId: string, piece: string): Resultat {
  const d = etatFinancement().dossiers.find((x) => x.id === dossierId);
  if (!d) return refus('dossier_inconnu');
  d.pieces[piece] = true;
  consigner('financement', `Pièce « ${PIECES[piece]?.nom ?? piece} » ajoutée au dossier ${d.id}`, patronId(), d.id);
  return { ok: true, message: 'Pièce ajoutée au dossier' };
}
/** Fait avancer le dossier d'une étape (démonstration : la banque répond). La visite de la gare exige toutes les pièces, le devis du bus compris. */
export function avancerDossier(dossierId: string): Resultat {
  const d = etatFinancement().dossiers.find((x) => x.id === dossierId);
  if (!d) return refus('dossier_inconnu');
  if (d.etape >= ETAPES_DOSSIER.length - 1) return refus('Les fonds sont déjà versés');
  const manque = Object.entries(d.pieces).filter(([, ok]) => !ok).map(([k]) => PIECES[k]?.nom ?? k);
  if (d.etape >= 1 && manque.length) return refus(`Il manque : ${manque.join(', ')}. La banque ne peut pas planifier la visite sans.`);
  d.etape++; d.horodatage[d.etape] = maintenant();
  consigner('financement', `Dossier ${d.id} : ${ETAPES_DOSSIER[d.etape]}`, patronId(), d.id);
  const p = patronId(); if (p) notifier(p, `Dossier ${d.id}`, ETAPES_DOSSIER[d.etape], `/financement/demande?dossier=${d.id}`, 'financement');
  return { ok: true, message: ETAPES_DOSSIER[d.etape] };
}

// ------------------------------------------------------------------ inter-agences
export const conventionDe = (partenaireId: string) => etatInterAgences().conventions.find((c) => c.partenaireId === partenaireId);
/** Propose une convention (brouillon) à une compagnie qui n'en a pas. */
export function proposerConvention(partenaireId: string): Resultat {
  const e = etatInterAgences(), c = app.monde.compagnies.find((x) => x.id === partenaireId);
  if (!c || partenaireId === compagnieDuPatron()) return refus('partenaire_inconnu');
  if (e.conventions.some((x) => x.partenaireId === partenaireId)) return refus('Une convention existe déjà');
  e.conventions.push({ partenaireId, partBetaPct: 60, statut: 'brouillon', duree: 12, renouvellement: ajouterJours(aujourdhui(), 365) });
  consigner('inter-agences', `Convention proposée à ${c.nom}`, patronId(), partenaireId);
  return { ok: true, message: `Brouillon de convention créé avec ${c.nom}` };
}
/** Accepte la demande d'un partenaire : la convention passe en brouillon, à signer. */
export function accepterDemande(partenaireId: string): Resultat {
  const c = conventionDe(partenaireId);
  if (!c || c.statut !== 'demandee') return refus('Pas de demande en attente');
  c.statut = 'brouillon';
  consigner('inter-agences', `Demande de convention acceptée : ${partenaireId}`, patronId(), partenaireId);
  return { ok: true, message: 'Demande acceptée · le brouillon est prêt à être signé' };
}
/** Change la part de Bêta de 5 points, entre 30 et 70 %. Impossible après signature. */
export function changerPart(partenaireId: string, delta: number): Resultat {
  const c = conventionDe(partenaireId);
  if (!c) return refus('convention_inconnue');
  if (c.statut === 'signee' || c.statut === 'active') return refus('Convention signée : les conditions ne changent plus');
  const avant = c.partBetaPct; c.partBetaPct = borner(c.partBetaPct + delta);
  return { ok: c.partBetaPct !== avant, raison: c.partBetaPct === avant ? 'Part limitée entre 30 % et 70 %' : undefined };
}
/** Signature du gérant : tracé au doigt, visage ou simple case d'accord ; la case d'accord est toujours obligatoire. */
export function signerConvention(partenaireId: string, o: { accord: boolean; mode: Signature['mode']; traits?: [number, number][][] }): Resultat {
  const c = conventionDe(partenaireId), moi = personneCourante();
  if (!c || !moi) return refus('convention_inconnue');
  if (c.statut !== 'brouillon') return refus(c.statut === 'demandee' ? 'Accepte d’abord la demande' : 'Déjà signée');
  if (!o.accord) return refus('Coche « J’ai lu et j’accepte » pour signer');
  if (o.mode === 'doigt' && !(o.traits?.some((t) => t.length >= 3))) return refus('Trace ta signature dans le cadre');
  if (o.mode === 'visage' && !moi.visage) return refus('Pas de visage enregistré pour ce compte');
  c.signee = { traits: o.traits ?? [], mode: o.mode, par: moi.id, ts: maintenant() }; c.statut = 'signee';
  consigner('inter-agences', `Convention ${partenaireId} signée par ${nomComplet(moi.id)}`, moi.id, partenaireId);
  return { ok: true, message: 'Convention signée · à envoyer pour contre-signature' };
}
export function envoyerContreSignature(partenaireId: string): Resultat {
  const c = conventionDe(partenaireId), nom = app.monde.compagnies.find((x) => x.id === partenaireId)?.nom ?? partenaireId;
  if (!c || c.statut !== 'signee') return refus('Signe d’abord la convention');
  c.envoyeeLe = maintenant();
  consigner('inter-agences', `Convention envoyée à ${nom} pour contre-signature`, patronId(), partenaireId);
  const p = patronId(); if (p) notifier(p, 'Convention envoyée', `${nom} reçoit la convention par WhatsApp (simulé).`, `/inter-agences/convention?partenaire=${partenaireId}`, 'inter-agences');
  return { ok: true, message: `Envoyée à ${nom} (WhatsApp simulé)` };
}
/** Démonstration : le partenaire contre-signe, la convention devient active. */
export function simulerContreSignature(partenaireId: string): Resultat {
  const c = conventionDe(partenaireId);
  if (!c || c.statut !== 'signee' || !c.envoyeeLe) return refus('Convention non envoyée');
  c.statut = 'active'; c.activeLe = maintenant();
  consigner('inter-agences', `Convention ${partenaireId} contre-signée : active`, undefined, partenaireId);
  return { ok: true, message: 'Contre-signée · la convention est active' };
}
/** Confie un colis non encore parti à un partenaire sous convention active ; la part du partenaire est figée à cet instant. */
export function confierColis(colisId: string, partenaireId: string): Resultat {
  const e = etatInterAgences(), c = conventionDe(partenaireId), colis = app.monde.colis.find((x) => x.id === colisId), nom = app.monde.compagnies.find((x) => x.id === partenaireId)?.nom ?? partenaireId;
  if (!c || c.statut !== 'active') return refus(`Pas de convention active avec ${nom}`);
  if (!colis) return refus('colis_inconnu');
  if (e.liens.some((l) => l.colisId === colisId)) return refus('Colis déjà confié');
  if (colis.statut !== 'cree' && colis.statut !== 'depose') return refus('Ce colis est déjà parti : on ne peut plus le confier');
  const [a, b] = villesDuColis(colis.depart, colis.arrivee);
  if (!couvre(app.monde.lignes, partenaireId, a, b)) return refus(`${nom} ne dessert pas ${a} → ${b}`);
  e.liens.push({ colisId, partenaireId, confieLe: maintenant(), partBetaPct: c.partBetaPct, prix: colis.prix });
  colis.etapes.push({ ts: maintenant(), statut: colis.statut, lieu: `Confié à ${nom} (inter-agences)`, par: patronId() });
  consigner('inter-agences', `Colis ${colis.code} confié à ${nom}`, patronId(), colisId);
  notifier(colis.expediteurId, `Colis ${colis.code}`, `Voyage avec ${nom} : un seul code de suivi.`, '/colis/suivi', 'colis');
  return { ok: true, message: `Colis ${colis.code} confié à ${nom}` };
}
/** Règle le mois : tous les colis non réglés du partenaire sont marqués réglés (MoMo Business, simulé). */
export function reglerPartenaire(partenaireId: string): Resultat & { montant?: number } {
  const e = etatInterAgences(), dus = e.liens.filter((l) => l.partenaireId === partenaireId && !l.regleLe);
  if (!dus.length) return refus('Rien à régler');
  const montant = aRegler(e.liens, partenaireId);
  for (const l of dus) l.regleLe = maintenant();
  consigner('inter-agences', `Règlement de ${montant} F à ${partenaireId} (${dus.length} colis)`, patronId(), partenaireId);
  return { ok: true, montant, message: `${montant.toLocaleString('fr-FR')} F réglés par MoMo Business` };
}

// ------------------------------------------------------------------ historique de démonstration
/** Ajoute l'historique de démonstration (~14 jours de ventes) une seule fois, quand le monde est presque vide. */
export function assurerHistorique(): boolean {
  const e = etatPatron();
  if (e.historique || app.monde.billets.length >= SEUIL_MONDE_VIDE) return false;
  const bilan = genererHistorique(app.monde, { jour: aujourdhui(), now: maintenant() });
  e.historique = { jour: aujourdhui(), billets: bilan.billets };
  return bilan.billets > 0;
}
