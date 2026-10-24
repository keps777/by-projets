// Entrées du score de confiance du financement, lues dans le monde : régularité des recettes, écarts de caisse, ponctualité des départs.
import { ajouterJours } from '../../core/dates.ts';
import type { Contexte } from '../../core/assistantBaisse.ts';
import { derniersJours, fenetre, jourDeTs, total, ventes } from '../../core/indicateurs.ts';
import { garesDe } from '../../core/indicateurs.ts';

export function entreesConfiance(c: Contexte) {
  const v = ventes(c.d, c.compagnieId), jours = derniersJours(ajouterJours(c.jour, -1), 14), debut = jours[0];
  const gares = new Set(garesDe(c.d, c.d.personnes, c.compagnieId));
  const caisses = c.d.caisses.filter((k) => gares.has(k.gareId) && (k.statut === 'fermee' || k.statut === 'validee') && jourDeTs(k.ouvertA) >= debut);
  const lignes = new Set(c.d.lignes.filter((l) => l.compagnieId === c.compagnieId).map((l) => l.id));
  const partis = c.d.departs.filter((d) => lignes.has(d.ligneId) && d.statut !== 'annule' && (d.statut === 'parti' || d.statut === 'arrive'));
  return {
    recettesJour: jours.map((j) => total(fenetre(v, [j]))), ecartsAbs: caisses.reduce((s, k) => s + Math.abs(k.ecart ?? 0), 0),
    recetteCaisses: caisses.reduce((s, k) => s + Math.max(0, (k.attendu ?? 0) - k.fond), 0), departsPartis: partis.length, departsAHeure: partis.filter((d) => d.retardMin === 0).length
  };
}
