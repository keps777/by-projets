// Crédit : mensualités, échéancier, part du salaire et décisions. Fonctions pures.
export const PLAFOND_ENDETTEMENT = 0.33;
export const SEUIL_CONFORTABLE = 0.25;

export type Pass = 'essentiel' | 'famille' | 'premium';
export type Niveau = 'START' | 'PLUS' | 'PRO' | 'ELITE';

/** Taux mensuel d'un crédit selon le Pass (Premium : taux réduits) et le niveau (Elite : taux préférentiel). */
export function tauxMensuel(pass: Pass, niveau: Niveau): number {
  const base = pass === 'premium' ? 0.012 : pass === 'famille' ? 0.015 : 0.018;
  return Math.max(0.008, base - (niveau === 'ELITE' ? 0.001 : 0));
}

/** Mensualité constante d'un prêt amorti (hors assurance). Taux nul : capital réparti à parts égales. */
export function mensualite(capital: number, tauxMensuel: number, mois: number): number {
  if (capital <= 0 || mois <= 0) return 0;
  if (tauxMensuel === 0) return capital / mois;
  return (capital * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -mois));
}

export interface LigneEcheancier { n: number; capital: number; frais: number; restant: number }
export function echeancier(capital: number, tauxMensuel: number, mois: number): LigneEcheancier[] {
  const m = mensualite(capital, tauxMensuel, mois);
  const lignes: LigneEcheancier[] = [];
  let restant = capital;
  for (let n = 1; n <= mois; n++) {
    const frais = restant * tauxMensuel;
    const cap = m - frais;
    restant = n === mois ? 0 : Math.max(0, restant - cap);
    lignes.push({ n, capital: cap, frais, restant });
  }
  return lignes;
}
/** Premières lignes, puis la dernière (tableau d'amortissement résumé). */
export function echeancierResume(capital: number, tauxMensuel: number, mois: number, debut = 3) {
  const t = echeancier(capital, tauxMensuel, mois);
  if (t.length <= debut + 1) return t.map((l) => ({ ...l, ellipse: false }));
  return [...t.slice(0, debut).map((l) => ({ ...l, ellipse: false })), { n: 0, capital: 0, frais: 0, restant: 0, ellipse: true }, { ...t[t.length - 1], ellipse: false }];
}
export const coutTotal = (capital: number, tauxMensuel: number, mois: number) => mensualite(capital, tauxMensuel, mois) * mois - capital;

export type EtatPart = 'confortable' | 'limite' | 'trop_lourd';
/** Part du salaire net prélevée par tous les crédits. */
export const partSalaire = (mensualites: number, salaire: number) => (salaire > 0 ? mensualites / salaire : 1);
export function etatPart(part: number): EtatPart {
  return part <= SEUIL_CONFORTABLE + 1e-9 ? 'confortable' : part <= PLAFOND_ENDETTEMENT + 1e-9 ? 'limite' : 'trop_lourd';
}
/** Ce qu'on peut encore prélever chaque mois sans dépasser 33 % du salaire. */
export const capaciteRestante = (salaire: number, dejaPreleve: number) => Math.max(0, Math.floor(salaire * PLAFOND_ENDETTEMENT) - dejaPreleve);

// ------------------------------------------------------------------ niveaux et plafonds
export const SEUILS_NIVEAU: Record<Niveau, number> = { START: 500, PLUS: 600, PRO: 700, ELITE: 800 };
export const NIVEAUX: Niveau[] = ['START', 'PLUS', 'PRO', 'ELITE'];
export function niveauDuScore(score: number): Niveau {
  return score >= 800 ? 'ELITE' : score >= 700 ? 'PRO' : score >= 600 ? 'PLUS' : 'START';
}
export interface Plafonds {
  /** Plafond de crédit personnel (école, équipement…). */
  credit: number;
  /** Plafond d'un crédit véhicule ; 0 : pas encore disponible. */
  auto: number;
  /** Mois d'avance de loyer finançables ; 0 : pas disponible. */
  avanceLoyerMois: number;
  immobilier: boolean;
}
export const PLAFONDS: Record<Niveau, Plafonds> = {
  START: { credit: 500_000, auto: 0, avanceLoyerMois: 0, immobilier: false },
  PLUS: { credit: 2_000_000, auto: 0, avanceLoyerMois: 3, immobilier: false },
  PRO: { credit: 2_000_000, auto: 6_000_000, avanceLoyerMois: 6, immobilier: false },
  ELITE: { credit: 5_000_000, auto: 10_000_000, avanceLoyerMois: 12, immobilier: true }
};
export const DESCRIPTION_NIVEAU: Record<Niveau, string> = {
  START: "Pass, coffres et premier crédit jusqu'à 500 000.",
  PLUS: "Avance de loyer 3 mois et crédit scolaire jusqu'à 2 000 000.",
  PRO: "Crédit auto jusqu'à 6 000 000 et avance de loyer 6 mois.",
  ELITE: 'Crédit immobilier, taux préférentiel et plafonds santé relevés.'
};

// ------------------------------------------------------------------ décision automatique (crédit auto)
export interface EntreeDecision {
  score: number; seuilScore: number;
  salaire: number; mensualiteNouvelle: number; mensualitesExistantes: number;
  employeurPartenaire: boolean; ancienneteAns: number; contratStable: boolean;
  vehiculeControle: boolean; valeurExpertisee?: number; prix: number; financement: number;
}
export interface Controle { id: string; titre: string; tag: string; detail: string; ok: boolean }
export interface Decision { approuve: boolean; controles: Controle[]; motif: string | null }

export function decider(e: EntreeDecision): Decision {
  const part = partSalaire(e.mensualiteNouvelle + e.mensualitesExistantes, e.salaire);
  const pct = Math.round(part * 100);
  const controles: Controle[] = [
    {
      id: 'score', ok: e.score >= e.seuilScore, tag: `SEUIL ${e.seuilScore}`,
      titre: `AssureScore ${e.score} · ${e.score >= e.seuilScore ? 'niveau suffisant' : 'niveau insuffisant'}`,
      detail: e.score >= e.seuilScore
        ? `Votre score dépasse de ${e.score - e.seuilScore} points le seuil. Il se base sur vos paiements à l'heure.`
        : `Il vous manque ${e.seuilScore - e.score} points pour ce financement.`
    },
    {
      id: 'part', ok: part <= PLAFOND_ENDETTEMENT + 1e-9, tag: 'MAX 33 %',
      titre: `Mensualités totales ${pct} % du salaire`,
      detail: `${fcfaBrut(e.mensualiteNouvelle)} pour ce financement + ${fcfaBrut(e.mensualitesExistantes)} déjà prélevés = ${fcfaBrut(e.mensualiteNouvelle + e.mensualitesExistantes)} sur ${fcfaBrut(e.salaire)} de salaire net, plafond de 33 %.`
    },
    {
      id: 'employeur', ok: e.employeurPartenaire && e.contratStable, tag: e.employeurPartenaire ? 'EMPLOYEUR PARTENAIRE' : 'SANS EMPLOYEUR',
      titre: e.employeurPartenaire ? `Employeur partenaire, ${e.ancienneteAns} ans d'ancienneté` : 'Aucun employeur partenaire',
      detail: e.employeurPartenaire ? "L'employeur confirme le contrat et retient les mensualités sur la paie." : "Sans retenue sur salaire, ce financement n'est pas proposé."
    },
    {
      id: 'vehicule', ok: e.vehiculeControle && (e.valeurExpertisee ?? e.prix) >= e.financement, tag: e.vehiculeControle ? 'GARAGE OK' : 'À CONTRÔLER',
      titre: e.vehiculeControle ? 'Véhicule contrôlé, valeur confirmée' : 'Véhicule non contrôlé',
      detail: e.vehiculeControle ? `Expertise du garage partenaire : valeur ${fcfaBrut(e.valeurExpertisee ?? e.prix)}, aucun sinistre déclaré.` : 'Un garage partenaire doit contrôler le véhicule avant tout financement.'
    }
  ];
  const ko = controles.find((c) => !c.ok);
  return { approuve: !ko, controles, motif: ko ? ko.titre : null };
}
const fcfaBrut = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
