/**
 * Le contrat (`PersonneEquipe`) ne porte pas le genre : la planche écrit « guichetière » et « bloquée » pour
 * Marie T. et Pauline N., « guichetier » pour Joseph M. On l'accorde d'après la civilité ou le prénom. Un prénom
 * absent de la liste reste au masculin ; le bon réglage est un champ du contrat (point signalé dans le rapport).
 */
const PRENOMS_FEMININS = new Set([
  "marie",
  "pauline",
  "aïcha",
  "aicha",
  "thérèse",
  "therese",
  "rachel",
  "albertine",
  "esther",
  "christine",
  "sandrine",
  "nadine",
  "josiane",
  "bernadette",
  "florence",
  "grâce",
  "grace",
  "ruth",
  "sylvie",
  "carine",
  "estelle",
  "viviane",
  "clarisse",
  "brigitte",
  "claudine",
  "danielle",
  "éliane",
  "eliane",
  "henriette",
  "jeanne",
  "léa",
  "lea",
  "mireille",
  "patricia",
  "solange",
  "suzanne",
  "yvette",
]);

export function estFeminin(nom: string): boolean {
  const propre = nom.trim();
  if (/^(?:Mme|Mlle)\b/i.test(propre)) return true;
  const prenom = propre.split(/[\s.]+/)[0] ?? "";
  return PRENOMS_FEMININS.has(prenom.toLowerCase());
}
