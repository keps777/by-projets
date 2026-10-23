// Prélèvement des mensualités du crédit auto sur la paie : seulement une fois les clés remises (« rien n'est prélevé avant la livraison »).
import { app } from '../../data/store.svelte.ts';
import { fournirPrelevements } from '../../data/paie.ts';
import { ajouterMois } from '../../core/dates.ts';
import type { TrancheAuto } from './etat.ts';

// Enregistré dès l'import (et non au premier passage connecté) : le socle rattrape les paies manquées avant d'appeler les `demarrage()` suivants.
fournirPrelevements('auto', (paie) => {
  // Lecture seule : ne crée pas la tranche (ce fournisseur peut être appelé depuis un calcul dérivé).
  const t = app.tranches['auto'] as TrancheAuto | undefined;
  if (!t) return [];
  const livrees = new Set(t.dossiers.filter((d) => d.etape === 'livree' && d.creditId).map((d) => d.creditId));
  const quantieme = app.compte?.jourPaie;
  return app.credits
    .filter((c) => c.produit === 'auto' && c.statut === 'actif' && livrees.has(c.id) && c.payees < c.duree && paie >= c.prochaine)
    .map((c) => ({
      id: c.id, type: 'credit' as const, libelle: `Mensualité auto ${c.payees + 1} / ${c.duree}`, detail: c.libelle, montant: c.mensualite,
      appliquer: () => { c.payees++; c.prochaine = ajouterMois(c.prochaine, 1, quantieme); if (c.payees >= c.duree) c.statut = 'termine'; },
      reporter: () => { c.prochaine = ajouterMois(c.prochaine, 1, quantieme); }
    }));
});

/** Rien à lancer : le prélèvement est déjà enregistré à l'import. */
export default function demarrage() {}
