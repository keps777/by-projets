import { app, maintenant, mouvement, nouvelId, notifier } from '../../data/store.svelte.ts';
import { jourDe, type Jour } from '../../core/dates.ts';
import { evaluerRetrait, estAtteint, interetsSurMois, MAX_COFFRES, MENSUEL_MIN, moisACrediter, moisDe, montantAuto, partDuMembre, reste, validerCoffre, verifierVersement, type ErreursCoffre, type SaisieCoffre } from '../../core/coffres.ts';
import { POINTS } from '../../core/score.ts';
import type { LigneAvecEffet } from '../../data/paie.ts';
import { ajouterPoints } from '../score/actions.ts';
import { coffres, etatCoffres, trouverCoffre, type Coffre, type OperationCoffre, type TypeOperation } from './etat.ts';

export type Resultat = { ok: true; message: string; points?: number } | { ok: false; erreur: string };
const echec = (erreur: string): Resultat => ({ ok: false, erreur });
const aujourdhui = (): Jour => jourDe(new Date(maintenant()));
const MAX_OPERATIONS = 60;
const f = (n: number) => Math.round(n).toLocaleString('fr-FR');
/** Le coffre dans la tranche inscriptible (actions seulement, jamais depuis un $derived). */
const mutable = (id: string) => etatCoffres().coffres.find((c) => c.id === id);

function noter(c: Coffre, type: TypeOperation, montant: number, note?: string, ts = maintenant()) {
  const o: OperationCoffre = { id: nouvelId('o'), ts, type, montant, note };
  c.operations.unshift(o);
  if (c.operations.length > MAX_OPERATIONS) c.operations.length = MAX_OPERATIONS;
}

/** Points de score pour un versement : une seule fois par mois (+5), pour ne pas « farmer » le score en versant 1 000 chaque jour. */
function pointsDeVersement(mois: string): number {
  const e = etatCoffres();
  if (e.pointsMois === mois) return 0;
  e.pointsMois = mois;
  return ajouterPoints('Versement dans un coffre', POINTS.versementCoffre, 'epargne').reel;
}

/** Versement exceptionnel depuis le solde. */
export function versementExceptionnel(id: string, montant: number): Resultat {
  const c = mutable(id); if (!c) return echec('Coffre introuvable.');
  const probleme = verifierVersement(c, montant, app.solde); if (probleme) return echec(probleme);
  mouvement({ titre: `Coffre ${c.nom}`, sous: 'Épargne', montant: -montant, ini: 'CO', categorie: 'coffre' });
  c.epargne += montant;
  noter(c, 'versement', montant, 'Versement depuis le solde');
  const points = pointsDeVersement(moisDe(aujourdhui()));
  let message = `Versé · ${f(montant)}${points > 0 ? ` · +${points} points` : ''}`;
  if (estAtteint(c.epargne, c.objectif)) {
    notifier({ titre: `Objectif atteint : ${c.nom}`, sous: `${f(c.epargne)} épargnés. Le coffre est débloqué.`, lien: `/coffres/${c.id}` });
    message = `Objectif atteint · ${c.nom}`;
  }
  return { ok: true, message, points };
}

/** Retrait vers le solde : libre si l'objectif est atteint, sinon urgence gratuite (1 par an) puis 2 % de frais. */
export function apercuRetrait(id: string, montant: number) {
  const c = trouverCoffre(id);
  const annee = new Date(maintenant()).getFullYear();
  const urgences = ((app.tranches['coffres'] as { urgences?: number[] } | undefined)?.urgences) ?? [];
  return evaluerRetrait({ epargne: c?.epargne ?? 0, objectif: c?.objectif ?? 0, montant, urgenceDejaUtilisee: urgences.includes(annee) });
}
export function retirer(id: string, montant: number): Resultat {
  const c = mutable(id); if (!c) return echec('Coffre introuvable.');
  const r = apercuRetrait(id, montant);
  if (!r.ok) return echec(r.erreur ?? 'Retrait impossible.');
  if (r.urgenceGratuite) etatCoffres().urgences.push(new Date(maintenant()).getFullYear());
  c.epargne -= montant;
  noter(c, 'retrait', -montant, r.penalite ? `Frais de retrait anticipé : ${f(r.penalite)}` : r.urgenceGratuite ? "Retrait d'urgence gratuit" : 'Objectif atteint');
  mouvement({ titre: `Retrait · ${c.nom}`, sous: r.penalite ? `Coffre · frais ${f(r.penalite)}` : 'Coffre', montant: r.net, ini: 'CO', categorie: 'coffre' });
  notifier({ titre: `Retrait du coffre ${c.nom}`, sous: `${f(r.net)} crédités sur votre solde${r.penalite ? ` (frais ${f(r.penalite)})` : ''}.`, lien: `/coffres/${c.id}` });
  return { ok: true, message: `Retiré · ${f(r.net)}` };
}

export function creerCoffre(genre: string, s: SaisieCoffre): { ok: true; id: string; message: string } | { ok: false; erreurs: ErreursCoffre; erreur?: string } {
  const erreurs = validerCoffre(s);
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  const e = etatCoffres();
  if (e.coffres.length >= MAX_COFFRES) return { ok: false, erreurs: {}, erreur: `Vous avez déjà ${MAX_COFFRES} coffres : c'est le maximum.` };
  const c: Coffre = {
    id: nouvelId('cf'), genre, nom: s.nom.trim(), objectif: Math.round(s.objectif), epargne: 0, mensuel: Math.round(s.mensuel), auto: true, cree: aujourdhui(),
    partage: s.partage, membres: s.partage ? s.membres : 1, interetsMois: moisDe(aujourdhui()), operations: []
  };
  e.coffres.unshift(c);
  const invites = `Invitations envoyées à ${c.membres - 1} proche${c.membres > 2 ? 's' : ''}`;
  if (c.partage) notifier({ titre: `Coffre partagé : ${c.nom}`, sous: `${invites}.`, lien: `/coffres/${c.id}` });
  return { ok: true, id: c.id, message: c.partage ? invites : 'Coffre créé' };
}

export function modifierMensuel(id: string, mensuel: number): Resultat {
  const c = mutable(id); if (!c) return echec('Coffre introuvable.');
  if (!Number.isInteger(mensuel) || mensuel < MENSUEL_MIN) return echec(`Versement minimum : ${f(MENSUEL_MIN)}.`);
  if (mensuel > c.objectif) return echec("Le versement ne peut pas dépasser l'objectif.");
  c.mensuel = mensuel;
  return { ok: true, message: 'Versement mensuel mis à jour' };
}
export function basculerAuto(id: string): Resultat {
  const c = mutable(id); if (!c) return echec('Coffre introuvable.');
  c.auto = !c.auto;
  return { ok: true, message: c.auto ? 'Versement automatique repris' : 'Versement automatique suspendu' };
}
export function supprimerCoffre(id: string): Resultat {
  const e = etatCoffres(); const c = e.coffres.find((x) => x.id === id); if (!c) return echec('Coffre introuvable.');
  if (c.epargne > 0) return echec("Retirez d'abord l'épargne du coffre.");
  e.coffres = e.coffres.filter((x) => x.id !== id);
  return { ok: true, message: 'Coffre supprimé' };
}

/** Intérêts à 3,5 %/an, crédités au début de chaque mois pour le mois écoulé. Rattrape les mois manqués. Renvoie le total crédité. */
export function crediterInterets(now = maintenant()): number {
  const auj = jourDe(new Date(now)); let total = 0;
  for (const c of etatCoffres().coffres) {
    const mois = moisACrediter(c.interetsMois, auj);
    if (!mois.length) continue;
    const r = interetsSurMois(c.epargne, mois.length);
    mois.forEach((m, i) => { if (r.parMois[i] > 0) noter(c, 'interet', r.parMois[i], 'Intérêts 3,5 % / an', Date.parse(`${m}-28T23:00:00`)); });
    c.epargne += r.total; total += r.total; c.interetsMois = mois[mois.length - 1];
  }
  if (total > 0) notifier({ titre: 'Intérêts crédités', sous: `+${f(total)} sur vos coffres (3,5 % par an).`, lien: '/coffres' });
  return total;
}

/** Lignes de prélèvement des coffres pour la paie `paie` (fournies au moteur de paie, voir demarrage.ts). */
export function lignesCoffres(paie: Jour): LigneAvecEffet[] {
  const lignes: LigneAvecEffet[] = [];
  for (const c of coffres()) {
    if (!c.auto || !(c.cree < paie)) continue;
    const total = montantAuto(c.epargne, c.objectif, c.mensuel);
    if (total <= 0) continue;
    const part = partDuMembre(total, c.partage, c.membres);
    const id = c.id; const nom = c.nom;
    lignes.push({
      id: `coffre-${id}`, type: 'coffre', libelle: `Coffre ${nom}`, detail: c.partage ? `Votre part · ${c.membres} membres` : 'Versement automatique', montant: part,
      appliquer: () => {
        const cible = mutable(id); if (!cible) return;
        const verse = Math.min(total, reste(cible.epargne, cible.objectif));
        cible.epargne += verse;
        noter(cible, 'auto', verse, cible.partage ? `Versement automatique · dont ${f(verse - part)} des autres membres` : 'Versement automatique', Date.parse(paie + 'T09:01:00'));
        pointsDeVersement(moisDe(paie));
        if (estAtteint(cible.epargne, cible.objectif)) notifier({ titre: `Objectif atteint : ${cible.nom}`, sous: `${f(cible.epargne)} épargnés. Le coffre est débloqué.`, lien: `/coffres/${cible.id}` });
      },
      reporter: () => notifier({ titre: `Versement reporté : ${nom}`, sous: 'Solde insuffisant le jour de paie. Aucune pénalité.', lien: `/coffres/${id}` })
    });
  }
  return lignes;
}
