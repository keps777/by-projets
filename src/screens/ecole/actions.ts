// Actions de l'éducation : toute la logique de calcul vient de `core/`, ici on lit/écrit l'état.
import { app, maintenant, mouvement, nouvelId, notifier, totalMensualites } from '../../data/store.svelte.ts';
import { ajouterMois, ecartJours, jourDe, jourLong, prochainePaie, type Jour } from '../../core/dates.ts';
import { aFinancer as montantAFinancer, totalRentree } from '../../core/ecole.ts';
import { dureeAlternative, evaluerPlan, lireCoffreRentree, montantMaxFinancable, TAUX_LANCEMENT, DUREE_MAX, type EntreePlan, type ResultatPlan } from '../../core/ecole-plan.ts';
import { lireNote, synthese, type Synthese } from '../../core/bulletin.ts';
import { fcfa } from '../../core/money.ts';
import { ecole, MAX_ENFANTS, PRIX_SOUTIEN, type Cible, type Demande, type Ecole, type Enfant, type Evaluation, type Plan } from './etat.ts';

export type Resultat<T = undefined> = ({ ok: true } & (T extends undefined ? object : { valeur: T })) | { ok: false; erreur: string };
const ko = (erreur: string): { ok: false; erreur: string } => ({ ok: false, erreur });

// ------------------------------------------------------------------ lectures
export const ecoleParId = (id: string): Ecole | undefined => ecole().ecoles.find((e) => e.id === id);
export const nomEcole = (id: string) => ecoleParId(id)?.nom ?? 'École';
export const enfantParId = (id: string): Enfant | undefined => ecole().enfants.find((e) => e.id === id);
export const fraisDe = (ecoleId: string, niveau: string) => ecoleParId(ecoleId)?.grille.find((g) => g.niveau === niveau)?.montant ?? 0;
export const fraisEnfant = (e: Enfant) => fraisDe(e.ecoleId, e.niveau);
export const classeAffichee = (e: Enfant) => e.classeActuelle ?? e.niveau;

/** Prochain 1er septembre strictement après `now` : la rentrée que la famille prépare. */
export function rentreeCible(now = maintenant()): Jour {
  const j = jourDe(new Date(now)); const a = Number(j.slice(0, 4));
  const s = `${a}-09-01`;
  return s > j ? s : `${a + 1}-09-01`;
}
export const anneeRentree = (rentree: Jour) => Number(rentree.slice(0, 4));
export const anneeScolaire = (rentree: Jour) => `${anneeRentree(rentree)}-${String((anneeRentree(rentree) + 1) % 100).padStart(2, '0')}`;

/** Coffre « Rentrée » : lu en lecture seule dans la tranche `coffres` si elle existe et contient un tel coffre, sinon montant saisi. */
export function coffreRentree(): { montant: number; source: 'coffres' | 'saisi' } {
  const lu = 'coffres' in app.tranches ? lireCoffreRentree(app.tranches.coffres) : null;
  return lu !== null ? { montant: lu, source: 'coffres' } : { montant: ecole().coffreSaisi, source: 'saisi' };
}
export function saisirCoffre(texte: string): Resultat {
  const n = texte.replace(/[^\d]/g, '');
  if (!n) return ko('Entrez un montant en FCFA.');
  const v = Number(n);
  if (v > 50_000_000) return ko('Montant trop élevé.');
  ecole().coffreSaisi = v;
  return { ok: true };
}

export const planDe = (rentree: Jour): Plan | undefined => ecole().plans.find((p) => p.rentree === rentree);
export const planEnCours = (): Plan | undefined => ecole().plans.filter((p) => p.statut === 'actif').sort((a, b) => a.rentree.localeCompare(b.rentree))[0];
export const creditDe = (p: Plan) => app.credits.find((c) => c.id === p.creditId);

export function recap() {
  const e = ecole();
  const inclus = e.enfants.filter((x) => x.inclus);
  const total = totalRentree(inclus.map((x) => ({ montant: fraisEnfant(x), inclus: true })));
  const coffre = coffreRentree();
  const utilise = Math.min(coffre.montant, total);
  return { inclus, total, coffre: coffre.montant, coffreSource: coffre.source, utilise, aFinancer: montantAFinancer(total, coffre.montant) };
}

function entree(duree: number, aFinancer: number): EntreePlan | null {
  const c = app.compte; if (!c) return null;
  return { aFinancer, duree, pass: c.pass, score: app.score.valeur, salaire: c.salaireNet, mensualitesExistantes: totalMensualites() };
}
export interface Simulation { resultat: ResultatPlan; entree: EntreePlan; alternative: number | null; maxFinancable: number }
/** Simule un plan sur `duree` mois pour le récapitulatif actuel : décision (score, 33 %, plafond), durée plus longue proposée si refus. */
export function simuler(duree: number, aFinancer = recap().aFinancer): Simulation | null {
  const en = entree(duree, aFinancer); if (!en) return null;
  const resultat = evaluerPlan(en);
  return { resultat, entree: en, alternative: resultat.approuve ? null : dureeAlternative(en), maxFinancable: montantMaxFinancable(en.salaire, en.mensualitesExistantes, resultat.taux, DUREE_MAX) };
}

// ------------------------------------------------------------------ enfants
export function ajouterEnfant(d: { prenom: string; ecoleId: string; niveau: string; classeActuelle?: string | null }): Resultat<Enfant> {
  const e = ecole(); const prenom = d.prenom.trim().slice(0, 16);
  if (!prenom) return ko('Entrez un prénom.');
  if (e.enfants.length >= MAX_ENFANTS) return ko(`Quatre enfants au maximum.`);
  const ec = ecoleParId(d.ecoleId); if (!ec) return ko('Choisissez une école.');
  if (!ec.grille.some((g) => g.niveau === d.niveau)) return ko(`${ec.nom} n'a pas publié de frais pour ${d.niveau || 'cette classe'}.`);
  if (e.enfants.some((x) => x.prenom.toLowerCase() === prenom.toLowerCase() && x.ecoleId === ec.id)) return ko(`${prenom} est déjà inscrit(e) dans cette école.`);
  if (planDe(rentreeCible())) return ko('Le plan de la rentrée est déjà accepté : on ne peut plus ajouter d’enfant.');
  const enfant: Enfant = { id: nouvelId('e'), prenom, eleve: `${app.compte?.nom ?? ''} ${prenom}`.trim(), ecoleId: ec.id, niveau: d.niveau, classeActuelle: d.classeActuelle ?? null, inclus: true, absences: 0, retards: 0, aJustifier: 0 };
  e.enfants.push(enfant);
  return { ok: true, valeur: e.enfants[e.enfants.length - 1] };
}
export function basculerEnfant(id: string): Resultat {
  const x = enfantParId(id); if (!x) return ko('Enfant introuvable.');
  if (planDe(rentreeCible())) return ko('Le plan de la rentrée est déjà accepté.');
  x.inclus = !x.inclus; return { ok: true };
}

// ------------------------------------------------------------------ plan : acceptation
export const premiereMensualite = (rentree: Jour): Jour => prochainePaie(rentree, app.compte?.jourPaie ?? 28);

/** Répartit `capital` entre les lignes au prorata de leurs frais ; la dernière reçoit le reste (somme exacte). */
export function repartir(capital: number, montants: number[]): number[] {
  const total = montants.reduce((s, m) => s + m, 0); let reste = capital;
  return montants.map((m, i) => { const part = i === montants.length - 1 ? reste : Math.round((capital * m) / (total || 1)); reste -= part; return part; });
}

/** Accepte le plan : décision par `decider()` (33 %), crédit « ecole », frais payés aux écoles le jour de l'accord. */
export function accepterPlan(duree: number): Resultat<Plan> {
  const c = app.compte; if (!c) return ko('Compte introuvable.');
  if (!Number.isInteger(duree) || duree < 1 || duree > DUREE_MAX) return ko('Durée invalide.');
  const rentree = rentreeCible();
  if (planDe(rentree)) return ko(`Un plan existe déjà pour la rentrée ${anneeRentree(rentree)}.`);
  const r = recap();
  if (!r.inclus.length) return ko('Choisissez au moins un enfant.');
  if (r.aFinancer <= 0) return ko('Le coffre couvre déjà les frais : pas de crédit nécessaire.');
  const sim = simuler(duree, r.aFinancer); if (!sim) return ko('Compte introuvable.');
  if (!sim.resultat.approuve) return ko(sim.resultat.motif ?? 'Plan refusé.');
  const now = maintenant(); const aujourdhui = jourDe(new Date(now));
  const debut = premiereMensualite(rentree);
  const credit = { id: nouvelId('c'), produit: 'ecole' as const, libelle: `École · rentrée ${anneeRentree(rentree)}`, capital: r.aFinancer, mensualite: sim.resultat.mensualite, duree, payees: 0, prochaine: debut, statut: 'actif' as const };
  const lignes = r.inclus.map((x) => ({ enfantId: x.id, prenom: x.prenom, eleve: x.eleve, ecoleId: x.ecoleId, ecole: nomEcole(x.ecoleId), niveau: x.niveau, montant: fraisEnfant(x) }));
  const plan: Plan = {
    id: nouvelId('p'), rentree, libelle: credit.libelle, accord: aujourdhui, signeLe: now, signataire: `${c.prenom} ${c.nom}`, lignes, total: r.total, coffre: r.utilise,
    coffreSource: r.coffreSource, capital: r.aFinancer, duree, taux: sim.resultat.taux, tauxLancement: sim.resultat.taux === TAUX_LANCEMENT, mensualite: sim.resultat.mensualite,
    jourPrelevement: c.jourPaie, creditId: credit.id, statut: 'actif'
  };
  app.credits.push(credit);
  const e = ecole(); e.plans.push(plan);
  // Le crédit verse les frais directement aux écoles : le solde du membre ne bouge pas (entrée puis sorties de même total).
  mouvement({ titre: credit.libelle, sous: `Crédit accordé · ${duree} mensualités`, montant: credit.capital, ini: 'CR', categorie: 'ecole', ts: now });
  const parts = repartir(credit.capital, lignes.map((l) => l.montant));
  lignes.forEach((l, i) => {
    if (parts[i] > 0) mouvement({ titre: `Frais payés · ${l.ecole}`, sous: `${l.prenom} · ${l.niveau}`, montant: -parts[i], ini: 'EC', categorie: 'ecole', ts: now + 1000 + i });
    e.paiements.unshift({ id: nouvelId('pa'), ecoleId: l.ecoleId, planId: plan.id, famille: `Famille ${c.nom}`, eleve: l.eleve, objet: `Frais de scolarité ${l.niveau} · rentrée ${anneeRentree(rentree)}`, montant: l.montant, ts: now + i, ref: `AM-${anneeRentree(rentree)}-${plan.id.slice(-4).toUpperCase()}${i + 1}` });
  });
  notifier({ titre: 'Plan de paiement accepté', sous: `${fcfa(totalLignes(lignes))} versés aux écoles · ${fcfa(plan.mensualite)} par mois dès le ${jourLong(debut)}`, lien: '/ecole' });
  return { ok: true, valeur: plan };
}
const totalLignes = (l: { montant: number }[]) => l.reduce((s, x) => s + x.montant, 0);

// ------------------------------------------------------------------ prélèvements sur salaire
export interface EcheanceCredit { credit: (typeof app.credits)[number]; plan: Plan | undefined }
/** Crédits école à prélever à la paie `paie` (échéance atteinte). */
export const creditsEcoleDus = (paie: Jour): EcheanceCredit[] =>
  app.credits.filter((c) => c.produit === 'ecole' && c.statut === 'actif' && c.payees < c.duree && c.prochaine <= paie).map((credit) => ({ credit, plan: ecole().plans.find((p) => p.creditId === credit.id) }));

export function appliquerMensualite({ credit, plan }: EcheanceCredit) {
  const jour = app.compte?.jourPaie ?? 28;
  credit.payees += 1; credit.prochaine = ajouterMois(credit.prochaine, 1, jour);
  if (credit.payees >= credit.duree) {
    credit.statut = 'termine'; if (plan) plan.statut = 'termine';
    notifier({ titre: 'Crédit école soldé', sous: `${credit.libelle} : dernière mensualité prélevée.`, lien: '/ecole' });
  }
}
/** Solde insuffisant : la mensualité est reportée d'un mois, sans pénalité. */
export function reporterMensualite({ credit }: EcheanceCredit) {
  credit.prochaine = ajouterMois(credit.prochaine, 1, app.compte?.jourPaie ?? 28);
  notifier({ titre: 'Mensualité école reportée', sous: 'Solde insuffisant à la paie : reportée d’un mois, sans pénalité.', lien: '/ecole' });
}

// ------------------------------------------------------------------ paiements à l'école, soutien, messages
export const demandesDe = (eleve: string): Demande[] => ecole().demandes.filter((d) => d.eleve === eleve);
export function payerDemande(id: string): Resultat {
  const e = ecole(); const d = e.demandes.find((x) => x.id === id);
  if (!d) return ko('Demande introuvable.');
  if (d.payee) return ko('Déjà payé.');
  if (app.solde < d.montant) return ko(`Solde insuffisant : il manque ${fcfa(d.montant - app.solde)} FCFA.`);
  const nom = app.compte?.nom ?? '';
  mouvement({ titre: d.libelle, sous: nomEcole(d.ecoleId), montant: -d.montant, ini: 'EC', categorie: 'ecole' });
  e.paiements.unshift({ id: nouvelId('pa'), ecoleId: d.ecoleId, planId: null, famille: `Famille ${nom}`.trim(), eleve: d.eleve, objet: d.libelle, montant: d.montant, ts: maintenant(), ref: `AM-${nouvelId('r').slice(-6).toUpperCase()}` });
  d.payee = true;
  notifier({ titre: 'Paiement reçu par l’école', sous: `${d.libelle} · ${fcfa(d.montant)} FCFA · reçu envoyé`, lien: '/ecole' });
  return { ok: true };
}
export const soutienDe = (enfantId: string) => ecole().soutiens.find((s) => s.enfantId === enfantId);
export function reserverSoutien(enfantId: string, creneau: string): Resultat {
  const e = ecole(); const enf = enfantParId(enfantId);
  if (!enf) return ko('Enfant introuvable.');
  const ex = soutienDe(enfantId);
  if (ex) { ex.creneau = creneau; return { ok: true }; }
  if (app.solde < PRIX_SOUTIEN) return ko(`Solde insuffisant : il manque ${fcfa(PRIX_SOUTIEN - app.solde)} FCFA.`);
  mouvement({ titre: `Soutien scolaire · ${enf.prenom}`, sous: '4 séances avec un prof partenaire', montant: -PRIX_SOUTIEN, ini: 'EC', categorie: 'ecole' });
  e.soutiens.push({ id: nouvelId('so'), enfantId, creneau, montant: PRIX_SOUTIEN, ts: maintenant() });
  return { ok: true };
}
/** Un message de l'école (tous les parents, une classe ou un élève) concerne-t-il cet enfant ? La classe vient des listes de l'école. */
export const cibleConcerne = (c: Cible, enf: Enfant) => !!c.tous || c.eleve === enf.eleve || (!!c.classe && c.classe === classeDe(enf.ecoleId, enf.eleve));
export const messagesPour = (enf: Enfant) => ecole().messages.filter((m) => m.ecoleId === enf.ecoleId && (m.sens === 'famille' ? m.cible.eleve === enf.eleve : cibleConcerne(m.cible, enf))).sort((a, b) => a.ts - b.ts);
export function envoyerMessage(enfantId: string, texte: string): Resultat {
  const enf = enfantParId(enfantId); const t = texte.trim();
  if (!enf) return ko('Enfant introuvable.');
  if (!t) return ko('Écrivez un message.');
  if (t.length > 500) return ko('Message trop long (500 caractères au plus).');
  const e = ecole(); const ts = maintenant();
  e.messages.push({ id: nouvelId('ms'), ecoleId: enf.ecoleId, ts, sens: 'famille', de: `Famille ${app.compte?.nom ?? ''}`.trim(), ini: (app.compte?.prenom ?? 'F').slice(0, 1), texte: t, cible: { eleve: enf.eleve } });
  // Accusé de réception de l'école (simulé), comme dans la maquette.
  if (typeof window !== 'undefined') setTimeout(() => e.messages.push({ id: nouvelId('ms'), ecoleId: enf.ecoleId, ts: maintenant(), sens: 'ecole', de: nomEcole(enf.ecoleId), ini: 'É', texte: 'Message reçu. Nous vous répondons dans la journée.', cible: { eleve: enf.eleve } }), 900);
  return { ok: true };
}

// ------------------------------------------------------------------ bulletin
export const evaluationsDe = (ecoleId: string, classe: string): Evaluation[] => ecole().evaluations.filter((e) => e.ecoleId === ecoleId && e.classe === classe);
/** Classe actuelle d'un élève dans les listes de l'école (« 4e B » pour « Ndiba Lisa »). */
export function classeDe(ecoleId: string, eleve: string): string | null {
  const classes = ecole().classes[ecoleId] ?? {};
  return Object.keys(classes).find((c) => classes[c].includes(eleve)) ?? null;
}
export function bulletinDe(enf: Enfant): { classe: string | null; synthese: Synthese } {
  const classe = classeDe(enf.ecoleId, enf.eleve);
  if (!classe) return { classe: null, synthese: { matieres: [], moyenne: null, rang: null, effectif: 0 } };
  return { classe, synthese: synthese(evaluationsDe(enf.ecoleId, classe), enf.eleve, ecole().classes[enf.ecoleId][classe]) };
}
export const bulletinEnvoye = (ecoleId: string, eleve: string) => ecole().bulletinsEnvoyes[`${ecoleId}|${eleve}`];

// ------------------------------------------------------------------ alertes
export interface Alerte { id: string; ton: 'danger' | 'alerte' | 'primaire' | 'bon'; titre: string; sous: string; lien?: string }
export function alertes(now = maintenant()): Alerte[] {
  const e = ecole(); const res: Alerte[] = [];
  const auj = jourDe(new Date(now));
  for (const credit of app.credits.filter((c) => c.produit === 'ecole' && c.statut === 'actif')) {
    const jours = ecartJours(auj, credit.prochaine);
    if (jours >= 0 && jours <= 10 && app.solde < credit.mensualite) res.push({ id: `solde-${credit.id}`, ton: 'danger', titre: 'Solde faible avant la mensualité école', sous: `${fcfa(credit.mensualite)} FCFA prélevés le ${jourLong(credit.prochaine)} ; le prélèvement serait reporté d’un mois.` });
  }
  for (const enf of e.enfants) {
    if (enf.aJustifier > 0) res.push({ id: `abs-${enf.id}`, ton: 'alerte', titre: `${enf.prenom} : ${enf.aJustifier} absence à justifier`, sous: 'Justifiez-la auprès de l’école avant vendredi.' });
    const { synthese: s } = bulletinDe(enf);
    const faible = [...s.matieres].map((m) => ({ m, ecart: m.moyenneClasse - m.moyenne })).filter((x) => x.ecart > 0).sort((a, b) => b.ecart - a.ecart)[0];
    if (faible) res.push({ id: `note-${enf.id}`, ton: 'alerte', titre: `${enf.prenom} : ${faible.m.matiere} sous la moyenne de classe`, sous: `${faible.m.moyenne.toFixed(1).replace('.', ',')} contre ${faible.m.moyenneClasse.toFixed(1).replace('.', ',')} : un soutien est conseillé.`, lien: `/ecole/bulletin/${enf.id}` });
  }
  const dus = e.demandes.filter((d) => !d.payee);
  if (dus.length) res.push({ id: 'demandes', ton: 'primaire', titre: `${dus.length} paiement${dus.length > 1 ? 's' : ''} demandé${dus.length > 1 ? 's' : ''} par l’école`, sous: `${fcfa(dus.reduce((s, d) => s + d.montant, 0))} FCFA à régler depuis l’app.` });
  const cible = rentreeCible();
  if (e.enfants.length && !planDe(cible)) res.push({ id: 'rentree', ton: 'primaire', titre: `Préparez la rentrée ${anneeRentree(cible)}`, sous: 'Les frais sont publiés : choisissez comment les payer.', lien: '/ecole/frais' });
  return res;
}
