// Actions du portail de l'école partenaire : publier la grille de frais, saisir/publier des notes, écrire aux parents.
import { app, maintenant, nouvelId, notifier } from '../../data/store.svelte.ts';
import { lireNote } from '../../core/bulletin.ts';
import { fcfa } from '../../core/money.ts';
import { ecole, type AutreFamille, type Cible, type Ecole, type Evaluation } from '../../screens/ecole/etat.ts';
import { cibleConcerne, ecoleParId } from '../../screens/ecole/actions.ts';

type Res = { ok: true } | { ok: false; erreur: string };
const ko = (erreur: string): { ok: false; erreur: string } => ({ ok: false, erreur });

// ------------------------------------------------------------------ frais
/** Publie la grille : chaque montant doit être un entier de 1 000 à 5 000 000 FCFA. Les plans déjà signés gardent leurs montants. */
export function publierGrille(ecoleId: string, saisie: { niveau: string; montant: string }[]): Res & { erreurs?: Record<string, string> } {
  const ec = ecoleParId(ecoleId); if (!ec) return ko('École introuvable.');
  const erreurs: Record<string, string> = {}; const grille: Ecole['grille'] = [];
  for (const l of saisie) {
    const chiffres = l.montant.replace(/[\s  ]/g, '');
    if (!/^\d+$/.test(chiffres)) { erreurs[l.niveau] = 'Montant invalide'; continue; }
    const m = Number(chiffres);
    if (m < 1_000 || m > 5_000_000) { erreurs[l.niveau] = 'Entre 1 000 et 5 000 000'; continue; }
    grille.push({ niveau: l.niveau, montant: m });
  }
  if (Object.keys(erreurs).length) return { ok: false, erreur: 'Corrigez les montants signalés.', erreurs };
  const changes = grille.filter((g) => ec.grille.find((x) => x.niveau === g.niveau)?.montant !== g.montant);
  ec.grille = grille; ec.grillePubliee = maintenant();
  for (const enf of ecole().enfants.filter((x) => x.ecoleId === ecoleId && changes.some((c) => c.niveau === x.niveau))) {
    notifier({ titre: `${ec.nom} a mis à jour ses frais`, sous: `${enf.prenom} · ${enf.niveau} : ${fcfa(grille.find((g) => g.niveau === enf.niveau)!.montant)} FCFA`, lien: '/ecole/frais' });
  }
  return { ok: true };
}
export function inviterFamilles(ecoleId: string): Res & { nombre?: number } {
  const ec = ecoleParId(ecoleId); if (!ec) return ko('École introuvable.');
  const nombre = Math.max(0, ec.familles - ec.connectees);
  if (!nombre) return ko('Toutes les familles sont déjà connectées.');
  ec.invitees = true; return { ok: true, nombre };
}

export interface FamillePlan { id: string; famille: string; eleve: string; niveau: string; montant: number; duree: number; mensualite: number | null; ts: number; statut: 'actif' | 'termine' }
/** Familles de l'école qui ont choisi un plan AssureMe (celle du compte + les familles d'exemple). */
export function famillesAvecPlan(ecoleId: string): FamillePlan[] {
  const e = ecole(); const nom = app.compte?.nom ?? '';
  const miennes: FamillePlan[] = e.plans.flatMap((p) => p.lignes.filter((l) => l.ecoleId === ecoleId).map((l) => ({
    id: `${p.id}-${l.enfantId}`, famille: `Famille ${nom}`.trim(), eleve: l.eleve, niveau: l.niveau, montant: l.montant, duree: p.duree,
    mensualite: p.capital ? Math.round((p.mensualite * l.montant) / p.total) : null, ts: p.signeLe, statut: p.statut
  })));
  const autres = e.autresFamilles.filter((a: AutreFamille) => a.ecoleId === ecoleId).map((a) => ({ id: a.id, famille: a.famille, eleve: a.eleve, niveau: a.niveau, montant: a.montant, duree: a.duree, mensualite: null, ts: a.ts, statut: 'actif' as const }));
  return [...miennes, ...autres].sort((a, b) => b.ts - a.ts);
}
export const paiementsRecus = (ecoleId: string) => ecole().paiements.filter((p) => p.ecoleId === ecoleId).sort((a, b) => b.ts - a.ts);
export const encaisse = (ec: Ecole) => ec.encaisseBase + paiementsRecus(ec.id).reduce((s, p) => s + p.montant, 0);
export const elevesAM = (ec: Ecole) => ec.elevesAMBase + new Set([...paiementsRecus(ec.id).map((p) => p.eleve)]).size;

// ------------------------------------------------------------------ notes
export const evalsDe = (ecoleId: string, classe: string, matiere: string): Evaluation[] => ecole().evaluations.filter((e) => e.ecoleId === ecoleId && e.classe === classe && e.matiere === matiere);
export const matieresDe = (ecoleId: string, classe: string) => [...new Set(ecole().evaluations.filter((e) => e.ecoleId === ecoleId && e.classe === classe).map((e) => e.matiere))];
export function ajouterEvaluation(ecoleId: string, classe: string, matiere: string, intitule: string): Res & { id?: string } {
  const t = intitule.trim().slice(0, 40);
  if (!t) return ko('Donnez un intitulé à l’évaluation.');
  if (evalsDe(ecoleId, classe, matiere).some((e) => e.intitule.toLowerCase() === t.toLowerCase())) return ko('Cette évaluation existe déjà.');
  const id = nouvelId('ev');
  ecole().evaluations.push({ id, ecoleId, classe, matiere, intitule: t, notes: {}, publie: false });
  return { ok: true, id };
}
export function saisirNote(evalId: string, eleve: string, texte: string) {
  const ev = ecole().evaluations.find((e) => e.id === evalId); if (ev) ev.notes[eleve] = texte;
}
export const notesInvalides = (ev: Evaluation) => Object.entries(ev.notes).filter(([, t]) => lireNote(t).etat === 'invalide').map(([nom]) => nom);
export const notesSaisies = (ev: Evaluation, eleves: string[]) => eleves.filter((n) => lireNote(ev.notes[n]).etat === 'ok').length;

export function publierEvaluation(evalId: string): Res {
  const e = ecole(); const ev = e.evaluations.find((x) => x.id === evalId);
  if (!ev) return ko('Évaluation introuvable.');
  if (ev.publie) return ko('Déjà publié aux parents.');
  const eleves = e.classes[ev.ecoleId]?.[ev.classe] ?? [];
  const mauvaises = notesInvalides(ev);
  if (mauvaises.length) return ko(`Note invalide pour ${mauvaises.join(', ')} : entrez une note de 0 à 20.`);
  if (notesSaisies(ev, eleves) === 0) return ko('Saisissez au moins une note avant de publier.');
  ev.publie = true;
  for (const enf of e.enfants.filter((x) => x.ecoleId === ev.ecoleId && eleves.includes(x.eleve) && lireNote(ev.notes[x.eleve]).etat === 'ok')) {
    notifier({ titre: `Nouvelle note · ${enf.prenom}`, sous: `${ev.matiere} · ${ev.intitule}`, lien: `/ecole/bulletin/${enf.id}` });
  }
  return { ok: true };
}
export function envoyerBulletin(ecoleId: string, eleve: string): Res {
  const e = ecole(); const cle = `${ecoleId}|${eleve}`;
  if (e.bulletinsEnvoyes[cle]) return ko('Bulletin déjà envoyé.');
  e.bulletinsEnvoyes[cle] = maintenant();
  const enf = e.enfants.find((x) => x.ecoleId === ecoleId && x.eleve === eleve);
  if (enf) notifier({ titre: `Bulletin disponible · ${enf.prenom}`, sous: `${ecoleParId(ecoleId)?.nom} · trimestre 1`, lien: `/ecole/bulletin/${enf.id}` });
  return { ok: true };
}

// ------------------------------------------------------------------ messages
export const messagesEnvoyes = (ecoleId: string) => ecole().messages.filter((m) => m.ecoleId === ecoleId && m.sens === 'ecole').sort((a, b) => b.ts - a.ts);
export const messagesRecus = (ecoleId: string) => ecole().messages.filter((m) => m.ecoleId === ecoleId && m.sens === 'famille').sort((a, b) => b.ts - a.ts);
export function envoyerAuxParents(ecoleId: string, cible: Cible, texte: string, libelleCible: string): Res {
  const t = texte.trim();
  if (!t) return ko('Écrivez un message.');
  if (t.length > 480) return ko('Message trop long (480 caractères au plus, 3 SMS).');
  if (!cible.tous && !cible.classe && !cible.eleve) return ko('Choisissez les destinataires.');
  const ec = ecoleParId(ecoleId); if (!ec) return ko('École introuvable.');
  const e = ecole();
  e.messages.push({ id: nouvelId('ms'), ecoleId, ts: maintenant(), sens: 'ecole', de: libelleCible, ini: 'É', texte: t, cible });
  if (e.enfants.some((x) => x.ecoleId === ecoleId && cibleConcerne(cible, x))) {
    notifier({ titre: `Message de ${ec.nom}`, sous: t.length > 80 ? `${t.slice(0, 77)}…` : t, lien: '/ecole' });
  }
  return { ok: true };
}
export const enfantDeEleve = (ecoleId: string, eleve: string) => ecole().enfants.find((x) => x.ecoleId === ecoleId && x.eleve === eleve);
